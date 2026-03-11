import { loadAllMemories, saveAllMemories } from './storage';
import { getClient } from './chatClient';
import { config, getAvailableModels } from '../config';
import { searchSimilarConversations } from './ragStore';
import type { ChatSession } from './sessionManager'; 

export const userMemories: Map<string, Record<string, string>> = loadAllMemories();
console.log(`📂 已加载 ${userMemories.size} 个用户的长线记忆`);

export function persistMemories() {
    try {
        saveAllMemories(userMemories);
    } catch (e) {
        console.error('💾 保存用户记忆失败:', e);
    }
}

export function cleanupUserMemory(sessionId: string) {
    userMemories.delete(sessionId);
}

// ===== 记忆系统核心逻辑 =====
export function getUserMemory(sessionId: string): Record<string, string> {
    if (!userMemories.has(sessionId)) {
        userMemories.set(sessionId, {});
    }
    return userMemories.get(sessionId)!;
}

export async function extractMemoryBackground(sessionId: string, userMessage: string): Promise<void> {
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
            // 异步延时保存，避免频繁写盘
            setTimeout(persistMemories, 500);
        }
    } catch (error) {
        console.error('[Memory] 记忆提取失败:', error);
    }
}

// ===== 通用 Prompt 构建函数 =====
export async function buildSystemPrompt(sessionId: string, session: ChatSession, message?: string, isInitiative: boolean = false): Promise<string> {
    let systemPrompt = session.characterPrompt;
    systemPrompt += `\n\n你的名字叫"${session.characterName}"`;
    if (isInitiative) {
        systemPrompt += `。`;
        systemPrompt += `\n你现在要主动发起对话，像真人发微信一样自然。`;
        systemPrompt += `\n回复要简短自然，像发微信一样，不要太长。`;
    } else {
        systemPrompt += `，在对话中要自然地用这个名字介绍自己或称呼自己。`;
    }

    if (!isInitiative && session.characterDescription) {
        systemPrompt += `\n你的性格特点：${session.characterDescription}`;
    }

    if (session.userName) {
        if (isInitiative) {
            systemPrompt += `\n对方的名字叫"${session.userName}"。`;
        } else {
            systemPrompt += `\n对方的名字叫"${session.userName}"，你在回复时要用这个名字称呼对方，让对方感觉更亲切。`;
        }
    }

    // 注入长期记忆
    if (!isInitiative) {
        const memory = getUserMemory(sessionId);
        const memoryFacts = Object.values(memory);
        if (memoryFacts.length > 0) {
            systemPrompt += `\n\n【关于对方的记忆事实】\n（你已经知道对方的这些信息，可以在对话中自然地提及或利用这些信息，但不要刻意生硬地一次性全列出来）：\n` +
                memoryFacts.map((fact: string) => `- ${fact}`).join('\n');
        }
    }

    // --- RAG 记忆召唤（结构化 XML 标签注入） ---
    if (!isInitiative && typeof message === 'string' && message.trim().length > 0) {
        try {
            const ragDocs = await searchSimilarConversations(session.characterType, message, 3);
            if (ragDocs && ragDocs.length > 0) {
                systemPrompt += `\n\n<memory_context>\n以下是你们过去真实发生过的类似对话记忆，请参考这些记忆中你的语气和逻辑来回应当前的新消息：\n`;
                ragDocs.forEach((doc: any, i: number) => {
                    systemPrompt += `<memory_${i + 1}>\n  对方说: "${doc.userQuery}"\n  你回复: "${doc.characterReply}"\n</memory_${i + 1}>\n`;
                });
                systemPrompt += `</memory_context>\n注意：只模仿上述记忆中的语气习惯和思维方式，不要原封不动复述记忆内容。`;
            }
        } catch (e) {
            console.error('[Chat] RAG retrieval failed:', e);
        }
    }

    return systemPrompt;
}
