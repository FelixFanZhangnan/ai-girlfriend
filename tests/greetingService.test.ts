/**
 * greetingService.ts 测试
 * 覆盖：shouldSendGreeting 日常问候、时间段判断、频率控制逻辑
 */
import { shouldSendGreeting, cleanupGreeting, lastGreetingTime } from '../src/service/greetingService';
import { lastActivityTime } from '../src/service/sessionManager';

// Mock sessionManager
jest.mock('../src/service/sessionManager', () => {
    const memHistory: any[] = [];
    return {
        getOrCreateSession: jest.fn((sid) => ({
            sessionId: sid,
            history: memHistory
        })),
        lastActivityTime: new Map(),
        // 允许我们在测试里手动操控历史记录
        _setMockHistory: (hist: any[]) => {
            memHistory.length = 0;
            memHistory.push(...hist);
        }
    };
});

// Mock console.error to keep test output clean
jest.spyOn(console, 'error').mockImplementation();

describe('greetingService', () => {
    const sid = 'test-greet';
    const ONE_HOUR = 60 * 60 * 1000;
    
    beforeEach(() => {
        cleanupGreeting(sid);
        lastActivityTime.clear();
        jest.useFakeTimers();
        const { _setMockHistory } = require('../src/service/sessionManager');
        _setMockHistory([]); // 清空历史
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('shouldSendGreeting', () => {
        test('如果 5 分钟内有新消息，绝不发送问候（避免刚聊完就被打扰）', () => {
            // 操控历史记录：刚刚有一条消息
            const { _setMockHistory } = require('../src/service/sessionManager');
            _setMockHistory([{ role: 'user', content: 'test', timestamp: Date.now() - 1000 }]);

            const result = shouldSendGreeting(sid);
            expect(result.should).toBe(false);
        });

        test('如果最后一条消息包含 greeting 关键字，不重复发送问候', () => {
            const { _setMockHistory } = require('../src/service/sessionManager');
            // 10分钟前发了一句“早安”
            _setMockHistory([{ role: 'assistant', content: '早安呀~', timestamp: Date.now() - 10 * 60 * 1000 }]);

            const result = shouldSendGreeting(sid);
            expect(result.should).toBe(false);
        });

        test('1小时内不重复发送问候（全局冷却）', () => {
            const { _setMockHistory } = require('../src/service/sessionManager');
            _setMockHistory([]); // 没有最近消息

            // 设置上次问候时间为半小时前
            lastGreetingTime.set(sid, Date.now() - 30 * 60 * 1000);

            const result = shouldSendGreeting(sid);
            expect(result.should).toBe(false);
        });

        test('时间大于两小时未活动且很久没问候，必定触发想念或日常问候', () => {
            // 设定时间在早上 8 点 (morning triggers)
            jest.setSystemTime(new Date(2024, 0, 1, 8, 30).getTime());
            
            // 设定上次活动是10小时前, 上次问候是5小时前
            lastActivityTime.set(sid, Date.now() - 10 * ONE_HOUR);
            lastGreetingTime.set(sid, Date.now() - 5 * ONE_HOUR);

            // 为了让随机概率必定命中或者直接探测逻辑是否向下走：
            // Math.random 会产生随机数，我们可以 mock 它以强制命中
            const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.01); // 极小的值必定 < 0.3 / 0.5
            
            const result = shouldSendGreeting(sid);
            expect(result.should).toBe(true);
            expect(['miss', 'morning']).toContain(result.type);
            
            randomSpy.mockRestore();
        });
    });
});
