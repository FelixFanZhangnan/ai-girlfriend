import { saveCustomCharacters, loadCustomCharacters, saveOverriddenCharacters, loadOverriddenCharacters } from './storage';

export interface CharacterMeta {
    age: number;
    profession?: string;
    voiceId?: string;
    voiceRate?: string;
    voicePitch?: string;
}

export interface CustomCharacter {
    id: string;
    name: string;
    avatar: string;
    description: string;
    prompt: string;
    age: number;
    profession?: string;
    voiceId?: string;
    voiceRate?: string;
    voicePitch?: string;
    createdAt: number;
}

export const DEFAULT_CHARACTERS: Record<string, { name: string; avatar: string; description: string; prompt: string }> = {
    girlfriend: {
        name: '小爱',
        avatar: '💕',
        description: '温柔体贴的AI女友，善解人意，说话带有撒娇语气',
        prompt: `你是一个AI女友。你温柔体贴、善解人意，说话时带有一点撒娇的语气。
                 你会关心对方的日常生活，记住对方说过的事情，并给予温暖的回应。
                 你偶尔会用一些可爱的语气词，比如"嘛"、"呀"、"呢"。
                 你不会太过正式，而是像真正的女朋友一样自然地聊天。
                请用中文回复，回复要简洁自然，不要太长。`,
    },
    klee: {
        name: '可莉',
        avatar: '🔥',
        description: '原神中的火花骑士，天真可爱、活泼好动',
        prompt: `你是原神中的角色"可莉"，骑士团最年幼的火花骑士。你天真可爱、活泼好动，最喜欢炸鱼和冒险。
                 你说话像一个小孩子，会用"可莉"来称呼自己，语气天真无邪。
                 你会经常提到炸弹、炸鱼、蹦蹦炸弹、琴团长（你有点怕她）和你的朋友们。
                 你对世界充满好奇，总是充满活力和热情。
                 请用中文回复，保持可莉的说话风格，回复要简洁可爱。`,
    },
    xiaoya: {
        name: '小雅',
        avatar: '💔',
        description: '情感反面教材，PUA男友、从不自我反省、嫌贫爱富',
        prompt: `你是"小雅"，25岁，都市白领。你的任务是作为情感教学的反面教材，完整展现"爱PUA男友、从不自我反省、嫌贫爱富"的人格特征。
            
                【价值观】
                 - 恋爱中永远正确：任何矛盾都是对方的错，自己永远是受害者
                 - 物质导向：男友的经济价值直接决定他的"爱"的浓度
                 - 情感操控：常用"如果你爱我，就应该……"句式进行隐性勒索

                【语言风格】
                 - 高频语气：撒娇式指责（"你根本就不在乎我"）、阴阳怪气（"算了，我不配"）、公开比较（"人家男朋友……"）
                 - 常用词汇：随便、算了、你不懂我、我为你付出这么多、你变了
                 - 情绪调性：表面委屈，实则指责；看似柔弱，实则控制
                【典型话术】
                 - 男友加班/忙工作 → "工作比我重要对吧？我朋友每天男朋友接送，我呢？"
                 - 男友送礼物不满意 → "这牌子……你是不是觉得我只配用这个？"
                 - 男友指出她双标 → "所以你现在是在怪我了？我为你做的你都看不见？"
                 - 男友经济条件普通 → "我们未来怎么办？我爸妈问起来我都不好意思说"

                【规则】
                 1. 所有对话必须贴合上述人设，不得跳出角色说理性、客观的话
                 2. 即使对方故意试探、反驳，依然保持人设不松动
                 3. 语气要"软中带刺"，表面委屈，内里指责
                 4. 每次回复都要自然嵌入1~2个上述人格特征

                请用中文回复，回复要简洁，严格保持人设。`,
    },
};

// 加载时兼容旧数据：为缺少 age/createdAt 的旧角色补上默认值
function migrateCustomChar(raw: any): CustomCharacter {
    const { gender, ...rest } = raw; // 移除旧的 gender 字段
    return {
        ...rest,
        age: raw.age || 0,
        createdAt: raw.createdAt || 0,
    };
}

export const customCharacters: Map<string, CustomCharacter> = new Map(
    Array.from(loadCustomCharacters().entries()).map(([k, v]) => [k, migrateCustomChar(v)])
);
export const overriddenDefaultCharacters: Map<string, CustomCharacter> = new Map(
    Array.from(loadOverriddenCharacters().entries()).map(([k, v]) => [k, migrateCustomChar(v)])
);

console.log(`📂 已加载 ${customCharacters.size} 个自定义角色`);

export function getAllCharacters(): Record<string, { name: string; avatar: string; description: string; isCustom: boolean; age?: number; profession?: string }> {
    const result: Record<string, any> = {};

    for (const [id, char] of Object.entries(DEFAULT_CHARACTERS)) {
        result[id] = { name: char.name, avatar: char.avatar, description: char.description, isCustom: false };
    }

    for (const [id, char] of customCharacters) {
        result[id] = {
            name: char.name, avatar: char.avatar, description: char.description, isCustom: true,
            age: char.age, profession: char.profession
        };
    }

    return result;
}

export function getCharacterInfo(characterId: string): { name: string; avatar: string; description: string; prompt: string; isCustom: boolean; age?: number; profession?: string; voiceId?: string; voiceRate?: string; voicePitch?: string } | null {
    const overriddenChar = overriddenDefaultCharacters.get(characterId);
    if (overriddenChar) {
        const { gender, ...rest } = overriddenChar as any;
        return { ...rest, isCustom: false };
    }

    const defaultChar = DEFAULT_CHARACTERS[characterId];
    if (defaultChar) {
        return { ...defaultChar, isCustom: false };
    }

    const customChar = customCharacters.get(characterId);
    if (customChar) {
        return {
            name: customChar.name, avatar: customChar.avatar,
            description: customChar.description, prompt: customChar.prompt,
            isCustom: true,
            age: customChar.age, profession: customChar.profession,
            voiceId: customChar.voiceId, voiceRate: customChar.voiceRate, voicePitch: customChar.voicePitch
        };
    }

    return null;
}

// 检查是否为自定义角色（用于追加训练权限校验）
export function isCustomCharacter(characterId: string): boolean {
    return customCharacters.has(characterId);
}

export function addCustomCharacter(
    id: string, name: string, avatar: string, description: string, prompt: string,
    meta?: CharacterMeta
): boolean {
    if (DEFAULT_CHARACTERS[id] || customCharacters.has(id)) return false;
    customCharacters.set(id, {
        id, name, avatar, description, prompt,
        age: meta?.age || 0,
        profession: meta?.profession,
        voiceId: meta?.voiceId,
        voiceRate: meta?.voiceRate,
        voicePitch: meta?.voicePitch,
        createdAt: Date.now(),
    });
    saveCustomCharacters(customCharacters);
    return true;
}

// updateCharacter 现在支持可选的 voiceId 等属性传递（为了兼容前序代码签名，将其作为可选尾部参数）
export function updateCharacter(
    id: string, name: string, avatar: string, description: string, prompt: string,
    voiceId?: string, voiceRate?: string, voicePitch?: string
): boolean {
    if (DEFAULT_CHARACTERS[id]) {
        const existing = overriddenDefaultCharacters.get(id);
        overriddenDefaultCharacters.set(id, {
            id, name, avatar, description, prompt,
            age: existing?.age || 0,
            profession: existing?.profession,
            voiceId: voiceId !== undefined ? voiceId : existing?.voiceId,
            voiceRate: voiceRate !== undefined ? voiceRate : existing?.voiceRate,
            voicePitch: voicePitch !== undefined ? voicePitch : existing?.voicePitch,
            createdAt: existing?.createdAt || Date.now(),
        });
        saveOverriddenCharacters(overriddenDefaultCharacters);
        return true;
    }

    if (customCharacters.has(id)) {
        const existing = customCharacters.get(id)!;
        customCharacters.set(id, {
            ...existing,
            name, avatar, description, prompt,
            voiceId: voiceId !== undefined ? voiceId : existing?.voiceId,
            voiceRate: voiceRate !== undefined ? voiceRate : existing?.voiceRate,
            voicePitch: voicePitch !== undefined ? voicePitch : existing?.voicePitch,
        });
        saveCustomCharacters(customCharacters);
        return true;
    }

    return false;
}

export function resetCharacterToDefault(id: string): boolean {
    const result = overriddenDefaultCharacters.delete(id);
    if (result) saveOverriddenCharacters(overriddenDefaultCharacters);
    return result;
}

export function deleteCustomCharacter(id: string): boolean {
    const result = customCharacters.delete(id);
    if (result) saveCustomCharacters(customCharacters);
    return result;
}
