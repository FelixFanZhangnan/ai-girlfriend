/**
 * chatClient.ts 测试
 * 覆盖：cleanThinkingTags、formatApiError、recordModelFailure/Success、getFallbackModel
 */
import { cleanThinkingTags, formatApiError, recordModelFailure, recordModelSuccess, MAX_CONSECUTIVE_FAILS } from '../src/service/chatClient';

describe('cleanThinkingTags', () => {
    test('应移除单行 <think> 标签', () => {
        const input = '<think>这是思考过程</think>你好呀~';
        expect(cleanThinkingTags(input)).toBe('你好呀~');
    });

    test('应移除多行 <think> 块', () => {
        const input = '<think>\n第一行\n第二行\n</think>\n回答内容';
        expect(cleanThinkingTags(input)).toBe('回答内容');
    });

    test('应移除多个 <think> 块', () => {
        const input = '<think>思考1</think>前半段<think>思考2</think>后半段';
        expect(cleanThinkingTags(input)).toBe('前半段后半段');
    });

    test('应移除残留的单独标签', () => {
        expect(cleanThinkingTags('<think>残留')).toBe('残留');
        expect(cleanThinkingTags('文本</think>')).toBe('文本');
    });

    test('无标签时应原样返回', () => {
        expect(cleanThinkingTags('普通文本')).toBe('普通文本');
    });

    test('空文本应返回空字符串', () => {
        expect(cleanThinkingTags('')).toBe('');
    });

    test('只有思考内容时应返回空字符串', () => {
        expect(cleanThinkingTags('<think>全是思考</think>')).toBe('');
    });
});

describe('formatApiError', () => {
    test('401 应提示 Key 无效', () => {
        const msg = formatApiError(401, 'Unauthorized');
        expect(msg).toContain('API Key 无效');
        expect(msg).toContain('[系统提示]');
    });

    test('403 应提示无权访问', () => {
        const msg = formatApiError(403, 'Forbidden');
        expect(msg).toContain('无权访问');
    });

    test('429 应提示频率过高', () => {
        const msg = formatApiError(429, 'Too Many Requests');
        expect(msg).toContain('频率过高');
    });

    test('404 应提示模型不存在', () => {
        const msg = formatApiError(404, 'Not Found');
        expect(msg).toContain('模型不存在');
    });

    test('超时错误应识别 timeout 关键词', () => {
        const msg = formatApiError(undefined, 'Connection timeout');
        expect(msg).toContain('超时');
    });

    test('网络错误应识别 ECONNREFUSED', () => {
        const msg = formatApiError(undefined, 'ECONNREFUSED 127.0.0.1:443');
        expect(msg).toContain('网络连接失败');
    });

    test('其他错误应包含原始消息', () => {
        const msg = formatApiError(500, '服务器内部错误');
        expect(msg).toContain('服务器内部错误');
    });
});

describe('recordModelFailure / recordModelSuccess', () => {
    const testModel = 'test-model-fallback-1';

    beforeEach(() => {
        // 重置计数
        recordModelSuccess(testModel);
    });

    test('第一次失败不应触发降级', () => {
        expect(recordModelFailure(testModel)).toBe(false);
    });

    test(`连续 ${MAX_CONSECUTIVE_FAILS} 次失败应触发降级`, () => {
        for (let i = 0; i < MAX_CONSECUTIVE_FAILS - 1; i++) {
            expect(recordModelFailure(testModel)).toBe(false);
        }
        expect(recordModelFailure(testModel)).toBe(true);
    });

    test('成功后应重置失败计数', () => {
        recordModelFailure(testModel);
        recordModelFailure(testModel);
        recordModelSuccess(testModel);
        // 重置后计数应从 0 开始
        expect(recordModelFailure(testModel)).toBe(false);
    });
});

describe('getFallbackModel', () => {
    // 依赖 config 中的 getAvailableModels，它在测试环境也会加载
    const { getFallbackModel } = require('../src/service/chatClient');

    test('应返回与当前模型不同的备选模型', () => {
        const fallback = getFallbackModel('nonexistent-model-xyz');
        // 应该能找到至少一个模型（config 中预置了很多）
        if (fallback) {
            expect(fallback).not.toBe('nonexistent-model-xyz');
            expect(typeof fallback).toBe('string');
        }
    });
});
