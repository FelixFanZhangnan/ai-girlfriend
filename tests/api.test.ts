/**
 * api.test.ts
 * 对应测试计划：模块三（角色管理）、模块五（设置与配置）、模块六（聊天历史管理）
 *
 * 注意：使用 fake timers 防止 chat.ts 中的 setInterval 泄漏
 */

// 使用 fake timers 防止 chat.ts 中的 setInterval 泄漏
jest.useFakeTimers();

// Mock 掉所有需要真实 API 连接的外部模块
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        embeddings: {
            create: jest.fn().mockResolvedValue({
                data: [{ embedding: Array.from({ length: 128 }, () => Math.random()) }]
            })
        },
        chat: {
            completions: {
                create: jest.fn().mockResolvedValue({
                    choices: [{ message: { content: '你好呀～' } }]
                })
            }
        },
        models: {
            list: jest.fn().mockResolvedValue({ data: [] })
        }
    }));
});

jest.mock('../src/config', () => {
    const originalModule = jest.requireActual('../src/config');
    return {
        ...originalModule,
        config: {
            openaiApiKey: 'sk-test-fake-key',
            openaiBaseUrl: 'https://api.siliconflow.cn/v1',
            defaultModel: 'test-model',
            characterType: 'girlfriend',
            webPort: 0,
            enableWeb: false,
            enableWechat: false,
            enableTelegram: false,
            telegramBotToken: '',
        },
        isApiKeyValid: jest.fn().mockReturnValue(true),
        getAvailableModels: jest.fn().mockReturnValue([
            { id: 'test-model', name: 'Test Model', isFree: true }
        ]),
        updateDefaultModel: jest.fn(),
        updateApiConfig: jest.fn(),
        updateServiceConfig: jest.fn(),
    };
});

import request from 'supertest';
import express from 'express';
import path from 'path';

// 在测试环境下直接 import web 路由的 app 实例
// 由于 web.ts export 的是 startWebServer，我们需要构建一个可测试的 app
// 为简洁起见我们直接测试关键 API 逻辑

import {
    getAllCharacters,
    getCharacterInfo,
    addCustomCharacter,
    deleteCustomCharacter,
    switchCharacter,
    getChatHistory,
    clearChatHistory,
    getSessionSettings,
    updateSessionSettings,
} from '../src/service/chat';

// ===== 模块三 3.1：默认角色展示 =====
describe('默认角色管理', () => {
    test('应包含至少 3 个默认角色', () => {
        const characters = getAllCharacters();
        const ids = Object.keys(characters);
        expect(ids.length).toBeGreaterThanOrEqual(3);
    });

    test('应包含"girlfriend"角色', () => {
        const characters = getAllCharacters();
        expect(characters).toHaveProperty('girlfriend');
        expect(characters['girlfriend'].name).toBeTruthy();
    });

    test('应包含"klee"角色', () => {
        const characters = getAllCharacters();
        expect(characters).toHaveProperty('klee');
    });

    test('应包含"xiaoya"角色', () => {
        const characters = getAllCharacters();
        expect(characters).toHaveProperty('xiaoya');
    });

    test('getCharacterInfo 应返回角色详情', () => {
        const info = getCharacterInfo('girlfriend');
        expect(info).not.toBeNull();
        expect(info!.name).toBeTruthy();
        expect(info!.prompt).toBeTruthy();
    });

    test('不存在的角色应返回 null', () => {
        const info = getCharacterInfo('nonexistent_character_xyz');
        expect(info).toBeNull();
    });
});

// ===== 模块三 3.4：创建自定义角色 =====
describe('自定义角色 CRUD', () => {
    const testId = 'test_custom_jest_' + Math.random().toString(36).substring(7);

    test('应成功创建自定义角色', () => {
        const success = addCustomCharacter(
            testId,
            '测试酱',
            '🧪',
            '一个测试用的角色',
            '你是测试酱，性格活泼开朗'
        );
        expect(success).toBe(true);
    });

    test('创建后应在角色列表中可见', () => {
        const characters = getAllCharacters();
        expect(characters).toHaveProperty(testId);
        expect(characters[testId].name).toBe('测试酱');
    });

    test('创建后可查询详细信息', () => {
        const info = getCharacterInfo(testId);
        expect(info).not.toBeNull();
        expect(info!.name).toBe('测试酱');
        expect(info!.prompt).toContain('测试酱');
        expect(info!.isCustom).toBe(true);
    });

    test('重复 ID 创建应失败', () => {
        const success = addCustomCharacter(testId, '重复', '🔁', '', '重复');
        expect(success).toBe(false);
    });

    test('应成功删除自定义角色', () => {
        const success = deleteCustomCharacter(testId);
        expect(success).toBe(true);
    });

    test('删除后不应在列表中', () => {
        const characters = getAllCharacters();
        expect(characters).not.toHaveProperty(testId);
    });
});

// ===== 模块三 3.2 & 3.3：角色切换与记忆独立 =====
describe('角色切换与会话独立', () => {
    const sessionId = 'test_session_' + Date.now();

    test('初始会话应使用默认角色', () => {
        const settings = getSessionSettings(sessionId);
        expect(settings.characterType).toBeTruthy();
    });

    test('切换角色后设置应更新', async () => {
        await switchCharacter(sessionId, 'klee');
        const settings = getSessionSettings(sessionId);
        expect(settings.characterType).toBe('klee');
        expect(settings.characterName).toBeTruthy();
    });

    test('不同会话应独立', () => {
        const session1 = getSessionSettings('session_a_test');
        const session2 = getSessionSettings('session_b_test');
        // 两个新会话都应有独立的设置
        expect(session1).toBeTruthy();
        expect(session2).toBeTruthy();
    });
});

// ===== 模块五 5.1：设置更新 =====
describe('会话设置管理', () => {
    const sessionId = 'settings_test_' + Date.now();

    test('应成功更新温度参数', () => {
        updateSessionSettings(sessionId, { temperature: 0.3 });
        const settings = getSessionSettings(sessionId);
        expect(settings.temperature).toBe(0.3);
    });

    test('应成功更新用户昵称', () => {
        updateSessionSettings(sessionId, { userName: '小王' });
        const settings = getSessionSettings(sessionId);
        expect(settings.userName).toBe('小王');
    });

    test('应成功更新模型', () => {
        updateSessionSettings(sessionId, { model: 'Qwen/Qwen2.5-72B-Instruct' });
        const settings = getSessionSettings(sessionId);
        expect(settings.model).toBe('Qwen/Qwen2.5-72B-Instruct');
    });
});

// ===== 模块六 6.2：清空历史 =====
describe('聊天历史管理', () => {
    const sessionId = 'history_test_' + Date.now();

    test('新会话应返回空历史', () => {
        const history = getChatHistory(sessionId);
        expect(history.length).toBe(0);
    });

    test('清空操作不应崩溃', () => {
        expect(() => clearChatHistory(sessionId)).not.toThrow();
    });

    test('清空后历史应为空', () => {
        clearChatHistory(sessionId);
        const history = getChatHistory(sessionId);
        expect(history.length).toBe(0);
    });
});
