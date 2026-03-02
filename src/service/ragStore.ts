import fs from 'fs';
import path from 'path';
import { similarity } from 'ml-distance';
import OpenAI from 'openai';
import { config } from '../config';

export interface RagDocument {
    id: string;
    characterId: string;
    userQuery: string;    // What the user said
    characterReply: string; // How the character replied
    vector?: number[];
}

interface RagStoreData {
    documents: RagDocument[];
}

const DATA_DIR = path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.local/share'), 'ai-girlfriend-data');
const DB_PATH = path.join(DATA_DIR, 'rag_store.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let storeData: RagStoreData = { documents: [] };

export function loadRagStore(): void {
    if (fs.existsSync(DB_PATH)) {
        try {
            const data = fs.readFileSync(DB_PATH, 'utf-8');
            storeData = JSON.parse(data);
            console.log(`[RAG] Loaded ${storeData.documents.length} vectors from DB.`);
        } catch (e) {
            console.error('[RAG] Failed to load RAG store:', e);
            storeData = { documents: [] };
        }
    }
}

function saveRagStore(): void {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(storeData), 'utf-8');
    } catch (e) {
        console.error('[RAG] Failed to save RAG store:', e);
    }
}

// 自动检测应使用的免费 Embedding 模型
function getEmbeddingModel(): string {
    const baseUrl = config.openaiBaseUrl || '';
    if (baseUrl.includes('siliconflow.cn')) {
        return 'BAAI/bge-m3';
    }
    if (baseUrl.includes('nvidia.com')) {
        return 'nvidia/nv-embedqa-e5-v5';
    }
    // DeepSeek API 暂未提供免费公测的 Embedding, 回退到通用的兼容名称
    return 'text-embedding-3-small';
}

/**
 * 将文本转为数字向量
 */
export async function vectorizeText(text: string): Promise<number[]> {
    if (!config.openaiApiKey) {
        throw new Error('API Key is missing');
    }

    const client = new OpenAI({
        apiKey: config.openaiApiKey,
        baseURL: config.openaiBaseUrl
    });

    const modelToUse = getEmbeddingModel();

    // NIM 的 E5 模型要求输入格式特别
    let input = text;
    if (modelToUse === 'nvidia/nv-embedqa-e5-v5') {
        input = `query: ${text}`;
    }

    try {
        const response = await client.embeddings.create({
            model: modelToUse,
            input: input,
            encoding_format: "float",
        });

        if (response.data && response.data.length > 0) {
            return response.data[0].embedding;
        }
        throw new Error('No embedding returned from API');
    } catch (error: any) {
        const status = error.status;
        console.error(`[RAG] Vectorize Error (${status}):`, error.message);
        throw error;
    }
}

/**
 * 训练入库：保存解析好的问答对并计算特征向量
 */
export async function addDocumentsToStore(characterId: string, docs: { userQuery: string, characterReply: string }[]): Promise<number> {
    let successCount = 0;

    // 先清理掉该角色的旧记忆（如果需要覆盖式学习，这里直接清理；如果是增量学习，可注释此行）
    storeData.documents = storeData.documents.filter(d => d.characterId !== characterId);

    // 简单限流防止大量并发请求爆掉免费余额
    const BATCH_SIZE = 5;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (doc) => {
            try {
                const combinedText = `User: ${doc.userQuery}\nCharacter: ${doc.characterReply}`;
                const vector = await vectorizeText(combinedText);

                storeData.documents.push({
                    id: `${characterId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    characterId,
                    userQuery: doc.userQuery,
                    characterReply: doc.characterReply,
                    vector
                });
                successCount++;
            } catch (e) {
                console.error(`[RAG] Failed to embed document chunk:`, e);
            }
        }));

        // 防频控
        if (i + BATCH_SIZE < docs.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    saveRagStore();
    return successCount;
}

/**
 * RAG 检索：根据当前用户的话，查找历史中最相似的语境回复
 */
export async function searchSimilarConversations(characterId: string, query: string, topK: number = 3): Promise<RagDocument[]> {
    if (!storeData.documents || storeData.documents.length === 0) {
        return [];
    }

    // 过滤出当前角色的记忆
    const charDocs = storeData.documents.filter(d => d.characterId === characterId && d.vector);
    if (charDocs.length === 0) {
        return [];
    }

    try {
        const queryVector = await vectorizeText(query);

        // 计算每个历史聊天切片的欧氏距离或余弦相似度
        // ml-distance 提供 similarity.cosine，范围大概是 0~1，越接近 1 越相似
        const scoredDocs = charDocs.map(doc => {
            const score = similarity.cosine(queryVector, doc.vector!);
            return { doc, score };
        });

        // 降序排列并取出 TopK
        scoredDocs.sort((a, b) => b.score - a.score);

        // 过滤掉相似度太低的不相关闲聊 (此阈值可随模型调试)
        const THRESHOLD = 0.5;
        const relevantDocs = scoredDocs.filter(item => item.score > THRESHOLD).slice(0, topK);

        return relevantDocs.map(item => item.doc);

    } catch (e) {
        console.error('[RAG] Search Error:', e);
        return [];
    }
}
