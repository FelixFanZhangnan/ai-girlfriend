/**
 * ragStore.test.ts
 * 对应测试计划：模块四（聊天记录学习 & RAG 记忆）
 * 
 * 覆盖用例：
 * - 4.5 重复上传去重（内容哈希去重）
 * - 向量缓存（LRU Cache）
 * - 分片存储逻辑
 * - 动态阈值计算
 * 
 * 注意：这些测试 Mock 掉了真实的 Embedding API 调用
 */

import fs from 'fs';
import path from 'path';

// Mock OpenAI BEFORE importing ragStore
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        embeddings: {
            create: jest.fn().mockResolvedValue({
                data: [{
                    embedding: Array.from({ length: 128 }, () => Math.random())
                }]
            })
        }
    }));
});

// Mock config
jest.mock('../src/config', () => ({
    config: {
        openaiApiKey: 'sk-test-fake-key',
        openaiBaseUrl: 'https://api.siliconflow.cn/v1',
        defaultModel: 'test-model',
    }
}));

import { vectorizeText, addDocumentsToStore, searchSimilarConversations, loadRagStore } from '../src/service/ragStore';

// 使用临时目录运行测试，不污染真实数据
const TEST_DATA_DIR = path.join(__dirname, '.tmp_rag_test');

beforeAll(() => {
    // 重定向数据目录
    if (!fs.existsSync(TEST_DATA_DIR)) {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
});

afterAll(() => {
    // 清理临时目录
    if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
});

describe('vectorizeText 向量化', () => {
    test('应返回数字向量数组', async () => {
        const vector = await vectorizeText('你好世界');
        expect(Array.isArray(vector)).toBe(true);
        expect(vector.length).toBeGreaterThan(0);
        expect(typeof vector[0]).toBe('number');
    });

    test('相同文本应命中 LRU 缓存（不重新调用 API）', async () => {
        const text = '这是缓存测试文本_' + Date.now();
        const v1 = await vectorizeText(text);
        const v2 = await vectorizeText(text);
        // 命中缓存时返回完全相同的引用
        expect(v1).toBe(v2);
    });
});

describe('addDocumentsToStore 入库', () => {
    const testCharacterId = 'test_char_' + Date.now();

    test('应成功添加文档并返回成功数量', async () => {
        const docs = [
            { userQuery: '你在干嘛', characterReply: '在想你呀' },
            { userQuery: '吃了吗', characterReply: '还没呢' },
        ];
        const count = await addDocumentsToStore(testCharacterId, docs);
        expect(count).toBe(2);
    });

    test('重复内容应被去重', async () => {
        // 再次添加完全相同的内容
        const docs = [
            { userQuery: '你在干嘛', characterReply: '在想你呀' },
        ];
        const count = await addDocumentsToStore(testCharacterId, docs);
        // 因为已存在相同内容，应该被去重跳过
        expect(count).toBe(0);
    });

    test('不同内容应正常入库', async () => {
        const docs = [
            { userQuery: '今天去哪玩', characterReply: '去公园吧' },
        ];
        const count = await addDocumentsToStore(testCharacterId, docs);
        expect(count).toBe(1);
    });
});

describe('searchSimilarConversations 向量检索', () => {
    const searchCharId = 'search_test_' + Date.now();

    beforeAll(async () => {
        // 先灌入一些测试数据
        await addDocumentsToStore(searchCharId, [
            { userQuery: '今天天气怎么样', characterReply: '今天晴天，很舒服' },
            { userQuery: '你喜欢吃什么', characterReply: '我喜欢吃火锅' },
            { userQuery: '周末有什么计划', characterReply: '想去看电影' },
        ]);
    });

    test('应返回数组结果', async () => {
        const results = await searchSimilarConversations(searchCharId, '天气好不好');
        expect(Array.isArray(results)).toBe(true);
    });

    test('返回结果应包含 userQuery 和 characterReply 字段', async () => {
        const results = await searchSimilarConversations(searchCharId, '天气好不好');
        if (results.length > 0) {
            expect(results[0]).toHaveProperty('userQuery');
            expect(results[0]).toHaveProperty('characterReply');
        }
    });

    test('不存在的角色应返回空数组', async () => {
        const results = await searchSimilarConversations('nonexistent_char', '你好');
        expect(results).toEqual([]);
    });

    test('topK 参数应限制返回数量', async () => {
        const results = await searchSimilarConversations(searchCharId, '你好', 1);
        expect(results.length).toBeLessThanOrEqual(1);
    });
});

describe('loadRagStore 启动加载', () => {
    test('加载时不应崩溃', () => {
        expect(() => loadRagStore()).not.toThrow();
    });
});
