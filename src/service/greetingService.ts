import { getClient } from './chatClient';
import { config } from '../config';
import { getOrCreateSession, lastActivityTime } from './sessionManager';
import { buildSystemPrompt } from './memoryService';

const GREETING_MESSAGES = {
    morning: [
        '早安~今天也要元气满满哦！☀️',
        '早上好呀~睡得好吗？',
        '早安！新的一天开始啦~有什么计划吗？',
    ],
    afternoon: [
        '午安~吃饭了吗？记得按时吃饭哦~',
        '下午好呀~工作累不累？',
        '下午好！要不要休息一下？',
    ],
    evening: [
        '晚上好~今天过得怎么样？',
        '晚上好呀~吃晚饭了吗？',
        '晚上好！今天辛苦啦~',
    ],
    night: [
        '晚安~早点休息哦，熬夜对身体不好~',
        '晚安呀~做个好梦！🌙',
        '这么晚还不睡？快去休息吧~',
    ],
    miss: [
        '好久没聊了~想我了吗？',
        '你都不理我~哼',
        '干嘛呢~都不找我聊天',
        '想你了~有空聊聊天嘛？',
    ],
    random: [
        '在干嘛呢~',
        '突然想到你了~',
        '无聊中...陪我聊聊天嘛？',
        '今天心情怎么样呀？',
    ],
};

export const lastGreetingTime: Map<string, number> = new Map();

export function cleanupGreeting(sessionId: string) {
    lastGreetingTime.delete(sessionId);
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
}

function getRandomMessage(messages: string[]): string {
    return messages[Math.floor(Math.random() * messages.length)];
}

export function shouldSendGreeting(sessionId: string): { should: boolean; message?: string; type?: string } {
    const now = Date.now();
    const lastActivity = lastActivityTime.get(sessionId) || 0;
    const lastGreeting = lastGreetingTime.get(sessionId) || 0;
    
    // We import getOrCreateSession but only if we really need to initialize it.
    // Instead we can peek if it exists. But getOrCreateSession handles defaults.
    const session = getOrCreateSession(sessionId);

    const timeSinceLastActivity = now - lastActivity;
    const timeSinceLastGreeting = now - lastGreeting;
    const oneHour = 60 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;

    // 检查是否有最近的对话
    if (session.history.length > 0) {
        const lastMessage = session.history[session.history.length - 1];
        const timeSinceLastMessage = now - lastMessage.timestamp;

        // 5分钟内有消息，不发送问候
        if (timeSinceLastMessage < 5 * 60 * 1000) {
            return { should: false };
        }

        // 检查最后一条消息内容，避免重复问候
        const lastContent = lastMessage.content.toLowerCase();
        const greetingKeywords = ['你好', '早安', '午安', '晚上好', '晚安', '嗨', '嘿', 'hi', 'hello'];

        if (greetingKeywords.some(keyword => lastContent.includes(keyword))) {
            return { should: false };
        }
    }

    if (timeSinceLastGreeting < oneHour) {
        return { should: false };
    }

    if (timeSinceLastActivity > 2 * oneHour && timeSinceLastGreeting > oneHour) {
        const missChance = Math.min(0.3, timeSinceLastActivity / (24 * oneHour));
        if (Math.random() < missChance) {
            lastGreetingTime.set(sessionId, now);
            return { should: true, message: getRandomMessage(GREETING_MESSAGES.miss), type: 'miss' };
        }
    }

    const timeOfDay = getTimeOfDay();
    const hour = new Date().getHours();

    const greetingHours: Record<string, number[]> = {
        morning: [8, 9],
        afternoon: [12, 13],
        evening: [18, 19],
        night: [22, 23],
    };

    const targetHours = greetingHours[timeOfDay];
    if (targetHours && targetHours.includes(hour) && timeSinceLastGreeting > oneHour) {
        if (Math.random() < 0.5) {
            lastGreetingTime.set(sessionId, now);
            return { should: true, message: getRandomMessage(GREETING_MESSAGES[timeOfDay]), type: timeOfDay };
        }
    }

    if (timeSinceLastActivity > thirtyMinutes && timeSinceLastGreeting > 2 * oneHour) {
        if (Math.random() < 0.1) {
            lastGreetingTime.set(sessionId, now);
            return { should: true, message: getRandomMessage(GREETING_MESSAGES.random), type: 'random' };
        }
    }

    return { should: false };
}

export async function generateInitiativeMessage(sessionId: string): Promise<string> {
    const session = getOrCreateSession(sessionId);

    const systemPrompt = await buildSystemPrompt(sessionId, session, undefined, true);

    const timeOfDay = getTimeOfDay();
    const contextPrompt = `现在时间是${new Date().toLocaleTimeString('zh-CN')}，时间段是${timeOfDay}。请主动发起一句简短的问候或聊天，要自然，像真人发微信一样。`;

    try {
        const apiClient = getClient();
        const response = await apiClient.chat.completions.create({
            model: session.model || config.defaultModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: contextPrompt },
            ],
            temperature: 0.9,
            max_tokens: 100,
        });

        return response.choices[0].message.content || getRandomMessage(GREETING_MESSAGES.random);
    } catch (error) {
        console.error('生成主动消息出错:', error);
        return getRandomMessage(GREETING_MESSAGES.random);
    }
}
