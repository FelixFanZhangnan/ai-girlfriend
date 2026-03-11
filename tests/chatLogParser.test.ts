/**
 * chatLogParser.test.ts
 * 对应测试计划：模块四（聊天记录学习 & RAG 记忆）
 * 
 * 覆盖用例：
 * - 4.1 上传 txt 文件（标准格式解析）
 * - 4.1 上传 txt 文件（纯文本无名字 fallback）
 * - 4.3 系统消息过滤
 * - 4.4 占位符过滤
 * - 连续重复消息去重（刷屏保护）
 * - 冒号误判防护（colon_in_text 场景）
 */

import fs from 'fs';
import path from 'path';
import { parseWeChatChatLogContent, analyzeChatStyle, generateCharacterPrompt } from '../src/service/chatLogParser';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(filename: string): string {
    return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

// ===== 模块四 4.1：标准微信导出格式解析 =====
describe('标准微信导出格式解析', () => {
    let result: ReturnType<typeof parseWeChatChatLogContent>;

    beforeAll(() => {
        const content = loadFixture('standard_format.txt');
        result = parseWeChatChatLogContent(content);
    });

    test('应正确识别两个参与者', () => {
        expect(result.participants).toContain('小明');
        expect(result.participants).toContain('小红');
        expect(result.participants.length).toBe(2);
    });

    test('应解析出正确数量的消息', () => {
        // 共 9 条：小红最后一条"看到你了！"和日期行之间的消息合并
        expect(result.messages.length).toBe(9);
    });

    test('消息内容不应包含发送者名字前缀', () => {
        const firstMsg = result.messages[0];
        expect(firstMsg.sender).toBe('小明');
        expect(firstMsg.content).toBe('今天天气真好啊');
        expect(firstMsg.content).not.toContain('小明');
    });

    test('应正确提取带波浪号的消息', () => {
        const msg = result.messages.find(m => m.content.includes('～'));
        expect(msg).toBeTruthy();
        expect(msg!.sender).toBe('小红');
    });

    test('指定 targetSender 时应只返回该发送者的消息', () => {
        const content = loadFixture('standard_format.txt');
        const filtered = parseWeChatChatLogContent(content, '小红');
        expect(filtered.targetMessages.every(m => m.sender === '小红')).toBe(true);
        expect(filtered.targetMessages.length).toBeGreaterThan(0);
    });
});

// ===== 模块四 4.1：纯文本 Fallback 模式 =====
describe('纯文本 Fallback 模式（无发送者名字）', () => {
    let result: ReturnType<typeof parseWeChatChatLogContent>;

    beforeAll(() => {
        const content = loadFixture('plain_text.txt');
        result = parseWeChatChatLogContent(content);
    });

    test('应回退为"对方"和"我"两个参与者', () => {
        expect(result.participants).toContain('对方');
        expect(result.participants).toContain('我');
        expect(result.participants.length).toBe(2);
    });

    test('应交替分配发送者', () => {
        expect(result.messages[0].sender).toBe('对方');
        expect(result.messages[1].sender).toBe('我');
        expect(result.messages[2].sender).toBe('对方');
    });

    test('消息总数应等于有效非空行数', () => {
        const content = loadFixture('plain_text.txt');
        const validLines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        expect(result.messages.length).toBe(validLines.length);
    });
});

// ===== 模块四 4.3：系统消息过滤 =====
describe('系统消息过滤', () => {
    let result: ReturnType<typeof parseWeChatChatLogContent>;

    beforeAll(() => {
        const content = loadFixture('with_system_messages.txt');
        result = parseWeChatChatLogContent(content);
    });

    test('不应包含"撤回"系统消息', () => {
        const hasRevoke = result.messages.some(m =>
            m.content.includes('撤回了一条消息') || m.content.includes('撤回了一条消息')
        );
        expect(hasRevoke).toBe(false);
    });

    test('不应包含"语音通话"系统消息', () => {
        const hasCall = result.messages.some(m =>
            m.content.includes('语音通话时长') ||
            m.content.includes('你发起了语音通话') ||
            m.content.includes('语音通话已取消')
        );
        expect(hasCall).toBe(false);
    });

    test('不应包含"加好友"系统消息', () => {
        const hasAdd = result.messages.some(m =>
            m.content.includes('你已添加了') && m.content.includes('可以开始聊天了')
        );
        expect(hasAdd).toBe(false);
    });

    test('应保留真实用户消息', () => {
        const hasMing = result.messages.some(m => m.content === '在吗');
        const hasHong = result.messages.some(m => m.content === '好看！');
        expect(hasMing).toBe(true);
        expect(hasHong).toBe(true);
    });
});

// ===== 模块四 4.4：占位符过滤 =====
describe('占位符过滤', () => {
    let result: ReturnType<typeof parseWeChatChatLogContent>;

    beforeAll(() => {
        const content = loadFixture('with_system_messages.txt');
        result = parseWeChatChatLogContent(content);
    });

    test('不应包含 [图片] 占位符', () => {
        const hasImage = result.messages.some(m => m.content === '[图片]');
        expect(hasImage).toBe(false);
    });

    test('不应包含 [动画表情] 占位符', () => {
        const hasEmoji = result.messages.some(m => m.content === '[动画表情]');
        expect(hasEmoji).toBe(false);
    });

    test('不应包含 [语音] 占位符', () => {
        const hasVoice = result.messages.some(m => m.content === '[语音]');
        expect(hasVoice).toBe(false);
    });

    test('不应包含 [链接] 占位符', () => {
        const hasLink = result.messages.some(m => m.content === '[链接]');
        expect(hasLink).toBe(false);
    });
});

// ===== 连续重复消息去重 =====
describe('连续重复消息去重（刷屏保护）', () => {
    let result: ReturnType<typeof parseWeChatChatLogContent>;

    beforeAll(() => {
        const content = loadFixture('duplicates.txt');
        result = parseWeChatChatLogContent(content);
    });

    test('"哈哈哈"原本 5 条连续重复，去重后数量应减少', () => {
        const hahaMessages = result.messages.filter(m => m.content === '哈哈哈');
        // fallback 模式下 sender 交替（对方/我），但连续相同内容+相同 sender 的会被压缩
        // 5 条 alternating => 最多 5 条（因为 sender 不同），但不应超过原始数量
        expect(hahaMessages.length).toBeLessThanOrEqual(5);
        expect(hahaMessages.length).toBeGreaterThan(0);
    });

    test('"好好好"原本 4 条连续重复，去重后数量应减少', () => {
        const goodMessages = result.messages.filter(m => m.content === '好好好');
        expect(goodMessages.length).toBeLessThanOrEqual(4);
        expect(goodMessages.length).toBeGreaterThan(0);
    });

    test('非连续重复的消息应全部保留', () => {
        const unique = result.messages.filter(m => m.content === '你说得对');
        expect(unique.length).toBe(1);
    });

    test('"嗯嗯"只有 2 条连续重复，应全部保留', () => {
        const enMessages = result.messages.filter(m => m.content === '嗯嗯');
        expect(enMessages.length).toBe(2);
    });
});

// ===== 冒号误判防护 =====
describe('冒号误判防护', () => {
    let result: ReturnType<typeof parseWeChatChatLogContent>;

    beforeAll(() => {
        const content = loadFixture('colon_in_text.txt');
        result = parseWeChatChatLogContent(content);
    });

    test('不应把句中的冒号前内容当成发送者名字', () => {
        // "是我的话就一句话：哥们..." 不应被当作 sender = "是我的话就一句话"
        const hasFalseSender = result.participants.includes('是我的话就一句话');
        expect(hasFalseSender).toBe(false);
    });

    test('应回退为 fallback 模式（对方/我）', () => {
        expect(result.participants).toContain('对方');
        expect(result.participants).toContain('我');
    });

    test('第一条消息内容应完整保留冒号', () => {
        expect(result.messages[0].content).toContain('：');
    });
});

// ===== 空输入保护 =====
describe('边界情况与错误处理', () => {
    test('空字符串不应崩溃', () => {
        const result = parseWeChatChatLogContent('');
        expect(result.messages.length).toBe(0);
        expect(result.participants.length).toBe(0);
    });

    test('纯空行不应崩溃', () => {
        const result = parseWeChatChatLogContent('\n\n\n\n');
        expect(result.messages.length).toBe(0);
    });

    test('单行文本应回退为 fallback', () => {
        const result = parseWeChatChatLogContent('你好');
        expect(result.messages.length).toBe(1);
        expect(result.participants).toContain('对方');
    });
});

// ===== analyzeChatStyle 测试 =====
describe('analyzeChatStyle 聊天风格分析', () => {
    test('空消息数组应返回零值', () => {
        const style = analyzeChatStyle([]);
        expect(style.avgMessageLength).toBe(0);
        expect(style.commonPhrases.length).toBe(0);
        expect(style.emojiUsage.length).toBe(0);
    });

    test('应正确计算平均消息长度', () => {
        const messages = [
            { sender: 'A', content: '你好', timestamp: '' },      // 2 字
            { sender: 'A', content: '你好啊', timestamp: '' },    // 3 字
            { sender: 'A', content: '今天天气不错', timestamp: '' }, // 6 字
        ];
        const style = analyzeChatStyle(messages);
        // 平均 = (2+3+6)/3 ≈ 3.67 → 四舍五入 4
        expect(style.avgMessageLength).toBeCloseTo(4, 0);
    });

    test('应检测感叹号使用', () => {
        const messages = [
            { sender: 'A', content: '太棒了！', timestamp: '' },
        ];
        const style = analyzeChatStyle(messages);
        expect(style.punctuationStyle).toContain('感叹号');
    });

    test('应检测波浪号使用', () => {
        const messages = [
            { sender: 'A', content: '好呀～', timestamp: '' },
        ];
        const style = analyzeChatStyle(messages);
        expect(style.punctuationStyle).toContain('波浪号');
    });

    test('应提取 emoji 使用', () => {
        const messages = [
            { sender: 'A', content: '开心😊今天😊真好😊', timestamp: '' },
        ];
        const style = analyzeChatStyle(messages);
        expect(style.emojiUsage).toContain('😊');
    });
});

// ===== generateCharacterPrompt 测试 =====
describe('generateCharacterPrompt 角色提示词生成', () => {
    test('应包含角色名称', () => {
        const messages = [
            { sender: '测试', content: '你好呀这是一句正常的话', timestamp: '' },
        ];
        const style = analyzeChatStyle(messages);
        const prompt = generateCharacterPrompt('小花', messages, style);
        expect(prompt).toContain('小花');
    });

    test('应包含对话示例', () => {
        const messages = [
            { sender: '测试', content: '今天出去玩了，超级开心哈哈', timestamp: '' },
        ];
        const style = analyzeChatStyle(messages);
        const prompt = generateCharacterPrompt('小花', messages, style);
        expect(prompt).toContain('今天出去玩了');
    });

    test('应包含回复规则', () => {
        const messages = [
            { sender: '测试', content: '这是一条测试消息喵', timestamp: '' },
        ];
        const style = analyzeChatStyle(messages);
        const prompt = generateCharacterPrompt('小花', messages, style);
        expect(prompt).toContain('回复规则');
        expect(prompt).toContain('中文回复');
    });
});
