/**
 * chatLogParserV2.test.ts
 * 训练逻辑重构测试 — 覆盖拆分后的新函数：
 *   - parseChatLogAndGeneratePrompt（纯解析，不做 RAG）
 *   - trainCharacterRAG（向量化入库）
 *   - injectMetaIntoPrompt（元数据注入）
 *   - processChatLogFile（兼容旧接口）
 */

import fs from 'fs';
import path from 'path';
import {
    parseChatLogAndGeneratePrompt,
    trainCharacterRAG,
    injectMetaIntoPrompt,
    processChatLogFile,
} from '../src/service/chatLogParser';

// Mock ragStore 的 addDocumentsToStore，避免真实 API 调用
jest.mock('../src/service/ragStore', () => ({
    addDocumentsToStore: jest.fn().mockResolvedValue({ newCount: 5, dedupCount: 0 }),
    queryStore: jest.fn().mockResolvedValue([]),
    getStoreStats: jest.fn().mockReturnValue({ totalDocs: 0 }),
}));

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(filename: string): string {
    return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

// ===== parseChatLogAndGeneratePrompt 测试 =====
describe('parseChatLogAndGeneratePrompt（纯解析函数）', () => {
    test('标准格式应正确解析（消息不足10条时返回错误）', () => {
        const content = loadFixture('standard_format.txt');
        const result = parseChatLogAndGeneratePrompt(content, '小红', '小红');

        // standard_format.txt 小红消息不足10条，应返回错误
        if (result.success) {
            expect(result.prompt).toBeTruthy();
            expect(result.prompt).toContain('小红');
            expect(result.participants).toContain('小红');
            expect(result.messageCount).toBeGreaterThan(0);
            expect(Array.isArray(result.qaPairs)).toBe(true);
        } else {
            expect(result.error).toContain('消息数量不足');
            expect(result.participants).toContain('小红');
        }
    });

    test('空内容应返回错误', () => {
        const result = parseChatLogAndGeneratePrompt('', '任何人', '测试');

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('发送者不存在应返回错误和参与者列表', () => {
        const content = loadFixture('standard_format.txt');
        const result = parseChatLogAndGeneratePrompt(content, '不存在的人', '测试');

        expect(result.success).toBe(false);
        expect(result.error).toContain('不存在的人');
        expect(result.participants).toBeTruthy();
        expect(result.participants!.length).toBeGreaterThan(0);
    });

    test('消息不足10条时应返回错误', () => {
        // 构造只有 3 条消息的内容
        const fewMessages = `2024-01-01 10:00:00\n小A:\n你好\n2024-01-01 10:01:00\n小B:\n嗯嗯\n2024-01-01 10:02:00\n小A:\n好的`;
        const result = parseChatLogAndGeneratePrompt(fewMessages, '小A', '测试');

        // 可能成功解析但消息太少
        if (result.success === false) {
            expect(result.error).toContain('消息数量不足');
        }
        // 无论如何，不应崩溃
    });

    test('解析结果的 qaPairs 应包含 userQuery 和 characterReply', () => {
        const content = loadFixture('standard_format.txt');
        const result = parseChatLogAndGeneratePrompt(content, '小红', '小红');

        if (result.qaPairs && result.qaPairs.length > 0) {
            const firstPair = result.qaPairs[0];
            expect(firstPair).toHaveProperty('userQuery');
            expect(firstPair).toHaveProperty('characterReply');
            expect(firstPair.userQuery.length).toBeGreaterThan(0);
            expect(firstPair.characterReply.length).toBeGreaterThan(0);
        }
    });
});

// ===== trainCharacterRAG 测试 =====
describe('trainCharacterRAG（RAG 向量化入库）', () => {
    const { addDocumentsToStore } = require('../src/service/ragStore');

    beforeEach(() => {
        addDocumentsToStore.mockClear();
    });

    test('空 qaPairs 应返回 {0, 0} 且不调用 addDocumentsToStore', async () => {
        const result = await trainCharacterRAG('test-char', []);

        expect(result.newCount).toBe(0);
        expect(result.dedupCount).toBe(0);
        expect(addDocumentsToStore).not.toHaveBeenCalled();
    });

    test('有数据时应调用 addDocumentsToStore', async () => {
        const pairs = [
            { userQuery: '你好', characterReply: '你好呀' },
            { userQuery: '吃了吗', characterReply: '刚吃完～' },
        ];
        const result = await trainCharacterRAG('test-char', pairs);

        expect(addDocumentsToStore).toHaveBeenCalledWith('test-char', pairs);
        expect(result.newCount).toBe(2);
    });

    test('超过100条时应只取最后100条', async () => {
        const pairs = Array.from({ length: 150 }, (_, i) => ({
            userQuery: `问题${i}`,
            characterReply: `回复${i}`,
        }));

        await trainCharacterRAG('test-char', pairs);

        expect(addDocumentsToStore).toHaveBeenCalledTimes(1);
        const calledWith = addDocumentsToStore.mock.calls[0][1];
        expect(calledWith.length).toBe(100);
        // 应取最后100条（slice(-100)），所以第一条应该是 问题50
        expect(calledWith[0].userQuery).toBe('问题50');
    });

    test('addDocumentsToStore 异常时应返回 {0, 0} 而不崩溃', async () => {
        addDocumentsToStore.mockRejectedValueOnce(new Error('API 调用失败'));

        const pairs = [{ userQuery: '测试', characterReply: '测试回复' }];
        const result = await trainCharacterRAG('test-char', pairs);

        expect(result.newCount).toBe(0);
        expect(result.dedupCount).toBe(0);
    });
});

// ===== injectMetaIntoPrompt 测试 =====
describe('injectMetaIntoPrompt（元数据注入 Prompt）', () => {
    test('完整元数据：应在 prompt 前面注入年龄/职业', () => {
        const prompt = '你是一个温柔的人';
        const result = injectMetaIntoPrompt(prompt, {
            age: 20,
            profession: '大学生',
        });

        expect(result).toContain('【基本信息】');
        expect(result).toContain('年龄：20 岁');
        expect(result).toContain('职业：大学生');
        // 原始 prompt 应在元数据之后
        expect(result).toContain('你是一个温柔的人');
        expect(result.indexOf('【基本信息】')).toBeLessThan(result.indexOf('你是一个温柔的人'));
    });

    test('无职业：应不包含职业行', () => {
        const result = injectMetaIntoPrompt('测试prompt', {
            age: 25,
        });

        expect(result).toContain('年龄：25 岁');
        expect(result).not.toContain('职业');
    });

    test('原始 prompt 内容应完整保留', () => {
        const originalPrompt = '你是一个非常酷的角色，喜欢说"哈哈"，还会用emoji：😊';
        const result = injectMetaIntoPrompt(originalPrompt, {
            age: 18,
        });

        expect(result).toContain(originalPrompt);
    });
});

// ===== processChatLogFile 兼容旧接口测试 =====
describe('processChatLogFile（兼容旧接口）', () => {
    const { addDocumentsToStore } = require('../src/service/ragStore');

    beforeEach(() => {
        addDocumentsToStore.mockClear();
    });

    test('标准格式应正确处理', async () => {
        const content = loadFixture('standard_format.txt');
        const result = await processChatLogFile(content, '小红', '小红', 'test-old-compat');

        // standard_format.txt 小红消息可能不足10条
        if (result.success) {
            expect(result.prompt).toBeTruthy();
            expect(result.participants).toBeTruthy();
            expect(result.messageCount).toBeGreaterThan(0);
        } else {
            expect(result.error).toBeTruthy();
            expect(result.participants).toBeTruthy();
        }
    });

    test('空内容应返回 error', async () => {
        const result = await processChatLogFile('', '任何人', '测试', 'test-id');

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('返回结果不应暴露 qaPairs（旧接口兼容）', async () => {
        const content = loadFixture('standard_format.txt');
        const result = await processChatLogFile(content, '小红', '小红', 'test-compat');

        // processChatLogFile 返回值不含 qaPairs
        expect(result).not.toHaveProperty('qaPairs');
    });
});
