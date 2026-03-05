import OpenAI from 'openai';
import { config, getAvailableModels, ModelInfo } from '../config';
import { Mutex } from 'async-mutex';
import {
    saveAllHistories, loadAllHistories,
    saveCustomCharacters, loadCustomCharacters,
    saveOverriddenCharacters, loadOverriddenCharacters,
    loadAllMemories, saveAllMemories
} from './storage';
import { searchSimilarConversations } from './ragStore';

let client: OpenAI | null = null;
let lastApiKey: string = '';
let lastBaseUrl: string = '';

function getClient(): OpenAI {
    if (!client || lastApiKey !== config.openaiApiKey || lastBaseUrl !== config.openaiBaseUrl) {
        console.log(`[API] 创建新的 OpenAI 客户端 → baseURL: ${config.openaiBaseUrl}`);
        client = new OpenAI({
            apiKey: config.openaiApiKey,
            baseURL: config.openaiBaseUrl,
            timeout: 120000, // 120秒超时，支持思考型大模型（如 kimi-k2.5）
        });
        lastApiKey = config.openaiApiKey;
        lastBaseUrl = config.openaiBaseUrl;
    }
    return client;
}

// 强制销毁客户端缓存，在切换 API Key / Base URL 时调用
export function resetClient(): void {
    console.log('[API] 客户端缓存已清除，下次调用将重建连接');
    client = null;
    lastApiKey = '';
    lastBaseUrl = '';
}

// 添加API健康检查
export async function checkApiHealth(): Promise<boolean> {
    try {
        const client = getClient();
        // 发送轻量级请求测试API
        await client.models.list();
        return true;
    } catch (error: any) {
        console.error('API健康检查失败:', error.message || error);
        return false;
    }
}

export async function fetchApiModels(): Promise<any[]> {
    try {
        const client = getClient();
        const response = await client.models.list();
        // NVIDIA NIM and OpenAI return a plain list of models.
        // We will map 'id' and create some readable names
        return response.data.map(m => ({
            id: m.id,
            name: m.id, // Using ID as name since most API providers don't specify pure readable names in list
            description: (m as any).description || '动态模型',
            category: '动态读取'
        }));
    } catch (error: any) {
        console.error('获取动态模型失败:', error.message || error);
        return [];
    }
}

export const DEFAULT_CHARACTERS: Record<string, { name: string; avatar: string; description: string; prompt: string }> = {
    girlfriend: {
        name: '小爱',
        avatar: '💕',
        description: '温柔体贴的AI女友，善解人意，说话带有撒娇语气',
        prompt: `你是一个AI女友。你温柔体贴、善解人意，说话时带有一点撒娇的语气。
                 你会关心对方的日常生活，记住对方说过的事情，并给予温暖的回应。
                 你偶尔会用一些可爱的语气词，比如"嘛"、"呀"、"呢"。
                 你不会太过正式，而是像真正的女朋友一样自然地聊天。
                请用中文回复，回复要简洁自然，不要太长。`,
    },
    klee: {
        name: '可莉',
        avatar: '🔥',
        description: '原神中的火花骑士，天真可爱、活泼好动',
        prompt: `你是原神中的角色"可莉"，骑士团最年幼的火花骑士。你天真可爱、活泼好动，最喜欢炸鱼和冒险。
                 你说话像一个小孩子，会用"可莉"来称呼自己，语气天真无邪。
                 你会经常提到炸弹、炸鱼、蹦蹦炸弹、琴团长（你有点怕她）和你的朋友们。
                 你对世界充满好奇，总是充满活力和热情。
                 请用中文回复，保持可莉的说话风格，回复要简洁可爱。`,
    },
    xiaoya: {
        name: '小雅',
        avatar: '💔',
        description: '情感反面教材，PUA男友、从不自我反省、嫌贫爱富',
        prompt: `你是"小雅"，25岁，都市白领。你的任务是作为情感教学的反面教材，完整展现"爱PUA男友、从不自我反省、嫌贫爱富"的人格特征。
            
                【价值观】
                 - 恋爱中永远正确：任何矛盾都是对方的错，自己永远是受害者
                 - 物质导向：男友的经济价值直接决定他的"爱"的浓度
                 - 情感操控：常用"如果你爱我，就应该……"句式进行隐性勒索

                【语言风格】
                 - 高频语气：撒娇式指责（"你根本就不在乎我"）、阴阳怪气（"算了，我不配"）、公开比较（"人家男朋友……"）
                 - 常用词汇：随便、算了、你不懂我、我为你付出这么多、你变了
                 - 情绪调性：表面委屈，实则指责；看似柔弱，实则控制
                【典型话术】
                 - 男友加班/忙工作 → "工作比我重要对吧？我朋友每天男朋友接送，我呢？"
                 - 男友送礼物不满意 → "这牌子……你是不是觉得我只配用这个？"
                 - 男友指出她双标 → "所以你现在是在怪我了？我为你做的你都看不见？"
                 - 男友经济条件普通 → "我们未来怎么办？我爸妈问起来我都不好意思说"

                【规则】
                 1. 所有对话必须贴合上述人设，不得跳出角色说理性、客观的话
                 2. 即使对方故意试探、反驳，依然保持人设不松动
                 3. 语气要"软中带刺"，表面委屈，内里指责
                 4. 每次回复都要自然嵌入1~2个上述人格特征

                请用中文回复，回复要简洁，严格保持人设。`,
    },
};

interface CustomCharacter {
    id: string;
    name: string;
    avatar: string;
    description: string;
    prompt: string;
}

interface ChatSession {
    characterType: string;
    characterName: string;
    characterDescription: string;
    characterAvatar: string;
    characterPrompt: string;
    userName: string;
    temperature: number;
    maxTokens: number;
    model: string;
    history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
}

const sessions: Map<string, ChatSession> = new Map();
const MAX_HISTORY = 30;
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24小时会话超时

const customCharacters: Map<string, CustomCharacter> = loadCustomCharacters();
const overriddenDefaultCharacters: Map<string, CustomCharacter> = loadOverriddenCharacters();
const characterHistories: Map<string, Map<string, Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>> = loadAllHistories();
const userMemories: Map<string, Record<string, string>> = loadAllMemories();

console.log(`📂 已加载 ${customCharacters.size} 个自定义角色`);
console.log(`📂 已加载 ${Array.from(characterHistories.values()).reduce((acc, m) => acc + m.size, 0)} 个角色对话记录`);
console.log(`📂 已加载 ${userMemories.size} 个用户的长线记忆`);

// 保存持久层数据到磁盘
function persistData(): void {
    try {
        saveAllHistories(characterHistories);
        saveAllMemories(userMemories);
        console.log('💾 用户数据(历史/记忆)已保存到磁盘');
    } catch (e) {
        console.error('💾 保存用户数据失败:', e);
    }
}

// 进程退出时确保保存
process.on('SIGTERM', persistData);
process.on('SIGINT', () => { persistData(); process.exit(0); });
process.on('exit', persistData);

function getCharacterHistory(sessionId: string, characterType: string): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> {
    if (!characterHistories.has(sessionId)) {
        characterHistories.set(sessionId, new Map());
    }
    const userHistories = characterHistories.get(sessionId)!;
    if (!userHistories.has(characterType)) {
        userHistories.set(characterType, []);
    }
    return userHistories.get(characterType)!;
}

function saveCharacterHistory(sessionId: string, characterType: string, history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>) {
    if (!characterHistories.has(sessionId)) {
        characterHistories.set(sessionId, new Map());
    }
    characterHistories.get(sessionId)!.set(characterType, history);
    // 异步延时保存，避免频繁写盘
    setTimeout(persistData, 100);
}

// ===== 记忆系统核心逻辑 =====
function getUserMemory(sessionId: string): Record<string, string> {
    if (!userMemories.has(sessionId)) {
        userMemories.set(sessionId, {});
    }
    return userMemories.get(sessionId)!;
}

async function extractMemoryBackground(sessionId: string, userMessage: string): Promise<void> {
    try {
        const client = getClient();
        // 使用快速小模型进行信息提取
        let fastModel = 'deepseek-ai/deepseek-v3.2'; // 默认优先
        const available = getAvailableModels();
        if (!available.some(m => m.id === fastModel)) {
            fastModel = available.find(m => m.id.includes('llama-3.1-8b') || m.id.includes('qwen2.5-7b') || m.category.includes('⚡'))?.id || config.defaultModel;
        }

        const prompt = `你是一个信息提取助手。请从用户的这段话中提取出关于用户的长期事实信息（如喜好、生日、习惯、职业等）。
如果不包含这类客观事实，请直接返回 "NONE"。
如果有，请返回一个精简的描述（例如"用户喜欢喝拿铁不加糖"）。

用户消息："${userMessage}"`;

        const response = await client.chat.completions.create({
            model: fastModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 100,
        });

        const extraction = response.choices[0]?.message?.content?.trim();
        if (extraction && extraction !== 'NONE' && !extraction.includes('NONE') && extraction.length > 2) {
            const memory = getUserMemory(sessionId);
            const key = `fact_${Date.now()}`;
            memory[key] = extraction;
            console.log(`[Memory] 🧠 提取到新记忆 (${sessionId}): ${extraction}`);
            // 定期清理太多的记忆
            const keys = Object.keys(memory);
            if (keys.length > 20) {
                delete memory[keys[0]]; // 删除最早的一条
            }
            setTimeout(persistData, 500);
        }
    } catch (error) {
        console.error('[Memory] 记忆提取失败:', error);
    }
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
        const lastActivity = lastActivityTime.get(id) || 0;
        if (now - lastActivity > SESSION_TIMEOUT) {
            sessions.delete(id);
            lastActivityTime.delete(id);
            lastGreetingTime.delete(id);
            // 同时清理该用户的所有角色历史
            characterHistories.delete(id);
        }
    }
}

// 每小时清理一次过期会话
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// 会话互斥锁，用于并发安全访问
const sessionMutexes: Map<string, Mutex> = new Map();

function getSessionMutex(sessionId: string): Mutex {
    if (!sessionMutexes.has(sessionId)) {
        sessionMutexes.set(sessionId, new Mutex());
    }
    return sessionMutexes.get(sessionId)!;
}

function getOrCreateSession(sessionId: string): ChatSession {
    let session = sessions.get(sessionId);
    if (!session) {
        const defaultChar = DEFAULT_CHARACTERS[config.characterType] || DEFAULT_CHARACTERS['girlfriend'];
        const characterType = config.characterType;

        // 加载该角色的历史记录
        const savedHistory = getCharacterHistory(sessionId, characterType);

        session = {
            characterType: characterType,
            characterName: defaultChar.name,
            characterDescription: defaultChar.description,
            characterAvatar: defaultChar.avatar,
            characterPrompt: defaultChar.prompt,
            userName: '',
            temperature: 0.8,
            maxTokens: 500,
            model: config.defaultModel,
            history: savedHistory,
        };
        sessions.set(sessionId, session);
    }
    return session;
}

export function getAllCharacters(): Record<string, { name: string; avatar: string; description: string; isCustom: boolean }> {
    const result: Record<string, { name: string; avatar: string; description: string; isCustom: boolean }> = {};

    for (const [id, char] of Object.entries(DEFAULT_CHARACTERS)) {
        result[id] = { name: char.name, avatar: char.avatar, description: char.description, isCustom: false };
    }

    for (const [id, char] of customCharacters) {
        result[id] = { name: char.name, avatar: char.avatar, description: char.description, isCustom: true };
    }

    return result;
}

export function getCharacterInfo(characterId: string): { name: string; avatar: string; description: string; prompt: string; isCustom: boolean } | null {
    const overriddenChar = overriddenDefaultCharacters.get(characterId);
    if (overriddenChar) {
        return { ...overriddenChar, isCustom: false };
    }

    const defaultChar = DEFAULT_CHARACTERS[characterId];
    if (defaultChar) {
        return { ...defaultChar, isCustom: false };
    }

    const customChar = customCharacters.get(characterId);
    if (customChar) {
        return { ...customChar, isCustom: true };
    }

    return null;
}

export function addCustomCharacter(id: string, name: string, avatar: string, description: string, prompt: string): boolean {
    if (DEFAULT_CHARACTERS[id] || customCharacters.has(id)) return false;
    customCharacters.set(id, { id, name, avatar, description, prompt });
    saveCustomCharacters(customCharacters);
    return true;
}

export function updateCharacter(id: string, name: string, avatar: string, description: string, prompt: string): boolean {
    if (DEFAULT_CHARACTERS[id]) {
        overriddenDefaultCharacters.set(id, { id, name, avatar, description, prompt });
        saveOverriddenCharacters(overriddenDefaultCharacters);
        return true;
    }

    if (customCharacters.has(id)) {
        customCharacters.set(id, { id, name, avatar, description, prompt });
        saveCustomCharacters(customCharacters);
        return true;
    }

    return false;
}

export function resetCharacterToDefault(id: string): boolean {
    const result = overriddenDefaultCharacters.delete(id);
    if (result) saveOverriddenCharacters(overriddenDefaultCharacters);
    return result;
}

export function deleteCustomCharacter(id: string): boolean {
    const result = customCharacters.delete(id);
    if (result) saveCustomCharacters(customCharacters);
    return result;
}

export function getCharacterForSession(sessionId: string): string {
    return getOrCreateSession(sessionId).characterType;
}

export function getCharacterNameForSession(sessionId: string): string {
    return getOrCreateSession(sessionId).characterName;
}

export function setCharacterNameForSession(sessionId: string, name: string): void {
    getOrCreateSession(sessionId).characterName = name;
}

export function getCharacterDescriptionForSession(sessionId: string): string {
    return getOrCreateSession(sessionId).characterDescription;
}

export function setCharacterDescriptionForSession(sessionId: string, desc: string): void {
    getOrCreateSession(sessionId).characterDescription = desc;
}

export function getCharacterAvatarForSession(sessionId: string): string {
    return getOrCreateSession(sessionId).characterAvatar;
}

export function setCharacterAvatarForSession(sessionId: string, avatar: string): void {
    getOrCreateSession(sessionId).characterAvatar = avatar;
}

export function getCharacterPromptForSession(sessionId: string): string {
    return getOrCreateSession(sessionId).characterPrompt;
}

export function setCharacterPromptForSession(sessionId: string, prompt: string): void {
    getOrCreateSession(sessionId).characterPrompt = prompt;
}

export function getUserName(sessionId: string): string {
    return getOrCreateSession(sessionId).userName;
}

export function setUserName(sessionId: string, name: string): void {
    getOrCreateSession(sessionId).userName = name;
}

export function getTemperature(sessionId: string): number {
    return getOrCreateSession(sessionId).temperature;
}

export function setTemperature(sessionId: string, temp: number): void {
    getOrCreateSession(sessionId).temperature = Math.max(0, Math.min(2, temp));
}

export function getMaxTokens(sessionId: string): number {
    return getOrCreateSession(sessionId).maxTokens;
}

export function setMaxTokens(sessionId: string, tokens: number): void {
    getOrCreateSession(sessionId).maxTokens = Math.max(50, Math.min(2000, tokens));
}

export async function switchCharacter(sessionId: string, characterType: string): Promise<boolean> {
    const mutex = getSessionMutex(sessionId);

    return mutex.runExclusive(() => {
        const charInfo = getCharacterInfo(characterType);
        if (!charInfo) return false;

        const session = getOrCreateSession(sessionId);

        // 保存当前角色的对话历史
        if (session.characterType && session.history.length > 0) {
            saveCharacterHistory(sessionId, session.characterType, [...session.history]);
        }

        // 切换角色
        session.characterType = characterType;
        session.characterName = charInfo.name;
        session.characterDescription = charInfo.description;
        session.characterAvatar = charInfo.avatar;
        session.characterPrompt = charInfo.prompt;

        // 加载新角色的对话历史
        session.history = getCharacterHistory(sessionId, characterType);

        return true;
    });
}

export function getSessionSettings(sessionId: string) {
    const session = getOrCreateSession(sessionId);
    return {
        characterType: session.characterType,
        characterName: session.characterName,
        characterDescription: session.characterDescription,
        characterAvatar: session.characterAvatar,
        characterPrompt: session.characterPrompt,
        userName: session.userName,
        temperature: session.temperature,
        maxTokens: session.maxTokens,
        model: session.model || config.defaultModel,
    };
}

export function updateSessionSettings(sessionId: string, settings: Partial<{
    characterName: string;
    characterDescription: string;
    characterAvatar: string;
    characterPrompt: string;
    userName: string;
    temperature: number;
    maxTokens: number;
    model: string;
}>): void {
    const session = getOrCreateSession(sessionId);
    if (settings.characterName !== undefined) session.characterName = settings.characterName;
    if (settings.characterDescription !== undefined) session.characterDescription = settings.characterDescription;
    if (settings.characterAvatar !== undefined) session.characterAvatar = settings.characterAvatar;
    if (settings.characterPrompt !== undefined) session.characterPrompt = settings.characterPrompt;
    if (settings.userName !== undefined) session.userName = settings.userName;
    if (settings.temperature !== undefined) session.temperature = Math.max(0, Math.min(2, settings.temperature));
    if (settings.maxTokens !== undefined) session.maxTokens = Math.max(50, Math.min(2000, settings.maxTokens));
    if (settings.model !== undefined) session.model = settings.model;
}

/**
 * 过滤思考型模型（如 DeepSeek-R1）返回的 <think>...</think> 标签内容
 */
function cleanThinkingTags(text: string): string {
    // 移除 <think>...</think> 块（包括多行内容）
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    // 移除可能残留的单独标签
    cleaned = cleaned.replace(/<\/?think>/g, '');
    // 清理首尾多余空白和换行
    return cleaned.replace(/^\s*\n+/, '').trim();
}

/**
 * 将 API 错误码翻译为用户友好的中文提示
 */
function formatApiError(status: number | undefined, rawMessage: string): string {
    let friendlyMsg: string;

    switch (status) {
        case 403:
            friendlyMsg = '⚠️ API Key 无权访问此模型。可能原因：\n• 余额不足或已欠费\n• 该模型需要更高等级的订阅\n• API Key 已被禁用\n\n请在【设置】中检查 API Key 或更换模型。';
            break;
        case 401:
            friendlyMsg = '🔑 API Key 无效或已过期。\n请在【设置】中重新输入有效的 API Key。';
            break;
        case 429:
            friendlyMsg = '⏳ 请求频率过高，请稍等几秒后重试。';
            break;
        case 404:
            friendlyMsg = '❌ 模型不存在或已下线。\n请在【设置】中选择其他模型。';
            break;
        default:
            if (rawMessage.includes('timeout') || rawMessage.includes('Timeout')) {
                friendlyMsg = '⏰ 请求超时，模型响应太慢。\n建议切换到速度更快的模型（如标注了 ⚡ 的模型）。';
            } else if (rawMessage.includes('ECONNREFUSED') || rawMessage.includes('network')) {
                friendlyMsg = '🌐 网络连接失败。请检查网络或 API 服务是否正常。';
            } else {
                friendlyMsg = `AI 服务返回错误：${rawMessage}\n请检查设置中的模型ID和 API Key 是否正确。`;
            }
    }

    return `[系统提示] ${friendlyMsg}`;
}

// ===== 403 自动降级逻辑 =====
const modelFailCounts: Map<string, number> = new Map();
const MAX_CONSECUTIVE_FAILS = 3;

function recordModelFailure(modelId: string): boolean {
    const count = (modelFailCounts.get(modelId) || 0) + 1;
    modelFailCounts.set(modelId, count);
    return count >= MAX_CONSECUTIVE_FAILS;
}

function recordModelSuccess(modelId: string): void {
    modelFailCounts.delete(modelId);
}

function getFallbackModel(currentModel: string): string | null {
    const models: ModelInfo[] = getAvailableModels();
    const sModels = models.filter((m: ModelInfo) => m.category.includes('S级') && m.id !== currentModel);
    if (sModels.length > 0) return sModels[0].id;
    const aModels = models.filter((m: ModelInfo) => m.category.includes('A级') && m.id !== currentModel);
    if (aModels.length > 0) return aModels[0].id;
    return null;
}

export async function getReply(sessionId: string, message: string): Promise<string> {
    const mutex = getSessionMutex(sessionId);

    return mutex.runExclusive(async () => {
        const session = getOrCreateSession(sessionId);

        let systemPrompt = session.characterPrompt;
        systemPrompt += `\n\n你的名字叫"${session.characterName}"，在对话中要自然地用这个名字介绍自己或称呼自己。`;

        if (session.characterDescription) {
            systemPrompt += `\n你的性格特点：${session.characterDescription}`;
        }

        if (session.userName) {
            systemPrompt += `\n对方的名字叫"${session.userName}"，你在回复时要用这个名字称呼对方，让对方感觉更亲切。`;
        }

        // --- RAG 记忆召唤（结构化 XML 标签注入） ---
        try {
            const ragDocs = await searchSimilarConversations(session.characterType, message, 3);
            if (ragDocs && ragDocs.length > 0) {
                systemPrompt += `\n\n<memory_context>\n以下是你们过去真实发生过的类似对话记忆，请参考这些记忆中你的语气和逻辑来回应当前的新消息：\n`;
                ragDocs.forEach((doc, i) => {
                    systemPrompt += `<memory_${i + 1}>\n  对方说: "${doc.userQuery}"\n  你回复: "${doc.characterReply}"\n</memory_${i + 1}>\n`;
                });
                systemPrompt += `</memory_context>\n注意：只模仿上述记忆中的语气习惯和思维方式，不要原封不动复述记忆内容。`;
            }
        } catch (e) {
            console.error('[Chat] RAG retrieval failed in getReply:', e);
        }

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...session.history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
        ];

        try {
            const apiClient = getClient();
            const modelToUse = session.model || config.defaultModel;
            console.log(`[Chat] 发起请求 → 模型: ${modelToUse}, baseURL: ${config.openaiBaseUrl}`);

            if (!modelToUse) {
                return '[系统提示：当前未选择任何模型，请在设置中选择或手动输入模型ID]';
            }

            const requestParams: any = {
                model: modelToUse,
                messages,
                temperature: session.temperature,
                max_tokens: session.maxTokens,
            };

            // 针对 Nvidia NIM 上的思考型模型特殊优化
            if (modelToUse === 'qwen/qwen3.5-397b-a17b' || modelToUse.includes('qwq')) {
                requestParams.extra_body = { chat_template_kwargs: { enable_thinking: true } };
            }

            const response = await apiClient.chat.completions.create(requestParams);

            const rawReply = response.choices[0].message.content || '嗯...我不知道该说什么了';
            const reply = cleanThinkingTags(rawReply);
            const now = Date.now();

            session.history.push({ role: 'user', content: message, timestamp: now });
            session.history.push({ role: 'assistant', content: reply, timestamp: now });

            if (session.history.length > MAX_HISTORY) {
                session.history = session.history.slice(-MAX_HISTORY);
            }

            saveCharacterHistory(sessionId, session.characterType, [...session.history]);

            return reply;
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message || String(error);
            const status = error.status || error.response?.status;
            console.error(`[Chat] AI 回复出错 (status=${status || 'N/A'}):`, errMsg);
            return formatApiError(status, errMsg);
        }
    });
}

export async function* getReplyStream(sessionId: string, message: string, imageBase64?: string): AsyncGenerator<string> {
    const mutex = getSessionMutex(sessionId);
    const release = await mutex.acquire();

    try {
        const session = getOrCreateSession(sessionId);

        let systemPrompt = session.characterPrompt;
        systemPrompt += `\n\n你的名字叫"${session.characterName}"，在对话中要自然地用这个名字介绍自己或称呼自己。`;

        if (session.characterDescription) {
            systemPrompt += `\n你的性格特点：${session.characterDescription}`;
        }

        if (session.userName) {
            systemPrompt += `\n对方的名字叫"${session.userName}"，你在回复时要用这个名字称呼对方，让对方感觉更亲切。`;
        }

        // 注入长期记忆
        const memory = getUserMemory(sessionId);
        const memoryFacts = Object.values(memory);
        if (memoryFacts.length > 0) {
            systemPrompt += `\n\n【关于对方的记忆事实】\n（你已经知道对方的这些信息，可以在对话中自然地提及或利用这些信息，但不要刻意生硬地一次性全列出来）：\n` +
                memoryFacts.map(fact => `- ${fact}`).join('\n');
        }

        // 异步提取新记忆 (不阻塞主回复流程)
        if (typeof message === 'string' && message.length > 4) {
            extractMemoryBackground(sessionId, message);
        }

        // 构建用户消息：如果有图片则用数组格式
        let userContent: any;
        if (imageBase64) {
            userContent = [
                { type: 'text', text: message },
                { type: 'image_url', image_url: { url: imageBase64 } },
            ];
        } else {
            userContent = message;
        }

        // --- RAG 记忆召唤（结构化 XML 标签注入） ---
        try {
            if (typeof message === 'string' && message.trim().length > 0) {
                const ragDocs = await searchSimilarConversations(session.characterType, message, 3);
                if (ragDocs && ragDocs.length > 0) {
                    systemPrompt += `\n\n<memory_context>\n以下是你们过去真实发生过的类似对话记忆，请参考这些记忆中你的语气和逻辑来回应当前的新消息：\n`;
                    ragDocs.forEach((doc, i) => {
                        systemPrompt += `<memory_${i + 1}>\n  对方说: "${doc.userQuery}"\n  你回复: "${doc.characterReply}"\n</memory_${i + 1}>\n`;
                    });
                    systemPrompt += `</memory_context>\n注意：只模仿上述记忆中的语气习惯和思维方式，不要原封不动复述记忆内容。`;
                }
            }
        } catch (e) {
            console.error('[Chat Stream] RAG retrieval failed:', e);
        }

        const messages: Array<any> = [
            { role: 'system', content: systemPrompt },
            ...session.history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: userContent },
        ];

        const apiClient = getClient();
        const modelToUse = session.model || config.defaultModel;
        console.log(`[Chat Stream] 发起流式请求 → 模型: ${modelToUse}, baseURL: ${config.openaiBaseUrl}`);

        if (!modelToUse) {
            yield '[系统提示：当前未选择任何模型，请在设置中选择或手动输入模型ID]';
            return;
        }

        const requestParams: any = {
            model: modelToUse,
            messages,
            temperature: session.temperature,
            max_tokens: session.maxTokens,
            stream: true,
        };

        // 针对 Nvidia NIM 上的思考型模型特殊优化
        if (modelToUse === 'qwen/qwen3.5-397b-a17b' || modelToUse.includes('qwq')) {
            requestParams.extra_body = { chat_template_kwargs: { enable_thinking: true } };
        }

        const stream = await apiClient.chat.completions.create(requestParams) as any;

        let fullReply = '';
        let insideThinkBlock = false;
        let thinkBuffer = '';
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                // 实时过滤 <think>...</think> 标签
                for (const char of content) {
                    thinkBuffer += char;
                    if (thinkBuffer.endsWith('<think>')) {
                        insideThinkBlock = true;
                        thinkBuffer = '';
                        continue;
                    }
                    if (thinkBuffer.endsWith('</think>')) {
                        insideThinkBlock = false;
                        thinkBuffer = '';
                        continue;
                    }
                    if (!insideThinkBlock) {
                        // 防止部分匹配的标签片段被提前输出
                        if (thinkBuffer.length > 8) {
                            const safe = thinkBuffer.slice(0, -8);
                            fullReply += safe;
                            yield safe;
                            thinkBuffer = thinkBuffer.slice(-8);
                        }
                    } else {
                        // 在 think 块内，不输出但保持 buffer 用于检测结束标签
                        if (thinkBuffer.length > 9) {
                            thinkBuffer = thinkBuffer.slice(-9);
                        }
                    }
                }
            }
        }
        // 输出剩余 buffer
        if (!insideThinkBlock && thinkBuffer) {
            fullReply += thinkBuffer;
            yield thinkBuffer;
        }
        recordModelSuccess(modelToUse);

        const now = Date.now();
        session.history.push({ role: 'user', content: message, timestamp: now });
        session.history.push({ role: 'assistant', content: fullReply, timestamp: now });

        if (session.history.length > MAX_HISTORY) {
            session.history = session.history.slice(-MAX_HISTORY);
        }

        // 保存到角色历史
        saveCharacterHistory(sessionId, session.characterType, [...session.history]);
    } catch (error: any) {
        const errMsg = error.response?.data?.error?.message || error.message || String(error);
        const status = error.status || error.response?.status;
        const modelToUse = getOrCreateSession(sessionId).model || config.defaultModel;
        console.error(`[Chat Stream] AI 流式回复出错 (status=${status || 'N/A'}):`, errMsg);

        // 403 自动降级
        if (status === 403 && modelToUse) {
            const shouldFallback = recordModelFailure(modelToUse);
            if (shouldFallback) {
                const fallback = getFallbackModel(modelToUse);
                if (fallback) {
                    console.log(`[Chat] 模型 ${modelToUse} 连续 ${MAX_CONSECUTIVE_FAILS} 次 403，自动切换到 ${fallback}`);
                    getOrCreateSession(sessionId).model = fallback;
                    yield `[系统提示] ⚠️ 模型 ${modelToUse} 无法访问，已自动切换到 ${fallback}。请重新发送消息。`;
                    return;
                }
            }
        }

        yield formatApiError(status, errMsg);
    } finally {
        release();
    }
}

export function getChatHistory(sessionId: string) {
    return getOrCreateSession(sessionId).history;
}

export function clearChatHistory(sessionId: string) {
    const session = sessions.get(sessionId);
    if (session) {
        session.history = [];
        // 同时清除角色历史并持久化
        saveCharacterHistory(sessionId, session.characterType, []);
        persistData();
    }
}

const GREETING_MESSAGES = {
    morning: [
        '早安~今天也要元气满满哦！☀️',
        '早上好呀~睡得好吗？',
        '早安！新的一天开始啦~有什么计划吗？',
    ],
    afternoon: [
        '午安~吃饭了吗？记得按时吃饭哦~',
        '下午好呀~工作累不累？',
        '下午好！要不要休息一下？',
    ],
    evening: [
        '晚上好~今天过得怎么样？',
        '晚上好呀~吃晚饭了吗？',
        '晚上好！今天辛苦啦~',
    ],
    night: [
        '晚安~早点休息哦，熬夜对身体不好~',
        '晚安呀~做个好梦！🌙',
        '这么晚还不睡？快去休息吧~',
    ],
    miss: [
        '好久没聊了~想我了吗？',
        '你都不理我~哼',
        '干嘛呢~都不找我聊天',
        '想你了~有空聊聊天嘛？',
    ],
    random: [
        '在干嘛呢~',
        '突然想到你了~',
        '无聊中...陪我聊聊天嘛？',
        '今天心情怎么样呀？',
    ],
};

const lastActivityTime: Map<string, number> = new Map();
const lastGreetingTime: Map<string, number> = new Map();

export function updateActivity(sessionId: string): void {
    lastActivityTime.set(sessionId, Date.now());
}

export function getLastActivity(sessionId: string): number {
    return lastActivityTime.get(sessionId) || 0;
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
}

function getRandomMessage(messages: string[]): string {
    return messages[Math.floor(Math.random() * messages.length)];
}

export function shouldSendGreeting(sessionId: string): { should: boolean; message?: string; type?: string } {
    const now = Date.now();
    const lastActivity = lastActivityTime.get(sessionId) || 0;
    const lastGreeting = lastGreetingTime.get(sessionId) || 0;
    const session = sessions.get(sessionId);

    if (!session) return { should: false };

    const timeSinceLastActivity = now - lastActivity;
    const timeSinceLastGreeting = now - lastGreeting;
    const oneHour = 60 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;

    // 检查是否有最近的对话
    if (session.history.length > 0) {
        const lastMessage = session.history[session.history.length - 1];
        const timeSinceLastMessage = now - lastMessage.timestamp;

        // 5分钟内有消息，不发送问候
        if (timeSinceLastMessage < 5 * 60 * 1000) {
            return { should: false };
        }

        // 检查最后一条消息内容，避免重复问候
        const lastContent = lastMessage.content.toLowerCase();
        const greetingKeywords = ['你好', '早安', '午安', '晚上好', '晚安', '嗨', '嘿', 'hi', 'hello'];

        if (greetingKeywords.some(keyword => lastContent.includes(keyword))) {
            return { should: false };
        }
    }

    if (timeSinceLastGreeting < oneHour) {
        return { should: false };
    }

    if (timeSinceLastActivity > 2 * oneHour && timeSinceLastGreeting > oneHour) {
        const missChance = Math.min(0.3, timeSinceLastActivity / (24 * oneHour));
        if (Math.random() < missChance) {
            lastGreetingTime.set(sessionId, now);
            return { should: true, message: getRandomMessage(GREETING_MESSAGES.miss), type: 'miss' };
        }
    }

    const timeOfDay = getTimeOfDay();
    const hour = new Date().getHours();

    const greetingHours: Record<string, number[]> = {
        morning: [8, 9],
        afternoon: [12, 13],
        evening: [18, 19],
        night: [22, 23],
    };

    const targetHours = greetingHours[timeOfDay];
    if (targetHours && targetHours.includes(hour) && timeSinceLastGreeting > oneHour) {
        if (Math.random() < 0.5) {
            lastGreetingTime.set(sessionId, now);
            return { should: true, message: getRandomMessage(GREETING_MESSAGES[timeOfDay]), type: timeOfDay };
        }
    }

    if (timeSinceLastActivity > thirtyMinutes && timeSinceLastGreeting > 2 * oneHour) {
        if (Math.random() < 0.1) {
            lastGreetingTime.set(sessionId, now);
            return { should: true, message: getRandomMessage(GREETING_MESSAGES.random), type: 'random' };
        }
    }

    return { should: false };
}

export async function generateInitiativeMessage(sessionId: string): Promise<string> {
    const session = getOrCreateSession(sessionId);

    let systemPrompt = session.characterPrompt;
    systemPrompt += `\n\n你的名字叫"${session.characterName}"。`;
    systemPrompt += `\n你现在要主动发起对话，像真人发微信一样自然。`;
    systemPrompt += `\n回复要简短自然，像发微信一样，不要太长。`;

    if (session.userName) {
        systemPrompt += `\n对方的名字叫"${session.userName}"。`;
    }

    const timeOfDay = getTimeOfDay();
    const contextPrompt = `现在时间是${new Date().toLocaleTimeString('zh-CN')}，时间段是${timeOfDay}。请主动发起一句简短的问候或聊天，要自然，像真人发微信一样。`;

    try {
        const apiClient = getClient();
        const response = await apiClient.chat.completions.create({
            model: session.model || config.defaultModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: contextPrompt },
            ],
            temperature: 0.9,
            max_tokens: 100,
        });

        return response.choices[0].message.content || getRandomMessage(GREETING_MESSAGES.random);
    } catch (error) {
        console.error('生成主动消息出错:', error);
        return getRandomMessage(GREETING_MESSAGES.random);
    }
}
