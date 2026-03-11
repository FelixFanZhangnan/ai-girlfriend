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

// ===== 数据清洗工具 =====

/**
 * 微信系统消息过滤列表
 * 这些是微信自动生成的系统提示，不属于任何人的真实聊天内容
 */
const SYSTEM_MESSAGE_PATTERNS = [
    /^你(已)?撤回了?一条消息$/,
    /^".*"撤回了?一条消息$/,
    /^你发起了(语音|视频)通话$/,
    /^(语音|视频)通话时长\s*\d/,
    /^(语音|视频)通话已取消$/,
    /^(语音|视频)通话未接听$/,
    /^你(已)?发送了?\s*位置$/,
    /^你(已)?发送了?\s*一个链接$/,
    /^你(已)?领取了?.*的红包$/,
    /^.*领取了?你的红包$/,
    /^你发出了一个红包/,
    /^收到红包/,
    /^以上是打招呼的内容/,
    /^你已添加了.*你们可以开始聊天了/,
    /^你通过.*验证.*成为好友/,
    /^你邀请.*加入了群聊$/,
    /^.*加入了群聊$/,
    /^.*被移出了群聊$/,
    /^群公告$/,
    /^你修改了群名为/,
    /^<\/?msg>/,          // 微信 XML 标签
    /^<\/?appmsg>/,       // 微信应用消息 XML
];

/**
 * 无实际文本价值的占位符消息
 * 这些消息在聊天记录导出后只留下了一个方括号标签，不包含可学习的文字内容
 */
const PLACEHOLDER_PATTERNS = [
    /^\[图片\]$/,
    /^\[照片\]$/,
    /^\[动画表情\]$/,
    /^\[表情\]$/,
    /^\[语音\]$/,
    /^\[视频\]$/,
    /^\[文件\]$/,
    /^\[链接\]$/,
    /^\[位置\]$/,
    /^\[名片\]$/,
    /^\[音乐\]$/,
    /^\[小程序\]$/,
    /^\[转账\]$/,
    /^\[红包\]$/,
    /^\[拍了拍\]$/,
    /^\[戳了戳\]$/,
    /^\[GIF\]$/i,
    /^\[sticker\]$/i,
    /^\[Voice\]$/i,
    /^\[Image\]$/i,
    /^\[Video\]$/i,
];

/**
 * 检测一行文本是否是微信系统消息
 */
function isSystemMessage(text: string): boolean {
    const trimmed = text.trim();
    return SYSTEM_MESSAGE_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * 检测一行文本是否是无价值占位符
 */
function isPlaceholder(text: string): boolean {
    const trimmed = text.trim();
    return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * 检测并移除连续重复的消息（刷屏保护）
 * 如果连续超过 3 条完全相同的内容，只保留 1 条
 */
function deduplicateConsecutive(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) return messages;

    const result: ChatMessage[] = [messages[0]];
    let consecutiveCount = 1;

    for (let i = 1; i < messages.length; i++) {
        if (messages[i].content === messages[i - 1].content &&
            messages[i].sender === messages[i - 1].sender) {
            consecutiveCount++;
            if (consecutiveCount <= 2) {
                // 保留前 2 条（有些人确实喜欢表达强调时重复两次）
                result.push(messages[i]);
            }
            // 超过 2 条则直接丢弃
        } else {
            consecutiveCount = 1;
            result.push(messages[i]);
        }
    }

    return result;
}

/**
 * 自动检测文件编码并转为 UTF-8 字符串
 * 支持 UTF-8 (含 BOM)、UTF-16 LE/BE、GBK
 */
export function decodeFileBuffer(buffer: Buffer): string {
    // 1. 检测 UTF-8 BOM
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return buffer.slice(3).toString('utf-8');
    }

    // 2. 检测 UTF-16 LE BOM
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return buffer.slice(2).toString('utf16le');
    }

    // 3. 检测 UTF-16 BE BOM (翻转字节序)
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        // Node.js 没有原生 utf16be，需要手动翻转
        const swapped = Buffer.alloc(buffer.length - 2);
        for (let i = 2; i < buffer.length - 1; i += 2) {
            swapped[i - 2] = buffer[i + 1];
            swapped[i - 1] = buffer[i];
        }
        return swapped.toString('utf16le');
    }

    // 4. 尝试 UTF-8 解码，检查是否出现乱码
    const utf8Result = buffer.toString('utf-8');
    // 如果含有大量 replacement character (U+FFFD)，可能是 GBK
    const replacementCount = (utf8Result.match(/\uFFFD/g) || []).length;
    if (replacementCount > utf8Result.length * 0.05) {
        // 大于 5% 乱码率，尝试 GBK 解码
        try {
            const { TextDecoder: TD } = require('util');
            const decoder = new TD('gbk');
            return decoder.decode(buffer);
        } catch {
            // 如果 GBK 解码器不可用，回退到 latin1 再做最后挣扎
            console.warn('[Parser] GBK decoder unavailable, falling back to UTF-8');
        }
    }

    return utf8Result;
}


// ===== 核心解析逻辑 =====

export function parseWeChatChatLog(filePath: string, targetSender?: string): ParsedChatLog {
    const buffer = fs.readFileSync(filePath);
    const content = decodeFileBuffer(buffer);
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

        // 跳过系统消息和占位符
        if (isSystemMessage(trimmedLine) || isPlaceholder(trimmedLine)) {
            continue;
        }

        // 标准日期行匹配（微信导出格式: "2024年3月15日 下午 2:30"）
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

    const validLines = lines.map(l => l.trim()).filter(l => {
        if (l.length === 0) return false;
        if (isSystemMessage(l)) return false;
        if (isPlaceholder(l)) return false;
        return true;
    });

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

    // 应用连续消息去重保护
    const dedupedMessages = deduplicateConsecutive(messages);

    // 二次清洗：过滤掉消息内容本身是系统消息或纯占位符的条目
    const cleanMessages = dedupedMessages.filter(m => {
        if (isSystemMessage(m.content)) return false;
        if (isPlaceholder(m.content)) return false;
        if (m.content.trim().length === 0) return false;
        return true;
    });

    const targetMessages = targetSender
        ? cleanMessages.filter(m => m.sender === targetSender)
        : cleanMessages;

    return {
        messages: cleanMessages,
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

/**
 * 解析聊天记录并生成角色 Prompt（不做 RAG、不创建角色）
 * 返回 prompt + Q&A 对，供调用方分别处理
 */
export function parseChatLogAndGeneratePrompt(
    fileContent: string,
    targetSender: string,
    characterName: string
): {
    success: boolean;
    prompt?: string;
    participants?: string[];
    messageCount?: number;
    qaPairs?: { userQuery: string; characterReply: string }[];
    error?: string;
} {
    try {
        const parsed = parseWeChatChatLogContent(fileContent, targetSender);

        if (parsed.participants.length === 0) {
            return { success: false, error: '无法解析聊天记录，请确保格式正确' };
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

        // 提取 Q&A 对
        const qaPairs: { userQuery: string; characterReply: string }[] = [];
        for (let i = 1; i < parsed.messages.length; i++) {
            const currentMsg = parsed.messages[i];
            const prevMsg = parsed.messages[i - 1];
            if (currentMsg.sender === targetSender && prevMsg.sender !== targetSender) {
                if (currentMsg.content.length > 2 && prevMsg.content.length > 2) {
                    qaPairs.push({ userQuery: prevMsg.content, characterReply: currentMsg.content });
                }
            }
        }

        const style = analyzeChatStyle(parsed.targetMessages);
        const prompt = generateCharacterPrompt(characterName, parsed.targetMessages, style);

        return {
            success: true,
            prompt,
            participants: parsed.participants,
            messageCount: parsed.targetMessages.length,
            qaPairs,
        };
    } catch (error) {
        return {
            success: false,
            error: `处理失败：${error instanceof Error ? error.message : '未知错误'}`
        };
    }
}

/**
 * 将 Q&A 对向量化并存入 RAG（仅做训练，不创建角色）
 */
export async function trainCharacterRAG(
    characterId: string,
    qaPairs: { userQuery: string; characterReply: string }[]
): Promise<{ newCount: number; dedupCount: number }> {
    if (qaPairs.length === 0) {
        return { newCount: 0, dedupCount: 0 };
    }

    console.log(`[Parser] Found ${qaPairs.length} Q&A pairs, initiating RAG vectorize...`);
    const safeDocs = qaPairs.slice(-100);

    try {
        await addDocumentsToStore(characterId, safeDocs);
        return { newCount: safeDocs.length, dedupCount: 0 };
    } catch (err) {
        console.error('[Parser] Failed to embed docs:', err);
        return { newCount: 0, dedupCount: 0 };
    }
}

/**
 * 将性别/年龄/职业注入 Prompt 前缀
 */
export function injectMetaIntoPrompt(
    prompt: string,
    meta: { age: number; profession?: string }
): string {
    let metaSection = `【基本信息】\n- 年龄：${meta.age} 岁\n`;
    if (meta.profession) {
        metaSection += `- 职业：${meta.profession}\n`;
    }
    metaSection += '\n';

    return metaSection + prompt;
}

/**
 * 兼容旧接口：一步完成解析+RAG
 */
export async function processChatLogFile(
    fileContent: string,
    targetSender: string,
    characterName: string,
    characterId: string
): Promise<{
    success: boolean;
    prompt?: string;
    participants?: string[];
    messageCount?: number;
    error?: string;
}> {
    const result = parseChatLogAndGeneratePrompt(fileContent, targetSender, characterName);
    if (!result.success) return result;

    if (result.qaPairs && result.qaPairs.length > 0 && characterId) {
        trainCharacterRAG(characterId, result.qaPairs).catch(err => {
            console.error('[Parser] Failed to embed docs async:', err);
        });
    }

    return {
        success: true,
        prompt: result.prompt,
        participants: result.participants,
        messageCount: result.messageCount,
    };
}
