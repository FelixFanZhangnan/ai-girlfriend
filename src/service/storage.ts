/**
 * 本地持久化存储
 * 将聊天记录、自定义角色等数据保存到本地 JSON 文件
 * 确保服务重启后数据不丢失
 */

import fs from 'fs';
import path from 'path';

// 使用 process.cwd() 确保数据目录在项目根目录下
const DATA_DIR = path.join(process.cwd(), 'data');

// 确保数据目录存在
function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function getFilePath(filename: string): string {
    ensureDataDir();
    return path.join(DATA_DIR, filename);
}

/**
 * 保存数据到 JSON 文件
 */
export function saveJSON(filename: string, data: any): void {
    try {
        const filePath = getFilePath(filename);
        const jsonStr = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonStr, 'utf-8');
    } catch (e) {
        console.error(`保存 ${filename} 失败:`, e);
    }
}

/**
 * 从 JSON 文件加载数据
 */
export function loadJSON<T>(filename: string, defaultValue: T): T {
    try {
        const filePath = getFilePath(filename);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content) as T;
        }
    } catch (e) {
        console.error(`加载 ${filename} 失败:`, e);
    }
    return defaultValue;
}

// ===== 聊天记录持久化 =====

interface PersistedHistoryEntry {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface PersistedHistories {
    [sessionId: string]: {
        [characterType: string]: PersistedHistoryEntry[];
    };
}

const HISTORIES_FILE = 'chat_histories.json';

export function saveAllHistories(
    characterHistories: Map<string, Map<string, PersistedHistoryEntry[]>>
): void {
    const data: PersistedHistories = {};
    for (const [sessionId, charMap] of characterHistories) {
        data[sessionId] = {};
        for (const [charType, history] of charMap) {
            if (history.length > 0) {
                data[sessionId][charType] = history;
            }
        }
    }
    saveJSON(HISTORIES_FILE, data);
}

export function loadAllHistories(): Map<string, Map<string, PersistedHistoryEntry[]>> {
    const data = loadJSON<PersistedHistories>(HISTORIES_FILE, {});
    const result = new Map<string, Map<string, PersistedHistoryEntry[]>>();

    for (const [sessionId, charMap] of Object.entries(data)) {
        const innerMap = new Map<string, PersistedHistoryEntry[]>();
        for (const [charType, history] of Object.entries(charMap)) {
            innerMap.set(charType, history);
        }
        result.set(sessionId, innerMap);
    }

    return result;
}

// ===== 自定义角色持久化 =====

interface PersistedCharacter {
    id: string;
    name: string;
    avatar: string;
    description: string;
    prompt: string;
}

const CUSTOM_CHARS_FILE = 'custom_characters.json';
const OVERRIDDEN_CHARS_FILE = 'overridden_characters.json';

export function saveCustomCharacters(characters: Map<string, PersistedCharacter>): void {
    const data: PersistedCharacter[] = [];
    for (const char of characters.values()) {
        data.push(char);
    }
    saveJSON(CUSTOM_CHARS_FILE, data);
}

export function loadCustomCharacters(): Map<string, PersistedCharacter> {
    const data = loadJSON<PersistedCharacter[]>(CUSTOM_CHARS_FILE, []);
    const result = new Map<string, PersistedCharacter>();
    for (const char of data) {
        result.set(char.id, char);
    }
    return result;
}

export function saveOverriddenCharacters(characters: Map<string, PersistedCharacter>): void {
    const data: PersistedCharacter[] = [];
    for (const char of characters.values()) {
        data.push(char);
    }
    saveJSON(OVERRIDDEN_CHARS_FILE, data);
}

export function loadOverriddenCharacters(): Map<string, PersistedCharacter> {
    const data = loadJSON<PersistedCharacter[]>(OVERRIDDEN_CHARS_FILE, []);
    const result = new Map<string, PersistedCharacter>();
    for (const char of data) {
        result.set(char.id, char);
    }
    return result;
}

// ===== 用户记忆持久化 =====
type UserMemory = Record<string, string>;
interface MemoryData {
    [sessionId: string]: UserMemory;
}
const MEMORY_FILE = 'user_memory.json';

export function loadAllMemories(): Map<string, UserMemory> {
    const data = loadJSON<MemoryData>(MEMORY_FILE, {});
    const result = new Map<string, UserMemory>();
    for (const [sessionId, memory] of Object.entries(data)) {
        result.set(sessionId, memory);
    }
    return result;
}

export function saveAllMemories(memories: Map<string, UserMemory>): void {
    const data: MemoryData = {};
    for (const [sessionId, memory] of memories.entries()) {
        if (Object.keys(memory).length > 0) {
            data[sessionId] = memory;
        }
    }
    saveJSON(MEMORY_FILE, data);
}
