import dotenv from 'dotenv';
dotenv.config();

import { resetClient } from './service/chat';

export interface ModelInfo {
    id: string;
    name: string;
    description: string;
    contextLength: number;
    category: string;
    supportsVision?: boolean;
}

// ===== SiliconFlow 硅基流动 模型列表 (2026-02 测试验证) =====
export const SILICONFLOW_MODELS: ModelInfo[] = [
    // S 级推荐 — 角色扮演最佳
    { id: 'Pro/deepseek-ai/DeepSeek-R1', name: 'DeepSeek-R1 (Pro)', description: 'S级·情感细腻，动作描写丰富', contextLength: 64000, category: '🏆 S级推荐' },
    { id: 'Pro/deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek-V3.2 (Pro)', description: 'S级·简洁自然，最像真人', contextLength: 64000, category: '🏆 S级推荐' },
    { id: 'Pro/deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3 (Pro)', description: 'S级·动作描写自然', contextLength: 64000, category: '🏆 S级推荐' },
    { id: 'Pro/MiniMaxAI/MiniMax-M2.5', name: 'MiniMax-M2.5 (Pro)', description: 'S级·情感丰富，互动性强', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'Pro/MiniMaxAI/MiniMax-M2.1', name: 'MiniMax-M2.1 (Pro)', description: 'S级·分段消息自然', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'Pro/moonshotai/Kimi-K2-Instruct-0905', name: 'Kimi-K2 (Pro)', description: 'S级·口语化自然', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'Pro/moonshotai/Kimi-K2.5', name: 'Kimi-K2.5 (Pro)', description: 'S级·撒娇语气到位', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'Pro/zai-org/GLM-5', name: 'GLM-5 (Pro)', description: 'S级·关心体贴', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'Qwen/Qwen3-Next-80B-A3B-Instruct', name: 'Qwen3-Next-80B', description: 'S级·极速2.4s，分段消息自然', contextLength: 32768, category: '🏆 S级推荐' },
    { id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', name: 'Qwen3-Coder-30B', description: 'S级·极速1.8s，emoji好', contextLength: 32768, category: '🏆 S级推荐' },
    { id: 'Kwaipilot/KAT-Dev', name: 'KAT-Dev (快手)', description: 'S级·极速2.0s，角色感强', contextLength: 32768, category: '🏆 S级推荐' },
    { id: 'ByteDance-Seed/Seed-OSS-36B-Instruct', name: 'Seed-OSS-36B (字节)', description: 'S级·情感深度好', contextLength: 32768, category: '🏆 S级推荐' },
    // A 级推荐
    { id: 'Qwen/Qwen3-235B-A22B-Instruct-2507', name: 'Qwen3-235B', description: 'A级·内容丰富', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'Qwen/Qwen3-14B', name: 'Qwen3-14B', description: 'A级·极速2.0s', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'Qwen/Qwen3-8B', name: 'Qwen3-8B', description: 'A级·轻量快速', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'Qwen/Qwen3-32B', name: 'Qwen3-32B', description: 'A级·表达细腻', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5-72B', description: 'A级·大模型', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'Qwen/Qwen2.5-72B-Instruct-128K', name: 'Qwen2.5-72B-128K', description: 'A级·长上下文', contextLength: 131072, category: '⭐ A级推荐' },
    { id: 'Qwen/Qwen2.5-32B-Instruct', name: 'Qwen2.5-32B', description: 'A级·极速1.2s', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'Pro/deepseek-ai/DeepSeek-V3.1-Terminus', name: 'DeepSeek-V3.1-T (Pro)', description: 'A级·简洁温柔', contextLength: 64000, category: '⭐ A级推荐' },
    { id: 'Pro/zai-org/GLM-4.7', name: 'GLM-4.7 (Pro)', description: 'A级·温柔自然', contextLength: 128000, category: '⭐ A级推荐' },
    { id: 'Qwen/QwQ-32B', name: 'QwQ-32B', description: 'A级·深度思考型', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'Pro/moonshotai/Kimi-K2-Thinking', name: 'Kimi-K2-Thinking (Pro)', description: 'A级·思考型', contextLength: 128000, category: '⭐ A级推荐' },
    // B 级可用
    { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5-7B', description: 'B级·轻量快速', contextLength: 32768, category: '💡 B级可用' },
    { id: 'Qwen/Qwen2.5-14B-Instruct', name: 'Qwen2.5-14B', description: 'B级·中等', contextLength: 32768, category: '💡 B级可用' },
    { id: 'Pro/Qwen/Qwen2-7B-Instruct', name: 'Qwen2-7B (Pro)', description: 'B级·极速0.9s', contextLength: 32768, category: '💡 B级可用' },
    { id: 'Pro/THUDM/glm-4-9b-chat', name: 'GLM-4-9B (Pro)', description: 'B级·轻量', contextLength: 131072, category: '💡 B级可用' },
    { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', name: 'Qwen3-Coder-480B', description: 'B级·超大模型', contextLength: 32768, category: '💡 B级可用' },
];

// ===== Nvidia NIM 模型列表 (2026-02 测试验证) =====
export const NVIDIA_MODELS: ModelInfo[] = [
    // S 级推荐
    { id: 'deepseek-ai/deepseek-v3.2', name: 'DeepSeek V3.2', description: 'S级·简洁自然，最像真人', contextLength: 64000, category: '🏆 S级推荐' },
    { id: 'deepseek-ai/deepseek-v3.1', name: 'DeepSeek V3.1', description: 'S级·动作描写生动', contextLength: 64000, category: '🏆 S级推荐' },
    { id: 'qwen/qwen3.5-397b-a17b', name: 'Qwen3.5-397B', description: 'S级·最快S级(2.3s)，内容丰富', contextLength: 32768, category: '🏆 S级推荐' },
    { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3', description: 'S级·撒娇语气完美', contextLength: 32768, category: '🏆 S级推荐' },
    { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2', description: 'S级·口语化自然', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'minimaxai/minimax-m2.1', name: 'MiniMax M2.1', description: 'S级·分段消息自然', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'minimaxai/minimax-m2', name: 'MiniMax M2', description: 'S级·温柔关心', contextLength: 128000, category: '🏆 S级推荐' },
    { id: 'stepfun-ai/step-3.5-flash', name: 'Step 3.5 Flash', description: 'S级·极速2.0s，互动感强', contextLength: 32768, category: '🏆 S级推荐' },
    // A 级推荐
    { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'A级·极速0.7s', contextLength: 131072, category: '⭐ A级推荐' },
    { id: 'mistralai/mistral-nemotron', name: 'Mistral Nemotron', description: 'A级·极速1.1s', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', description: 'A级·极速1.2s', contextLength: 131072, category: '⭐ A级推荐' },
    { id: 'mistralai/mistral-medium-3-instruct', name: 'Mistral Medium 3', description: 'A级·极速1.2s', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B', description: 'A级·极速1.4s，颜文字可爱', contextLength: 8192, category: '⭐ A级推荐' },
    { id: 'mistralai/mistral-small-24b-instruct', name: 'Mistral Small 24B', description: 'A级·温柔自然', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: 'A级·自然流畅', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', description: 'A级·极速0.5s', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'abacusai/dracarys-llama-3.1-70b-instruct', name: 'Dracarys Llama 70B', description: 'A级·口语化自然', contextLength: 131072, category: '⭐ A级推荐' },
    { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', description: 'A级·最大模型', contextLength: 131072, category: '⭐ A级推荐' },
    { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B', description: 'A级·极速0.8s', contextLength: 65536, category: '⭐ A级推荐' },
    { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', name: 'Nemotron Super 49B', description: 'A级·建议丰富', contextLength: 32768, category: '⭐ A级推荐' },
    { id: 'qwen/qwen3-235b-a22b', name: 'Qwen3-235B', description: 'A级·内容丰富', contextLength: 32768, category: '⭐ A级推荐' },
    // B 级可用
    { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', description: 'B级·轻量快速', contextLength: 131072, category: '💡 B级可用' },
    { id: 'google/gemma-3-4b-it', name: 'Gemma 3 4B', description: 'B级·小巧可爱', contextLength: 8192, category: '💡 B级可用' },
    { id: 'qwen/qwen2-7b-instruct', name: 'Qwen2-7B', description: 'B级·轻量', contextLength: 32768, category: '💡 B级可用' },
    { id: 'qwen/qwq-32b', name: 'QwQ-32B', description: 'B级·思考型', contextLength: 32768, category: '💡 B级可用' },
    // 📷 视觉模型 — 支持图片上传
    { id: 'meta/llama-3.2-90b-vision-instruct', name: 'Llama 3.2 Vision 90B', description: '📷 高质量图片理解', contextLength: 131072, category: '📷 视觉模型', supportsVision: true },
    { id: 'meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 Vision 11B', description: '📷 轻量图片理解，速度快', contextLength: 131072, category: '📷 视觉模型', supportsVision: true },
    { id: 'qwen/qwen2.5-vl-72b-instruct', name: 'Qwen 2.5-VL 72B', description: '📷 中文最佳图片理解', contextLength: 32768, category: '📷 视觉模型', supportsVision: true },
    { id: 'qwen/qwen2.5-vl-7b-instruct', name: 'Qwen 2.5-VL 7B', description: '📷 轻量中文图片理解', contextLength: 32768, category: '📷 视觉模型', supportsVision: true },
    { id: 'nvidia/nemotron-nano-12b-v2-vl', name: 'Nemotron Nano VL 12B', description: '📷 多图/视频理解', contextLength: 32768, category: '📷 视觉模型', supportsVision: true },
];

interface AppConfig {
    openaiApiKey: string;
    openaiBaseUrl: string;
    characterType: string;
    telegramBotToken: string;
    webPort: number;
    enableWechat: boolean;
    enableTelegram: boolean;
    enableWeb: boolean;
    defaultModel: string;
}

const defaultConfig: AppConfig = {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    characterType: process.env.CHARACTER_TYPE || 'girlfriend',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webPort: parseInt(process.env.WEB_PORT || '3000'),
    enableWechat: process.env.ENABLE_WECHAT !== 'false',
    enableTelegram: process.env.ENABLE_TELEGRAM === 'true',
    enableWeb: process.env.ENABLE_WEB !== 'false',
    defaultModel: process.env.DEFAULT_MODEL || 'qwen/qwen3.5-397b-a17b',
};

let currentConfig = { ...defaultConfig };

export const config = {
    get openaiApiKey() { return currentConfig.openaiApiKey; },
    get openaiBaseUrl() { return currentConfig.openaiBaseUrl; },
    get characterType() { return currentConfig.characterType; },
    get telegramBotToken() { return currentConfig.telegramBotToken; },
    get webPort() { return currentConfig.webPort; },
    get enableWechat() { return currentConfig.enableWechat; },
    get enableTelegram() { return currentConfig.enableTelegram; },
    get enableWeb() { return currentConfig.enableWeb; },
    get defaultModel() { return currentConfig.defaultModel; },
};

export function updateApiKey(apiKey: string, baseUrl?: string): void {
    const oldBaseUrl = currentConfig.openaiBaseUrl;
    currentConfig.openaiApiKey = apiKey;
    if (baseUrl) {
        currentConfig.openaiBaseUrl = baseUrl;
    }
    // 强制重建 OpenAI 客户端，确保新的 Key/URL 生效
    resetClient();
    // 如果 baseUrl 发生了变化，旧模型大概率不兼容新服务商，重置为空
    if (baseUrl && baseUrl !== oldBaseUrl) {
        console.log(`[Config] Base URL 变更: ${oldBaseUrl} → ${baseUrl}，重置默认模型`);
        currentConfig.defaultModel = '';
    }
}

export function updateDefaultModel(model: string): void {
    currentConfig.defaultModel = model;
}

export function updateTelegramToken(token: string): void {
    currentConfig.telegramBotToken = token;
}

export function updateServiceConfig(options: {
    enableWechat?: boolean;
    enableTelegram?: boolean;
    enableWeb?: boolean;
}): void {
    if (options.enableWechat !== undefined) currentConfig.enableWechat = options.enableWechat;
    if (options.enableTelegram !== undefined) currentConfig.enableTelegram = options.enableTelegram;
    if (options.enableWeb !== undefined) currentConfig.enableWeb = options.enableWeb;
}

export function getFullConfig() {
    return {
        api: getApiConfig(),
        telegram: {
            token: currentConfig.telegramBotToken ? `${currentConfig.telegramBotToken.slice(0, 8)}...` : '',
            hasToken: !!currentConfig.telegramBotToken,
        },
        services: {
            wechat: currentConfig.enableWechat,
            telegram: currentConfig.enableTelegram,
            web: currentConfig.enableWeb,
        },
        webPort: currentConfig.webPort,
        characterType: currentConfig.characterType,
    };
}

export function getApiConfig() {
    const key = currentConfig.openaiApiKey;
    const maskedKey = key && key.length > 10
        ? key.slice(0, 6) + '***' + key.slice(-4)
        : '';
    return {
        apiKey: maskedKey,
        baseUrl: currentConfig.openaiBaseUrl,
        hasKey: !!key,
        defaultModel: currentConfig.defaultModel,
    };
}

export function isApiKeyValid(): boolean {
    return !!currentConfig.openaiApiKey && currentConfig.openaiApiKey.length > 10;
}

export function getAvailableModels(): ModelInfo[] {
    const baseUrl = currentConfig.openaiBaseUrl;
    if (baseUrl.includes('nvidia.com')) {
        return NVIDIA_MODELS;
    }
    // SiliconFlow 和其他平台默认返回 SiliconFlow 列表
    return SILICONFLOW_MODELS;
}

/**
 * 启动时主动验证 API Key 是否真正可用（而不只是检查字符串是否存在）
 * 通过一个极小的 API 请求来测试连通性和权限
 * 返回: { valid: boolean, message: string }
 */
export async function validateApiKeyOnStartup(): Promise<{ valid: boolean; message: string }> {
    if (!currentConfig.openaiApiKey || currentConfig.openaiApiKey.length < 10) {
        return {
            valid: false,
            message: '❌ 未配置 API Key！\n' +
                '   请在 .env 文件中设置 OPENAI_API_KEY，或使用 Launcher 界面配置。\n' +
                '   免费 Key 申请地址：\n' +
                '   • NVIDIA NIM: https://build.nvidia.com/\n' +
                '   • 硅基流动:   https://siliconflow.cn/'
        };
    }

    try {
        // 发个最轻量的请求来验证 Key 有效性
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({
            apiKey: currentConfig.openaiApiKey,
            baseURL: currentConfig.openaiBaseUrl,
            timeout: 10000, // 10秒超时
        });

        // 尝试列出模型（最轻量的 API 调用）
        await client.models.list();

        return { valid: true, message: '✅ API Key 验证通过，连接正常！' };
    } catch (error: any) {
        const status = error?.status;

        if (status === 401) {
            return {
                valid: false,
                message: '❌ API Key 无效（401 Unauthorized）！\n' +
                    '   你的 Key 格式不正确或已被撤销。\n' +
                    '   请重新申请一个有效的 API Key。'
            };
        }

        if (status === 403) {
            return {
                valid: false,
                message: '⚠️  API Key 权限不足或余额已耗尽（403 Forbidden）！\n' +
                    '   可能原因：\n' +
                    '   • API Key 余额不足或已欠费\n' +
                    '   • Key 已过期需要重新生成\n' +
                    '   • 当前套餐不支持该模型\n' +
                    '   请前往对应平台检查你的账户状态。'
            };
        }

        if (status === 429) {
            // 频率限制说明 Key 是有效的，只是太频繁
            return { valid: true, message: '✅ API Key 有效（当前请求频率过高，稍后自动恢复）' };
        }

        if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
            return {
                valid: false,
                message: '❌ 无法连接到 API 服务器！\n' +
                    `   地址: ${currentConfig.openaiBaseUrl}\n` +
                    '   请检查你的网络连接或 Base URL 是否正确。'
            };
        }

        // 其他错误（如 500 等服务端错误），Key 本身可能是好的
        return {
            valid: true,
            message: `⚠️  API 连接测试异常（${status || error?.code || '未知错误'}），但 Key 可能有效，继续启动...`
        };
    }
}

// ===== API Token 本地认证 =====
import { randomUUID } from 'crypto';

const apiToken: string = process.env.API_TOKEN || randomUUID();

export function getApiToken(): string {
    return apiToken;
}

export function isAuthRequired(): boolean {
    // Electron 桌面应用或 DISABLE_AUTH=true 时跳过认证
    if (process.env.DISABLE_AUTH === 'true') return false;
    if ((process.versions as any).electron) return false;
    if (process.env.ELECTRON_RUN === 'true') return false;
    return true;
}

export function printApiToken(): void {
    if (isAuthRequired()) {
        console.log(`🔑 API Token: ${apiToken}`);
        console.log(`   前端登录或 API 调用时请使用此 Token`);
    } else {
        console.log(`🔓 认证已禁用（Electron 或 DISABLE_AUTH=true）`);
    }
}
