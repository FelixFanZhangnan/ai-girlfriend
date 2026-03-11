import { config } from '../config';
import { getClient, cleanThinkingTags, formatApiError, recordModelFailure, getFallbackModel, recordModelSuccess, MAX_CONSECUTIVE_FAILS } from './chatClient';
import { getSessionMutex, getOrCreateSession, saveCharacterHistory, MAX_HISTORY } from './sessionManager';
import { extractMemoryBackground, buildSystemPrompt } from './memoryService';

// ---- 导出所有的子模块接口，以保证外部包的调用兼容性 ----
export * from './chatClient';
export * from './characterService';
export * from './sessionManager';
export * from './memoryService';
export * from './greetingService';

export async function getReply(sessionId: string, message: string): Promise<string> {
    const mutex = getSessionMutex(sessionId);

    return mutex.runExclusive(async () => {
        const session = getOrCreateSession(sessionId);

        const systemPrompt = await buildSystemPrompt(sessionId, session, message);

        // 异步提取新记忆 (不阻塞主回复流程)
        if (typeof message === 'string' && message.length > 4) {
            extractMemoryBackground(sessionId, message).catch(e => console.error('提取记忆失败:', e));
        }

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...session.history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
        ];

        try {
            const apiClient = getClient();
            const modelToUse = session.model || config.defaultModel;
            console.log(`[Chat] 发起请求 → 模型: ${modelToUse}, baseURL: ${config.openaiBaseUrl}`);

            if (!modelToUse) {
                return '[系统提示：当前未选择任何模型，请在设置中选择或手动输入模型ID]';
            }

            const requestParams: any = {
                model: modelToUse,
                messages,
                temperature: session.temperature,
                max_tokens: session.maxTokens,
            };

            // 针对 Nvidia NIM 上的思考型模型特殊优化
            if (modelToUse === 'qwen/qwen3.5-397b-a17b' || modelToUse.includes('qwq')) {
                requestParams.extra_body = { chat_template_kwargs: { enable_thinking: true } };
            }

            const response = await apiClient.chat.completions.create(requestParams);

            const rawReply = response.choices[0].message.content || '嗯...我不知道该说什么了';
            const reply = cleanThinkingTags(rawReply);
            const now = Date.now();

            session.history.push({ role: 'user', content: message, timestamp: now });
            session.history.push({ role: 'assistant', content: reply, timestamp: now });

            if (session.history.length > MAX_HISTORY) {
                session.history = session.history.slice(-MAX_HISTORY);
            }

            saveCharacterHistory(sessionId, session.characterType, [...session.history]);

            return reply;
        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message || String(error);
            const status = error.status || error.response?.status;
            console.error(`[Chat] AI 回复出错 (status=${status || 'N/A'}):`, errMsg);
            return formatApiError(status, errMsg);
        }
    });
}

export async function* getReplyStream(sessionId: string, message: string, imageBase64?: string): AsyncGenerator<string> {
    const mutex = getSessionMutex(sessionId);
    const release = await mutex.acquire();

    try {
        const session = getOrCreateSession(sessionId);

        const systemPrompt = await buildSystemPrompt(sessionId, session, message);

        // 异步提取新记忆 (不阻塞主回复流程)
        if (typeof message === 'string' && message.length > 4) {
            extractMemoryBackground(sessionId, message).catch(e => console.error('提取记忆失败:', e));
        }

        // 构建用户消息：如果有图片则用数组格式
        let userContent: any;
        if (imageBase64) {
            userContent = [
                { type: 'text', text: message },
                { type: 'image_url', image_url: { url: imageBase64 } },
            ];
        } else {
            userContent = message;
        }

        const messages: Array<any> = [
            { role: 'system', content: systemPrompt },
            ...session.history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: userContent },
        ];

        const apiClient = getClient();
        const modelToUse = session.model || config.defaultModel;
        console.log(`[Chat Stream] 发起流式请求 → 模型: ${modelToUse}, baseURL: ${config.openaiBaseUrl}`);

        if (!modelToUse) {
            yield '[系统提示：当前未选择任何模型，请在设置中选择或手动输入模型ID]';
            return;
        }

        const requestParams: any = {
            model: modelToUse,
            messages,
            temperature: session.temperature,
            max_tokens: session.maxTokens,
            stream: true,
        };

        // 针对 Nvidia NIM 上的思考型模型特殊优化
        if (modelToUse === 'qwen/qwen3.5-397b-a17b' || modelToUse.includes('qwq')) {
            requestParams.extra_body = { chat_template_kwargs: { enable_thinking: true } };
        }

        const stream = await apiClient.chat.completions.create(requestParams) as any;

        let fullReply = '';
        let insideThinkBlock = false;
        let thinkBuffer = '';
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                // 实时过滤 <think>...</think> 标签
                for (const char of content) {
                    thinkBuffer += char;
                    if (thinkBuffer.endsWith('<think>')) {
                        insideThinkBlock = true;
                        thinkBuffer = '';
                        continue;
                    }
                    if (thinkBuffer.endsWith('</think>')) {
                        insideThinkBlock = false;
                        thinkBuffer = '';
                        continue;
                    }
                    if (!insideThinkBlock) {
                        // 防止部分匹配的标签片段被提前输出
                        if (thinkBuffer.length > 8) {
                            const safe = thinkBuffer.slice(0, -8);
                            fullReply += safe;
                            yield safe;
                            thinkBuffer = thinkBuffer.slice(-8);
                        }
                    } else {
                        // 在 think 块内，不输出但保持 buffer 用于检测结束标签
                        if (thinkBuffer.length > 9) {
                            thinkBuffer = thinkBuffer.slice(-9);
                        }
                    }
                }
            }
        }
        // 输出剩余 buffer
        if (!insideThinkBlock && thinkBuffer) {
            fullReply += thinkBuffer;
            yield thinkBuffer;
        }
        recordModelSuccess(modelToUse);

        const now = Date.now();
        session.history.push({ role: 'user', content: message, timestamp: now });
        session.history.push({ role: 'assistant', content: fullReply, timestamp: now });

        if (session.history.length > MAX_HISTORY) {
            session.history = session.history.slice(-MAX_HISTORY);
        }

        // 保存到角色历史
        saveCharacterHistory(sessionId, session.characterType, [...session.history]);
    } catch (error: any) {
        const errMsg = error.response?.data?.error?.message || error.message || String(error);
        const status = error.status || error.response?.status;
        const modelToUse = getOrCreateSession(sessionId).model || config.defaultModel;
        console.error(`[Chat Stream] AI 流式回复出错 (status=${status || 'N/A'}):`, errMsg);

        // 403 自动降级
        if (status === 403 && modelToUse) {
            const shouldFallback = recordModelFailure(modelToUse);
            if (shouldFallback) {
                const fallback = getFallbackModel(modelToUse);
                if (fallback) {
                    console.log(`[Chat] 模型 ${modelToUse} 连续 ${MAX_CONSECUTIVE_FAILS} 次 403，自动切换到 ${fallback}`);
                    getOrCreateSession(sessionId).model = fallback;
                    yield `[系统提示] ⚠️ 模型 ${modelToUse} 无法访问，已自动切换到 ${fallback}。请重新发送消息。`;
                    return;
                }
            }
        }

        yield formatApiError(status, errMsg);
    } finally {
        release();
    }
}
