import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { similarity } from 'ml-distance';
import OpenAI from 'openai';
import { config } from '../config';

export interface RagDocument {
    id: string;
    characterId: string;
    userQuery: string;    // What the user said
    characterReply: string; // How the character replied
    vector?: number[];
    contentHash?: string; // 用于内容去重
}

// ===== 数据目录 =====
const DATA_DIR = path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.local/share'), 'ai-girlfriend-data');
const RAG_DIR = path.join(DATA_DIR, 'rag'); // 按角色分片存储
const LEGACY_DB_PATH = path.join(DATA_DIR, 'rag_store.json'); // 兼容旧的单文件

// Ensure directories exist
if (!fs.existsSync(RAG_DIR)) {
    fs.mkdirSync(RAG_DIR, { recursive: true });
}

// ===== 按角色分片的存储 =====
const characterStores: Map<string, RagDocument[]> = new Map();

/**
 * 获取某角色的分片文件路径
 */
function getShardPath(characterId: string): string {
    // 安全化文件名，防止路径注入
    const safeName = characterId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(RAG_DIR, `${safeName}.json`);
}

/**
 * 加载某个角色的向量数据
 */
function loadCharacterShard(characterId: string): RagDocument[] {
    if (characterStores.has(characterId)) {
        return characterStores.get(characterId)!;
    }

    const shardPath = getShardPath(characterId);
    let docs: RagDocument[] = [];

    if (fs.existsSync(shardPath)) {
        try {
            const data = fs.readFileSync(shardPath, 'utf-8');
            docs = JSON.parse(data);
        } catch (e) {
            console.error(`[RAG] Failed to load shard for ${characterId}:`, e);
            docs = [];
        }
    }

    characterStores.set(characterId, docs);
    return docs;
}

/**
 * 保存某个角色的向量数据到分片文件
 */
function saveCharacterShard(characterId: string): void {
    const docs = characterStores.get(characterId);
    if (!docs) return;

    try {
        const shardPath = getShardPath(characterId);
        fs.writeFileSync(shardPath, JSON.stringify(docs), 'utf-8');
    } catch (e) {
        console.error(`[RAG] Failed to save shard for ${characterId}:`, e);
    }
}

/**
 * 启动时迁移旧的单文件数据到分片存储
 */
export function loadRagStore(): void {
    // 迁移旧数据
    if (fs.existsSync(LEGACY_DB_PATH)) {
        try {
            const data = fs.readFileSync(LEGACY_DB_PATH, 'utf-8');
            const legacy = JSON.parse(data);
            if (legacy.documents && legacy.documents.length > 0) {
                console.log(`[RAG] Migrating ${legacy.documents.length} legacy vectors to sharded storage...`);

                // 按 characterId 分组
                const grouped: Map<string, RagDocument[]> = new Map();
                for (const doc of legacy.documents) {
                    const cid = doc.characterId || 'unknown';
                    if (!grouped.has(cid)) grouped.set(cid, []);
                    grouped.get(cid)!.push(doc);
                }

                // 写入分片
                for (const [cid, docs] of grouped) {
                    characterStores.set(cid, docs);
                    saveCharacterShard(cid);
                }

                // 重命名旧文件为 backup
                fs.renameSync(LEGACY_DB_PATH, LEGACY_DB_PATH + '.bak');
                console.log(`[RAG] Migration complete. Old file renamed to rag_store.json.bak`);
            }
        } catch (e) {
            console.error('[RAG] Failed to migrate legacy store:', e);
        }
    }

    // 扫描现有分片文件并打印统计
    try {
        const files = fs.readdirSync(RAG_DIR).filter(f => f.endsWith('.json'));
        let totalDocs = 0;
        for (const file of files) {
            const cid = file.replace('.json', '');
            const docs = loadCharacterShard(cid);
            totalDocs += docs.length;
        }
        if (totalDocs > 0) {
            console.log(`[RAG] Loaded ${totalDocs} vectors across ${files.length} character shard(s).`);
        }
    } catch (e) {
        // 目录可能为空，没关系
    }
}

// ===== 内容哈希去重 =====

/**
 * 生成文本内容的短哈希，用于快速去重
 */
function contentHash(userQuery: string, characterReply: string): string {
    return crypto
        .createHash('md5')
        .update(`${userQuery}|||${characterReply}`)
        .digest('hex')
        .substring(0, 12); // 12 位足够去重
}

/**
 * 检查某角色的知识库中是否已存在相同内容
 */
function isDuplicate(characterId: string, hash: string): boolean {
    const docs = loadCharacterShard(characterId);
    return docs.some(d => d.contentHash === hash);
}

// ===== LRU 向量缓存 =====

const VECTOR_CACHE_SIZE = 50; // 最多缓存 50 个最近查询的向量
const vectorCache: Map<string, number[]> = new Map();

function getCachedVector(text: string): number[] | undefined {
    const key = text.substring(0, 200); // 用前 200 字符作为 key
    const cached = vectorCache.get(key);
    if (cached) {
        // LRU: 删除再重新插入以保持最近使用
        vectorCache.delete(key);
        vectorCache.set(key, cached);
    }
    return cached;
}

function setCachedVector(text: string, vector: number[]): void {
    const key = text.substring(0, 200);
    if (vectorCache.size >= VECTOR_CACHE_SIZE) {
        // 删除最旧的条目（Map 保持插入顺序）
        const oldestKey = vectorCache.keys().next().value;
        if (oldestKey !== undefined) {
            vectorCache.delete(oldestKey);
        }
    }
    vectorCache.set(key, vector);
}

// ===== Embedding 模型选择 =====

function getEmbeddingModel(): string {
    const baseUrl = config.openaiBaseUrl || '';
    if (baseUrl.includes('siliconflow.cn')) {
        return 'BAAI/bge-m3';
    }
    if (baseUrl.includes('nvidia.com')) {
        return 'nvidia/nv-embedqa-e5-v5';
    }
    return 'text-embedding-3-small';
}

// ===== 带重试的向量化 =====

const MAX_RETRIES = 3;

/**
 * 将文本转为数字向量（带 LRU 缓存和重试机制）
 */
export async function vectorizeText(text: string): Promise<number[]> {
    // 先查缓存
    const cached = getCachedVector(text);
    if (cached) return cached;

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

    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // NVIDIA NIM 的 E5 模型需要额外参数 input_type 和 truncate
            const requestBody: any = {
                model: modelToUse,
                input: input,
                encoding_format: "float",
            };

            if (modelToUse === 'nvidia/nv-embedqa-e5-v5') {
                requestBody.input_type = 'query';
                requestBody.truncate = 'END';
            }

            const response = await client.embeddings.create(requestBody);

            if (response.data && response.data.length > 0) {
                const vector = response.data[0].embedding;
                setCachedVector(text, vector); // 存入缓存
                return vector;
            }
            throw new Error('No embedding returned from API');
        } catch (error: any) {
            lastError = error;
            const status = error.status;

            // 429 (Rate Limit) 或 5xx (Server Error) 才值得重试
            if (status === 429 || (status && status >= 500)) {
                const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避
                console.warn(`[RAG] Vectorize attempt ${attempt}/${MAX_RETRIES} failed (${status}), retrying in ${waitMs}ms...`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            // 其他错误（如 401/403）直接抛出，不再重试
            break;
        }
    }

    console.error(`[RAG] Vectorize failed after ${MAX_RETRIES} attempts:`, lastError?.message);
    throw lastError;
}

/**
 * 训练入库：保存解析好的问答对并计算特征向量
 * 返回: { success: number, skipped: number, failed: number }
 */
export async function addDocumentsToStore(characterId: string, docs: { userQuery: string, characterReply: string }[]): Promise<number> {
    let successCount = 0;
    let skippedCount = 0;

    const charDocs = loadCharacterShard(characterId);

    // 简单限流防止大量并发请求爆掉免费余额
    const BATCH_SIZE = 5;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (doc) => {
            try {
                // 内容哈希去重
                const hash = contentHash(doc.userQuery, doc.characterReply);
                if (isDuplicate(characterId, hash)) {
                    skippedCount++;
                    return;
                }

                const combinedText = `User: ${doc.userQuery}\nCharacter: ${doc.characterReply}`;
                const vector = await vectorizeText(combinedText);

                charDocs.push({
                    id: `${characterId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    characterId,
                    userQuery: doc.userQuery,
                    characterReply: doc.characterReply,
                    vector,
                    contentHash: hash
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

        // 每个 batch 完成后打印进度
        const progress = Math.min(i + BATCH_SIZE, docs.length);
        console.log(`[RAG] Vectorize progress: ${progress}/${docs.length} (${successCount} ok, ${skippedCount} dedup)`);
    }

    saveCharacterShard(characterId);
    console.log(`[RAG] Training complete for ${characterId}: ${successCount} new, ${skippedCount} deduplicated.`);
    return successCount;
}

/**
 * RAG 检索：根据当前用户的话，查找历史中最相似的语境回复
 */
export async function searchSimilarConversations(characterId: string, query: string, topK: number = 3): Promise<RagDocument[]> {
    const charDocs = loadCharacterShard(characterId).filter(d => d.vector);
    if (charDocs.length === 0) {
        return [];
    }

    try {
        const queryVector = await vectorizeText(query);

        // 计算余弦相似度
        const scoredDocs = charDocs.map(doc => {
            const score = similarity.cosine(queryVector, doc.vector!);
            return { doc, score };
        });

        // 降序排列
        scoredDocs.sort((a, b) => b.score - a.score);

        // 动态阈值：取 TopK 结果中最高分的 60% 作为下限
        // 这样在高质量匹配时要求更严格，低质量时更宽容
        const topScore = scoredDocs.length > 0 ? scoredDocs[0].score : 0;
        const dynamicThreshold = Math.max(0.35, topScore * 0.6);

        const relevantDocs = scoredDocs
            .filter(item => item.score > dynamicThreshold)
            .slice(0, topK);

        return relevantDocs.map(item => item.doc);

    } catch (e) {
        console.error('[RAG] Search Error:', e);
        return [];
    }
}
