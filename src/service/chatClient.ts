import OpenAI from 'openai';
import { config, getAvailableModels, ModelInfo } from '../config';

let client: OpenAI | null = null;
let lastApiKey: string = '';
let lastBaseUrl: string = '';

export function getClient(): OpenAI {
    if (!client || lastApiKey !== config.openaiApiKey || lastBaseUrl !== config.openaiBaseUrl) {
        console.log(`[API] 创建新的 OpenAI 客户端 → baseURL: ${config.openaiBaseUrl}`);
        client = new OpenAI({
            apiKey: config.openaiApiKey,
            baseURL: config.openaiBaseUrl,
            timeout: 120000, // 120秒超时，支持思考型大模型（如 kimi-k2.5）
        });
        lastApiKey = config.openaiApiKey;
        lastBaseUrl = config.openaiBaseUrl;
    }
    return client;
}

// 强制销毁客户端缓存，在切换 API Key / Base URL 时调用
export function resetClient(): void {
    console.log('[API] 客户端缓存已清除，下次调用将重建连接');
    client = null;
    lastApiKey = '';
    lastBaseUrl = '';
}

// 添加API健康检查
export async function checkApiHealth(): Promise<boolean> {
    try {
        const client = getClient();
        // 发送轻量级请求测试API
        await client.models.list();
        return true;
    } catch (error: any) {
        console.error('API健康检查失败:', error.message || error);
        return false;
    }
}

export async function fetchApiModels(): Promise<any[]> {
    try {
        const client = getClient();
        const response = await client.models.list();
        // NVIDIA NIM and OpenAI return a plain list of models.
        // We will map 'id' and create some readable names
        return response.data.map(m => ({
            id: m.id,
            name: m.id, // Using ID as name since most API providers don't specify pure readable names in list
            description: (m as any).description || '动态模型',
            category: '动态读取'
        }));
    } catch (error: any) {
        console.error('获取动态模型失败:', error.message || error);
        return [];
    }
}

/**
 * 过滤思考型模型（如 DeepSeek-R1）返回的 <think>...</think> 标签内容
 */
export function cleanThinkingTags(text: string): string {
    // 移除 <think>...</think> 块（包括多行内容）
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    // 移除可能残留的单独标签
    cleaned = cleaned.replace(/<\/?think>/g, '');
    // 清理首尾多余空白和换行
    return cleaned.replace(/^\s*\n+/, '').trim();
}

/**
 * 将 API 错误码翻译为用户友好的中文提示
 */
export function formatApiError(status: number | undefined, rawMessage: string): string {
    let friendlyMsg: string;

    switch (status) {
        case 403:
            friendlyMsg = '⚠️ API Key 无权访问此模型。可能原因：\n• 余额不足或已欠费\n• 该模型需要更高等级的订阅\n• API Key 已被禁用\n\n请在【设置】中检查 API Key 或更换模型。';
            break;
        case 401:
            friendlyMsg = '🔑 API Key 无效或已过期。\n请在【设置】中重新输入有效的 API Key。';
            break;
        case 429:
            friendlyMsg = '⏳ 请求频率过高，请稍等几秒后重试。';
            break;
        case 404:
            friendlyMsg = '❌ 模型不存在或已下线。\n请在【设置】中选择其他模型。';
            break;
        default:
            if (rawMessage.includes('timeout') || rawMessage.includes('Timeout')) {
                friendlyMsg = '⏰ 请求超时，模型响应太慢。\n建议切换到速度更快的模型（如标注了 ⚡ 的模型）。';
            } else if (rawMessage.includes('ECONNREFUSED') || rawMessage.includes('network')) {
                friendlyMsg = '🌐 网络连接失败。请检查网络或 API 服务是否正常。';
            } else {
                friendlyMsg = `AI 服务返回错误：${rawMessage}\n请检查设置中的模型ID和 API Key 是否正确。`;
            }
    }

    return `[系统提示] ${friendlyMsg}`;
}

// ===== 403 自动降级逻辑 =====
const modelFailCounts: Map<string, number> = new Map();
export const MAX_CONSECUTIVE_FAILS = 3;

export function recordModelFailure(modelId: string): boolean {
    const count = (modelFailCounts.get(modelId) || 0) + 1;
    modelFailCounts.set(modelId, count);
    return count >= MAX_CONSECUTIVE_FAILS;
}

export function recordModelSuccess(modelId: string): void {
    modelFailCounts.delete(modelId);
}

export function getFallbackModel(currentModel: string): string | null {
    const models: ModelInfo[] = getAvailableModels();
    const sModels = models.filter((m: ModelInfo) => m.category.includes('S级') && m.id !== currentModel);
    if (sModels.length > 0) return sModels[0].id;
    const aModels = models.filter((m: ModelInfo) => m.category.includes('A级') && m.id !== currentModel);
    if (aModels.length > 0) return aModels[0].id;
    return null;
}
