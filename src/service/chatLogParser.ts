import fs from 'fs';
import path from 'path';
import { addDocumentsToStore } from './ragStore';

interface ChatMessage {
    sender: string;
    content: string;
    timestamp: string;
}

interface ParsedChatLog {
    messages: ChatMessage[];
    participants: string[];
    targetMessages: ChatMessage[];
}

export function parseWeChatChatLog(filePath: string, targetSender?: string): ParsedChatLog {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseWeChatChatLogContent(content, targetSender);
}

export function parseWeChatChatLogContent(content: string, targetSender?: string): ParsedChatLog {
    const lines = content.split('\n');
    const messages: ChatMessage[] = [];
    const participants = new Set<string>();

    let currentDate = '';
    let currentSender = '';
    let currentContent = '';

    // First pass: try standard parsing (Name: Message or Name Time)
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const dateMatch = trimmedLine.match(/^(\d{4}年\d{1,2}月\d{1,2}日\s*(上午|下午|晚上)?\s*\d{1,2}:\d{2})$/);
        if (dateMatch) {
            if (currentSender && currentContent) {
                messages.push({
                    sender: currentSender,
                    content: currentContent.trim(),
                    timestamp: currentDate
                });
            }
            currentDate = trimmedLine;
            currentSender = '';
            currentContent = '';
            continue;
        }

        // 限制名字长度在1到20个字符之间，禁止包含空格或标点，避免把普通句子里面的大段包含冒号的话当作名字
        const messageMatch = trimmedLine.match(/^([^:：\s，。！？,!?]{1,20})[：:]\s*(.*)$/);
        const macWechatMatch = trimmedLine.match(/^([^\d]+)\s(\d{1,2}:\d{2})$/);

        if (messageMatch) {
            if (currentSender && currentContent) {
                messages.push({
                    sender: currentSender,
                    content: currentContent.trim(),
                    timestamp: currentDate
                });
            }
            currentSender = messageMatch[1].trim();
            currentContent = messageMatch[2] || '';
            participants.add(currentSender);
        } else if (macWechatMatch) {
            if (currentSender && currentContent) {
                messages.push({
                    sender: currentSender,
                    content: currentContent.trim(),
                    timestamp: currentDate
                });
            }
            currentSender = macWechatMatch[1].trim();
            currentContent = '';
            participants.add(currentSender);
        } else if (currentSender) {
            currentContent += (currentContent ? '\n' : '') + trimmedLine;
        }
    }

    if (currentSender && currentContent) {
        messages.push({
            sender: currentSender,
            content: currentContent.trim(),
            timestamp: currentDate
        });
    }

    const validLines = lines.map(l => l.trim()).filter(l => l.length > 0);

    // Fallback: If < 2 participants detected OR we parsed very few messages compared to the text length 
    // (meaning the regex matched random colons instead of real names in raw text)
    if (participants.size < 2 || messages.length < validLines.length * 0.2) {
        messages.length = 0; // Clear any falsely detected messages
        participants.clear();

        let isUserA = true;
        for (const line of validLines) {
            const sender = isUserA ? '对方' : '我';
            messages.push({
                sender,
                content: line,
                timestamp: ''
            });
            participants.add(sender);
            isUserA = !isUserA;
        }
    }

    const targetMessages = targetSender
        ? messages.filter(m => m.sender === targetSender)
        : messages;

    return {
        messages,
        participants: Array.from(participants),
        targetMessages
    };
}

export function analyzeChatStyle(messages: ChatMessage[]): {
    commonPhrases: string[];
    avgMessageLength: number;
    emojiUsage: string[];
    punctuationStyle: string;
    responsePatterns: string[];
} {
    if (messages.length === 0) {
        return {
            commonPhrases: [],
            avgMessageLength: 0,
            emojiUsage: [],
            punctuationStyle: '',
            responsePatterns: []
        };
    }

    const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    const avgMessageLength = Math.round(totalLength / messages.length);

    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojis: string[] = [];
    messages.forEach(m => {
        const matches = m.content.match(emojiRegex);
        if (matches) {
            emojis.push(...matches);
        }
    });

    const emojiCounts: Record<string, number> = {};
    emojis.forEach(e => {
        emojiCounts[e] = (emojiCounts[e] || 0) + 1;
    });
    const emojiUsage = Object.entries(emojiCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([emoji]) => emoji);

    const phrases: Record<string, number> = {};
    messages.forEach(m => {
        const words = m.content.split(/[\s,，。！？!?;；：:""''（）()「」【】\n]+/).filter(w => w.length >= 2);
        words.forEach(word => {
            phrases[word] = (phrases[word] || 0) + 1;
        });
    });
    const commonPhrases = Object.entries(phrases)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([phrase]) => phrase);

    let hasExclamation = false;
    let hasQuestion = false;
    let hasTilde = false;
    messages.forEach(m => {
        if (m.content.includes('！') || m.content.includes('!')) hasExclamation = true;
        if (m.content.includes('？') || m.content.includes('?')) hasQuestion = true;
        if (m.content.includes('~') || m.content.includes('～')) hasTilde = true;
    });

    let punctuationStyle = '';
    if (hasTilde) punctuationStyle += '经常使用波浪号(~)表达轻松语气；';
    if (hasExclamation) punctuationStyle += '使用感叹号表达强烈情感；';
    if (hasQuestion) punctuationStyle += '喜欢用问句引导对话；';

    const responsePatterns: string[] = [];
    for (let i = 0; i < Math.min(messages.length, 50); i++) {
        if (messages[i].content.length > 5 && messages[i].content.length < 100) {
            responsePatterns.push(messages[i].content);
        }
    }

    return {
        commonPhrases,
        avgMessageLength,
        emojiUsage,
        punctuationStyle,
        responsePatterns: responsePatterns.slice(0, 20)
    };
}

export function generateCharacterPrompt(
    characterName: string,
    messages: ChatMessage[],
    style: ReturnType<typeof analyzeChatStyle>
): string {
    const exampleDialogues = messages
        .slice(0, 15)
        .map(m => m.content)
        .filter(c => c.length > 5 && c.length < 150)
        .slice(0, 10)
        .map(c => `"${c}"`)
        .join('\n');

    const emojiList = style.emojiUsage.slice(0, 5).join(' ');

    return `你是一个名叫"${characterName}"的角色。请完全模仿以下聊天风格进行对话：

【性格特点】
- 平均消息长度约${style.avgMessageLength}字，回复简洁自然
- ${style.punctuationStyle || '语气平和自然'}
- ${emojiList ? `常用表情：${emojiList}` : '较少使用表情'}

【常用表达】
${style.commonPhrases.slice(0, 10).join('、')}

【典型对话示例】
${exampleDialogues}

【回复规则】
1. 完全模仿上述聊天风格，保持一致的语气和表达习惯
2. 回复长度控制在${Math.max(5, style.avgMessageLength - 10)}-${Math.min(100, style.avgMessageLength + 30)}字之间
3. 使用相似的表情符号和语气词
4. 保持自然随意的聊天风格，不要过于正式
5. 用中文回复，严格保持人设

请用中文回复，回复要简洁自然。`;
}

export async function processChatLogFile(
    fileContent: string,
    targetSender: string,
    characterName: string,
    characterId: string // Need id to save RAG bounds
): Promise<{
    success: boolean;
    prompt?: string;
    participants?: string[];
    messageCount?: number;
    error?: string;
}> {
    try {
        const parsed = parseWeChatChatLogContent(fileContent, targetSender);

        if (parsed.participants.length === 0) {
            return {
                success: false,
                error: '无法解析聊天记录，请确保格式正确'
            };
        }

        if (!parsed.participants.includes(targetSender)) {
            return {
                success: false,
                error: `未找到发送者"${targetSender}"，可选的发送者：${parsed.participants.join('、')}`,
                participants: parsed.participants
            };
        }

        if (parsed.targetMessages.length < 10) {
            return {
                success: false,
                error: `消息数量不足（仅${parsed.targetMessages.length}条），建议至少10条消息以学习说话风格`,
                participants: parsed.participants,
                messageCount: parsed.targetMessages.length
            };
        }

        // --- RAG 提取篇: 找出对方回答你的上一句(你的提问) ---
        const docsToStore: { userQuery: string, characterReply: string }[] = [];
        for (let i = 1; i < parsed.messages.length; i++) {
            const currentMsg = parsed.messages[i];
            const prevMsg = parsed.messages[i - 1];

            // 如果当前消息是目标角色发的，且上一条是别人（通常是用户）发的
            if (currentMsg.sender === targetSender && prevMsg.sender !== targetSender) {
                if (currentMsg.content.length > 2 && prevMsg.content.length > 2) {
                    docsToStore.push({
                        userQuery: prevMsg.content,
                        characterReply: currentMsg.content
                    });
                }
            }
        }

        // 异步丢进去嵌入，如果是前端上传触发的，不想卡死，可以火急火燎先返回提示词
        // 我们等这段运行完再返回，确保向量建完
        if (docsToStore.length > 0 && characterId) {
            console.log(`[Parser] Found ${docsToStore.length} Q&A pairs, initiating RAG vectorize...`);
            // Limit to max 100 for safety against huge billing right now
            const safeDocs = docsToStore.slice(-100);
            addDocumentsToStore(characterId, safeDocs).catch(err => {
                console.error('[Parser] Failed to embed docs async:', err);
            });
        }

        const style = analyzeChatStyle(parsed.targetMessages);
        const prompt = generateCharacterPrompt(characterName, parsed.targetMessages, style);

        return {
            success: true,
            prompt,
            participants: parsed.participants,
            messageCount: parsed.targetMessages.length
        };
    } catch (error) {
        return {
            success: false,
            error: `处理失败：${error instanceof Error ? error.message : '未知错误'}`
        };
    }
}
