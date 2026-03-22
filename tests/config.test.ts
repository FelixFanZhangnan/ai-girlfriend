/**
 * config.ts 测试
 * 覆盖：isAuthRequired、getApiToken、printApiToken
 */

// setup.ts 已设置 process.env, 但我们需要在各测试中隔离修改
const originalEnv = { ...process.env };

afterEach(() => {
    // 恢复环境变量
    process.env = { ...originalEnv };
});

describe('isAuthRequired', () => {
    // 每次重新 require 以重新读取环境变量
    function freshImport() {
        jest.resetModules();
        return require('../src/config');
    }

    test('默认应返回 false（本地项目默认不需要认证）', () => {
        delete process.env.ENABLE_AUTH;
        delete process.env.API_TOKEN;
        const { isAuthRequired } = freshImport();
        expect(isAuthRequired()).toBe(false);
    });

    test('ENABLE_AUTH=true 时应返回 true', () => {
        process.env.ENABLE_AUTH = 'true';
        delete process.env.API_TOKEN;
        const { isAuthRequired } = freshImport();
        expect(isAuthRequired()).toBe(true);
    });

    test('设置了 API_TOKEN 时应返回 true', () => {
        delete process.env.ENABLE_AUTH;
        process.env.API_TOKEN = 'my-custom-token';
        const { isAuthRequired } = freshImport();
        expect(isAuthRequired()).toBe(true);
    });

    test('ENABLE_AUTH=false 且无 API_TOKEN 时应返回 false', () => {
        process.env.ENABLE_AUTH = 'false';
        delete process.env.API_TOKEN;
        const { isAuthRequired } = freshImport();
        expect(isAuthRequired()).toBe(false);
    });
});

describe('getApiToken', () => {
    function freshImport() {
        jest.resetModules();
        return require('../src/config');
    }

    test('设置 API_TOKEN 环境变量时应返回该值', () => {
        process.env.API_TOKEN = 'my-custom-token-123';
        const { getApiToken } = freshImport();
        expect(getApiToken()).toBe('my-custom-token-123');
    });

    test('未设置 API_TOKEN 时应返回空字符串', () => {
        delete process.env.API_TOKEN;
        const { getApiToken } = freshImport();
        expect(getApiToken()).toBe('');
    });
});

describe('getAvailableModels', () => {
    function freshImport() {
        jest.resetModules();
        return require('../src/config');
    }

    test('应返回非空的模型列表', () => {
        const { getAvailableModels } = freshImport();
        const models = getAvailableModels();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);
    });

    test('每个模型应有 id、name、category 字段', () => {
        const { getAvailableModels } = freshImport();
        const models = getAvailableModels();
        for (const model of models) {
            expect(model).toHaveProperty('id');
            expect(model).toHaveProperty('name');
            expect(model).toHaveProperty('category');
            expect(typeof model.id).toBe('string');
            expect(typeof model.name).toBe('string');
        }
    });
});

describe('isApiKeyValid', () => {
    function freshImport() {
        jest.resetModules();
        return require('../src/config');
    }

    test('设置了 API Key 时应返回 true', () => {
        process.env.OPENAI_API_KEY = 'test-key-123';
        const { isApiKeyValid } = freshImport();
        expect(isApiKeyValid()).toBe(true);
    });

    test('空 API Key 时应返回 false', () => {
        process.env.OPENAI_API_KEY = '';
        const { isApiKeyValid } = freshImport();
        expect(isApiKeyValid()).toBe(false);
    });
});
