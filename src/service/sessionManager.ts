import { Mutex } from 'async-mutex';
import { saveAllHistories, loadAllHistories } from './storage';
import { DEFAULT_CHARACTERS, getCharacterInfo } from './characterService';
import { config } from '../config';
import { persistMemories, cleanupUserMemory } from './memoryService';
import { cleanupGreeting } from './greetingService';

export interface ChatSession {
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

export const sessions: Map<string, ChatSession> = new Map();
export const MAX_HISTORY = 30;
export const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24小时会话超时

export const characterHistories: Map<string, Map<string, Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>> = loadAllHistories();
export const lastActivityTime: Map<string, number> = new Map();
export const sessionMutexes: Map<string, Mutex> = new Map();

// 防抖计时器，避免太频繁写盘
let persistTimer: NodeJS.Timeout | null = null;

console.log(`📂 已加载 ${Array.from(characterHistories.values()).reduce((acc, m) => acc + m.size, 0)} 个角色对话记录`);

export function persistData(): void {
    try {
        saveAllHistories(characterHistories);
        persistMemories();
        console.log('💾 用户数据(历史/记忆)已保存到磁盘');
    } catch (e) {
        console.error('💾 保存用户数据失败:', e);
    }
}

// 进程退出时确保保存
process.on('SIGTERM', persistData);
process.on('SIGINT', () => { persistData(); process.exit(0); });
process.on('exit', persistData);

export function getCharacterHistory(sessionId: string, characterType: string): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> {
    if (!characterHistories.has(sessionId)) {
        characterHistories.set(sessionId, new Map());
    }
    const userHistories = characterHistories.get(sessionId)!;
    if (!userHistories.has(characterType)) {
        userHistories.set(characterType, []);
    }
    return userHistories.get(characterType)!;
}

export function saveCharacterHistory(sessionId: string, characterType: string, history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>) {
    if (!characterHistories.has(sessionId)) {
        characterHistories.set(sessionId, new Map());
    }
    characterHistories.get(sessionId)!.set(characterType, history);
    // 异步延时保存，避免频繁写盘（防抖）
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistData();
        persistTimer = null;
    }, 2000);
}

export function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
        const lastActivity = lastActivityTime.get(id) || 0;
        if (now - lastActivity > SESSION_TIMEOUT) {
            sessions.delete(id);
            lastActivityTime.delete(id);
            cleanupGreeting(id);
            // 同时清理该用户的所有角色历史和记忆
            characterHistories.delete(id);
            sessionMutexes.delete(id);
            cleanupUserMemory(id);
        }
    }
}

// 每小时清理一次过期会话
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

export function getSessionMutex(sessionId: string): Mutex {
    if (!sessionMutexes.has(sessionId)) {
        sessionMutexes.set(sessionId, new Mutex());
    }
    return sessionMutexes.get(sessionId)!;
}

export function getOrCreateSession(sessionId: string): ChatSession {
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

export function updateActivity(sessionId: string): void {
    lastActivityTime.set(sessionId, Date.now());
}

export function getLastActivity(sessionId: string): number {
    return lastActivityTime.get(sessionId) || 0;
}
