/**
 * sessionManager.ts 测试
 * 覆盖：会话管理、历史记录维护、角色切换（包括状态隔离）
 */
import { getOrCreateSession, updateActivity, switchCharacter, clearChatHistory } from '../src/service/sessionManager';

// 避免引入真实的 disk IO
jest.mock('../src/service/storage', () => ({
    loadAllHistories: jest.fn(() => new Map()),
    saveAllHistories: jest.fn(),
    loadCustomCharacters: jest.fn(() => new Map()),
    loadOverriddenCharacters: jest.fn(() => new Map()),
    loadAllMemories: jest.fn(() => new Map()),
    saveAllMemories: jest.fn(),
}));

jest.mock('../src/config', () => ({
    config: { defaultModel: 'test-model', characterType: 'girlfriend' }
}));

describe('sessionManager', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        // 因模块内部持有单例 state，测试间最好重置，但只能通过暴露的 API 或直接测其行为
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('getOrCreateSession', () => {
        test('应当为新 sessionId 创建带有默认角色和模型的会话', () => {
            const s = getOrCreateSession('test-session-1');
            expect(s.characterType).toBe('girlfriend'); // 默认角色
            expect(s.model).toBe('test-model');         // mock 中的默认模型
            expect(s.history).toEqual([]);
        });

        test('返回相同的引用，保证单例对话状态', () => {
            const s1 = getOrCreateSession('test-session-1');
            const s2 = getOrCreateSession('test-session-1');
            expect(s1).toBe(s2);
        });
    });

    describe('switchCharacter', () => {
        test('切换角色时应保留独立历史记录并重建上下文', async () => {
            const sid = 'multi-char-session';
            const s = getOrCreateSession(sid);
            
            // 往 girlfriend (默认) 书写历史
            s.history.push({ role: 'user', content: 'hello girlfriend', timestamp: Date.now() });
            expect(s.history.length).toBe(1);

            // 切换为 klee
            const success = await switchCharacter(sid, 'klee');
            expect(success).toBe(true);
            expect(s.characterType).toBe('klee');
            // Klee 应当是全新的历史记录
            expect(s.history).toEqual([]);

            // 向 klee 书写历史
            s.history.push({ role: 'user', content: 'hello klee', timestamp: Date.now() });

            // 切换回 girlfriend
            const backSuccess = await switchCharacter(sid, 'girlfriend');
            expect(backSuccess).toBe(true);
            expect(s.characterType).toBe('girlfriend');
            // girlfriend 的历史应当恢复
            expect(s.history.length).toBe(1);
            expect(s.history[0].content).toBe('hello girlfriend');
        });
    });

    describe('clearChatHistory', () => {
        test('清空当前角色的历史记录', () => {
            const sid = 'clear-test';
            const s = getOrCreateSession(sid);
            s.history.push({ role: 'user', content: 'dump', timestamp: Date.now() });
            expect(s.history.length).toBe(1);

            clearChatHistory(sid);
            expect(s.history.length).toBe(0);
        });
    });
});
