/**
 * ttsService.ts 测试
 * 覆盖：获取默认声音、修改声音映射、清理文本（去除动作表情标签和markdown）等
 */
import { getVoiceForCharacter, setVoiceForCharacter, DEFAULT_VOICE, CHARACTER_VOICES } from '../src/service/ttsService';

// Mock characterService 使得它不会去读真实的本地 JSON 文件
jest.mock('../src/service/characterService', () => ({
    getCharacterInfo: jest.fn((id: string) => {
        if (id === 'custom_char_1') {
            return { name: '自定义1', voiceId: 'zh-CN-XiaoyiNeural', isCustom: true };
        }
        if (id === 'custom_char_no_voice') {
            return { name: '自定义无声音', isCustom: true };
        }
        return null; // 默认角色没有被持久化的特殊voiceId时
    }),
    updateCharacter: jest.fn(() => true)
}));

describe('ttsService', () => {
    describe('getVoiceForCharacter', () => {
        test('如果角色元信息中有 voiceId，应优先使用', () => {
            const voice = getVoiceForCharacter('custom_char_1');
            expect(voice).toBe('zh-CN-XiaoyiNeural');
        });

        test('如果是硬编码的默认角色，应返回 CHARACTER_VOICES 里的配置', () => {
            const voice = getVoiceForCharacter('klee');
            expect(voice).toBe(CHARACTER_VOICES['klee']);
        });

        test('如果什么都没有，应返回系统默认声音', () => {
            const voice = getVoiceForCharacter('unknown_char_xyz');
            expect(voice).toBe(DEFAULT_VOICE);
        });
    });

    describe('textToSpeech text cleaning logic', () => {
        // 由于 textToSpeech 调用了真实网络，我们提取其中的预处理逻辑来测试是最佳实践。
        // 为了不在单元测试中发送网络请求，我们仅验证在传入空结果时直接返回空 buffer 的短路行为。
        const { textToSpeech } = require('../src/service/ttsService');
        
        test('清理后如果为空文本，应直接返回空 Buffer', async () => {
            const emptyBuf1 = await textToSpeech('   ', DEFAULT_VOICE);
            expect(emptyBuf1.length).toBe(0);

            const emptyBuf2 = await textToSpeech('[happy]', DEFAULT_VOICE); // 被移除后为空
            expect(emptyBuf2.length).toBe(0);
        });
    });

    describe('setVoiceForCharacter', () => {
        test('应更新内存中的CHARACTER_VOICES并尝试持久化更新', () => {
            const result = setVoiceForCharacter('custom_char_1', 'zh-CN-YunxiNeural');
            expect(result).toBe(true);
            expect(CHARACTER_VOICES['custom_char_1']).toBe('zh-CN-YunxiNeural');
        });
    });
});
