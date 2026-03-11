/**
 * characterMetadata.test.ts
 * 角色元数据（性别/年龄/职业）和训练逻辑重构测试
 *
 * 覆盖用例：
 *   - addCustomCharacter 含 meta 参数
 *   - addCustomCharacter 不含 meta（默认值兼容）
 *   - isCustomCharacter 自定义 vs 默认角色
 *   - getAllCharacters 返回元数据字段
 *   - getCharacterInfo 返回元数据字段
 *   - updateCharacter 保留已有元数据
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

import {
    addCustomCharacter,
    deleteCustomCharacter,
    getAllCharacters,
    getCharacterInfo,
    updateCharacter,
    isCustomCharacter,
    CharacterMeta,
} from '../src/service/chat';

// ===== addCustomCharacter 含元数据 =====
describe('addCustomCharacter 含元数据', () => {
    const testId = 'meta_test_' + Math.random().toString(36).substring(7);

    afterAll(() => {
        deleteCustomCharacter(testId);
    });

    test('应成功创建含完整 meta 的角色', () => {
        const meta: CharacterMeta = {
            age: 20,
            profession: '大学生',
        };
        const success = addCustomCharacter(
            testId, '元数据角色', '💕', '测试用', '你是一个温柔的角色', meta
        );
        expect(success).toBe(true);
    });

    test('getCharacterInfo 应返回正确的 age', () => {
        const info = getCharacterInfo(testId);
        expect(info!.age).toBe(20);
    });

    test('getCharacterInfo 应返回正确的 profession', () => {
        const info = getCharacterInfo(testId);
        expect(info!.profession).toBe('大学生');
    });

    test('getCharacterInfo 应标记为自定义角色', () => {
        const info = getCharacterInfo(testId);
        expect(info!.isCustom).toBe(true);
    });
});

// ===== addCustomCharacter 不含 meta（默认值兼容）=====
describe('addCustomCharacter 不含 meta（向后兼容）', () => {
    const testId = 'nometa_test_' + Math.random().toString(36).substring(7);

    afterAll(() => {
        deleteCustomCharacter(testId);
    });

    test('不传 meta 应成功创建', () => {
        const success = addCustomCharacter(
            testId, '无元数据角色', '🤖', '测试', '你是一个角色'
        );
        expect(success).toBe(true);
    });

    test('age 应默认为 0', () => {
        const info = getCharacterInfo(testId);
        expect(info!.age).toBe(0);
    });

    test('profession 应为 undefined', () => {
        const info = getCharacterInfo(testId);
        expect(info!.profession).toBeUndefined();
    });
});

// ===== isCustomCharacter 测试 =====
describe('isCustomCharacter 判断', () => {
    const customId = 'custom_check_' + Math.random().toString(36).substring(7);

    beforeAll(() => {
        addCustomCharacter(customId, '测试角色', '🧪', '', '测试', {
            age: 25,
        });
    });

    afterAll(() => {
        deleteCustomCharacter(customId);
    });

    test('自定义角色应返回 true', () => {
        expect(isCustomCharacter(customId)).toBe(true);
    });

    test('默认角色 girlfriend 应返回 false', () => {
        expect(isCustomCharacter('girlfriend')).toBe(false);
    });

    test('不存在的角色应返回 false', () => {
        expect(isCustomCharacter('nonexistent_xyz_12345')).toBe(false);
    });
});

// ===== getAllCharacters 含元数据 =====
describe('getAllCharacters 返回元数据字段', () => {
    const testId = 'allchar_meta_' + Math.random().toString(36).substring(7);

    beforeAll(() => {
        addCustomCharacter(testId, '列表测试', '💫', '测试', '测试prompt', {
            age: 22, profession: '程序员',
        });
    });

    afterAll(() => {
        deleteCustomCharacter(testId);
    });

    test('自定义角色条目应含 age 字段', () => {
        const all = getAllCharacters();
        expect(all[testId].age).toBe(22);
    });

    test('自定义角色条目应含 profession 字段', () => {
        const all = getAllCharacters();
        expect(all[testId].profession).toBe('程序员');
    });

    test('默认角色条目不应有 age 字段', () => {
        const all = getAllCharacters();
        expect(all['girlfriend']).toBeDefined();
        expect(all['girlfriend'].age).toBeUndefined();
    });
});

// ===== updateCharacter 保留元数据 =====
describe('updateCharacter 应保留已有元数据', () => {
    const testId = 'update_meta_' + Math.random().toString(36).substring(7);

    beforeAll(() => {
        addCustomCharacter(testId, '更新前', '🔄', '旧描述', '旧prompt', {
            age: 18, profession: '学生',
        });
    });

    afterAll(() => {
        deleteCustomCharacter(testId);
    });

    test('更新后 name 应改变', () => {
        const success = updateCharacter(testId, '更新后', '✨', '新描述', '新prompt');
        expect(success).toBe(true);

        const info = getCharacterInfo(testId);
        expect(info!.name).toBe('更新后');
        expect(info!.prompt).toBe('新prompt');
    });

    test('更新后 age 应保留原值', () => {
        const info = getCharacterInfo(testId);
        expect(info!.age).toBe(18);
    });

    test('更新后 profession 应保留原值', () => {
        const info = getCharacterInfo(testId);
        expect(info!.profession).toBe('学生');
    });
});

// ===== 元数据在默认角色的行为 =====
describe('默认角色的元数据行为', () => {
    test('默认角色 girlfriend 应标记为非自定义', () => {
        const info = getCharacterInfo('girlfriend');
        expect(info).not.toBeNull();
        expect(info!.isCustom).toBe(false);
    });

    test('默认角色 klee 应标记为非自定义', () => {
        const info = getCharacterInfo('klee');
        expect(info).not.toBeNull();
        expect(info!.isCustom).toBe(false);
    });
});
