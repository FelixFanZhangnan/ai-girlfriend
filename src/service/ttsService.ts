import { Communicate, listVoicesUniversal } from 'edge-tts-universal';
import { getCharacterInfo, updateCharacter } from './characterService';

export const CHARACTER_VOICES: Record<string, string> = {
    girlfriend: 'zh-CN-XiaoxiaoNeural',
    klee: 'zh-CN-XiaoyouNeural',
    xiaoya: 'zh-CN-XiaomoNeural',
};

export const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

export function getVoiceForCharacter(characterId: string): string {
    const charInfo = getCharacterInfo(characterId);
    if (charInfo && 'voiceId' in charInfo && charInfo.voiceId) {
        return charInfo.voiceId;
    }
    return CHARACTER_VOICES[characterId] || DEFAULT_VOICE;
}

export function setVoiceForCharacter(characterId: string, voiceId: string): boolean {
    CHARACTER_VOICES[characterId] = voiceId;
    
    // 尝试更新持久化数据
    const charInfo = getCharacterInfo(characterId);
    if (charInfo) {
        const { name, avatar, description, prompt, isCustom } = charInfo;
        // 因为 getCharacterInfo 返回的对象在类型定义上没有完全展开 voiceId，我们需要跳过类型检查处理
        const success = updateCharacter(characterId, name, avatar, description, prompt, voiceId);
        return success;
    }
    return false;
}

export async function textToSpeech(text: string, voiceId: string, options?: { rate?: string, pitch?: string, volume?: string }): Promise<Buffer> {
    // 1. 清理文本：移除 Markdown 标记、HTML、和诸如 [happy] 等情绪标签
    const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\[(happy|sad|angry|shy|surprise|normal)\]\s*$/i, '')
        .trim();

    if (!cleanText) {
        return Buffer.alloc(0);
    }

    const { rate = '+0%', pitch = '+0Hz', volume = '+0%' } = options || {};

    const communicate = new Communicate(cleanText, {
        voice: voiceId,
        rate,
        pitch,
        volume,
    });

    const buffers: Buffer[] = [];
    for await (const chunk of communicate.stream()) {
        if (chunk.type === 'audio') {
            buffers.push(Buffer.from((chunk as any).data));
        }
    }

    return Buffer.concat(buffers);
}

export async function getAvailableVoices(): Promise<Array<{ id: string, name: string, locale: string, gender: string }>> {
    const allVoices = await listVoicesUniversal();
    const allowedLocales = ['zh-CN', 'zh-TW', 'zh-HK', 'ja-JP', 'en-US', 'en-GB', 'ko-KR'];
    
    return allVoices
        .filter((v: any) => allowedLocales.includes(v.Locale))
        .map((v: any) => ({
            id: v.ShortName,
            name: v.FriendlyName,
            locale: v.Locale,
            gender: v.Gender
        }))
        .sort((a: any, b: any) => a.locale.localeCompare(b.locale));
}
