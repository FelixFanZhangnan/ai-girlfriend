import express from 'express';
import path from 'path';
import multer from 'multer';
import {
    getReply,
    getReplyStream,
    getChatHistory,
    clearChatHistory,
    switchCharacter,
    getSessionSettings,
    updateSessionSettings,
    getAllCharacters,
    getCharacterInfo,
    addCustomCharacter,
    updateCharacter,
    deleteCustomCharacter,
    resetCharacterToDefault,
    shouldSendGreeting,
    generateInitiativeMessage,
    updateActivity,
    checkApiHealth,
    fetchApiModels,
    isCustomCharacter,
    CharacterMeta,
} from '../service/chat';
import { config, updateApiKey, getApiConfig, isApiKeyValid, getAvailableModels, updateDefaultModel, updateTelegramToken, updateServiceConfig, getFullConfig, getApiToken, isAuthRequired, printApiToken } from '../config';
import { processChatLogFile, parseChatLogAndGeneratePrompt, trainCharacterRAG, injectMetaIntoPrompt } from '../service/chatLogParser';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 限制5MB
});

// ===== API Token 认证中间件 =====
import { Request, Response, NextFunction } from 'express';

function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!isAuthRequired()) {
        next();
        return;
    }

    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    const expectedToken = getApiToken();

    let providedToken = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedToken = authHeader.slice(7);
    } else if (queryToken) {
        providedToken = queryToken;
    }

    if (providedToken === expectedToken) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// 前端登录: 验证 token 并返回确认
app.post('/api/auth/login', express.json(), (req, res) => {
    const { token } = req.body;
    if (!isAuthRequired()) {
        res.json({ success: true, authDisabled: true });
        return;
    }
    if (token === getApiToken()) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Token 无效' });
    }
});

// 查询是否需要认证
app.get('/api/auth/status', (_req, res) => {
    res.json({ authRequired: isAuthRequired() });
});

app.get('/api/models', (_req, res) => {
    const models = getAvailableModels();
    res.json({ models });
});

app.get('/api/models/dynamic', async (_req, res) => {
    try {
        // 始终使用 config.ts 中的精选模型列表（与 Launcher GUI 一致）
        const curatedModels = getAvailableModels();
        if (curatedModels && curatedModels.length > 0) {
            res.json({ models: curatedModels });
        } else {
            // 只有在精选列表为空时才尝试动态获取
            if (!isApiKeyValid()) {
                return res.json({ models: [], fallbackModels: [] });
            }
            const dynamicModels = await fetchApiModels();
            res.json({ models: dynamicModels.length > 0 ? dynamicModels : [] });
        }
    } catch (e) {
        res.json({ models: [], fallbackModels: getAvailableModels() });
    }
});

app.get('/api/health', async (_req, res) => {
    try {
        const isHealthy = await checkApiHealth();
        res.json({
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            api: {
                keyConfigured: isApiKeyValid(),
                baseUrl: config.openaiBaseUrl,
            }
        });
    } catch (error) {
        console.error('健康检查失败:', error);
        res.json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: '健康检查时发生错误'
        });
    }
});

app.post('/api/config/model', (req, res) => {
    const { model } = req.body;
    if (!model) {
        res.status(400).json({ error: '模型ID不能为空' });
        return;
    }
    updateDefaultModel(model);
    res.json({
        success: true,
        model,
        api: getApiConfig(),
    });
});

app.get('/api/config', (_req, res) => {
    res.json({
        api: getApiConfig(),
        isValid: isApiKeyValid(),
    });
});

app.post('/api/config/apikey', requireAuth, (req, res) => {
    const { apiKey, baseUrl } = req.body;

    if (!apiKey && !baseUrl) {
        res.status(400).json({ error: '请提供 API Key 或 Base URL' });
        return;
    }

    if (apiKey) {
        updateApiKey(apiKey, baseUrl);
    } else if (baseUrl) {
        updateApiKey(config.openaiApiKey, baseUrl);
    }
    res.json({
        success: true,
        api: getApiConfig(),
        isValid: isApiKeyValid(),
    });
});

app.post('/api/config/telegram', (req, res) => {
    const { token } = req.body;

    if (token) {
        updateTelegramToken(token);
    }
    res.json({
        success: true,
        telegram: {
            token: config.telegramBotToken ? `${config.telegramBotToken.slice(0, 8)}...` : '',
            hasToken: !!config.telegramBotToken,
        }
    });
});

app.post('/api/config/services', (req, res) => {
    const { enableWechat, enableTelegram, enableWeb } = req.body;

    updateServiceConfig({ enableWechat, enableTelegram, enableWeb });
    res.json({
        success: true,
        services: {
            wechat: config.enableWechat,
            telegram: config.enableTelegram,
            web: config.enableWeb,
        }
    });
});

app.get('/api/config/full', (_req, res) => {
    res.json(getFullConfig());
});

app.post('/api/chatlog/parse', upload.single('chatlog'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: '请上传聊天记录文件' });
            return;
        }

        const content = req.file.buffer.toString('utf-8');
        const { targetSender, characterName, characterId } = req.body;

        if (!targetSender) {
            res.status(400).json({ error: '请指定要学习的发送者名称' });
            return;
        }

        if (!characterName || !characterId) {
            res.status(400).json({ error: '请指定角色名称及其分配的ID' });
            return;
        }

        const result = await processChatLogFile(content, targetSender, characterName, characterId);
        res.json(result);
    } catch (error) {
        console.error('解析聊天记录失败:', error);
        res.status(500).json({ error: '解析聊天记录失败' });
    }
});

app.post('/api/chatlog/preview', upload.single('chatlog'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: '请上传聊天记录文件' });
            return;
        }

        const content = req.file.buffer.toString('utf-8');
        const lines = content.split('\n').slice(0, 50);

        const participants = new Set<string>();
        lines.forEach(line => {
            const match = line.match(/^([^:：]+)[：:]/);
            const macWechatMatch = line.match(/^([^\d]+)\s(\d{1,2}:\d{2})$/);
            if (match) {
                participants.add(match[1].trim());
            } else if (macWechatMatch) {
                participants.add(macWechatMatch[1].trim());
            }
        });

        // 兼容没有任何名字的纯乱排文本，给出默认两个角色
        if (participants.size === 0) {
            participants.add('对方');
            participants.add('我');
        }

        res.json({
            preview: lines.slice(0, 20).join('\n'),
            participants: Array.from(participants)
        });
    } catch (error) {
        console.error('预览聊天记录失败:', error);
        res.status(500).json({ error: '预览聊天记录失败' });
    }
});

app.get('/api/characters', (_req, res) => {
    const characters = getAllCharacters();
    const list = Object.entries(characters).map(([id, char]) => ({
        id,
        name: char.name,
        avatar: char.avatar,
        description: char.description,
        isCustom: char.isCustom,
        ...(char.isCustom ? { age: char.age, profession: char.profession } : {}),
    }));
    res.json({ characters: list });
});

app.get('/api/character/:id', (req, res) => {
    const charInfo = getCharacterInfo(req.params.id);
    if (!charInfo) {
        res.status(404).json({ error: '角色不存在' });
        return;
    }
    res.json({
        id: req.params.id,
        name: charInfo.name,
        avatar: charInfo.avatar,
        description: charInfo.description,
        prompt: charInfo.prompt,
        isCustom: charInfo.isCustom,
        ...(charInfo.isCustom ? { age: charInfo.age, profession: charInfo.profession } : {}),
    });
});

app.post('/api/character', upload.single('chatlog'), async (req, res) => {
    const { id, name, avatar, description, prompt, age, profession, targetSender } = req.body;

    // 基本校验
    if (!id || !name) {
        res.status(400).json({ error: '缺少必要参数（id, name）' });
        return;
    }
    const ageNum = parseInt(age);
    if (!ageNum || ageNum < 1 || ageNum > 120) {
        res.status(400).json({ error: '请指定有效的年龄（1-120）' });
        return;
    }

    const meta: CharacterMeta = { age: ageNum, profession: profession || undefined };
    let finalPrompt = prompt || '';

    // 如果上传了聊天记录文件，从中生成 prompt + 启动 RAG 训练
    if (req.file) {
        const chatlogContent = req.file.buffer.toString('utf-8');
        if (!targetSender) {
            res.status(400).json({ error: '上传聊天记录时必须指定 targetSender（要学习的发送者）' });
            return;
        }

        const parseResult = parseChatLogAndGeneratePrompt(chatlogContent, targetSender, name);
        if (!parseResult.success) {
            res.status(400).json({ error: parseResult.error, participants: parseResult.participants });
            return;
        }

        finalPrompt = parseResult.prompt || '';

        // 注入元数据到 prompt
        finalPrompt = injectMetaIntoPrompt(finalPrompt, meta);

        // 异步启动 RAG 训练
        if (parseResult.qaPairs && parseResult.qaPairs.length > 0) {
            trainCharacterRAG(id, parseResult.qaPairs).catch(err => {
                console.error('[API] RAG training failed:', err);
            });
        }
    } else {
        // 手动创建模式，必须有 prompt
        if (!finalPrompt) {
            res.status(400).json({ error: '手动创建角色时必须填写角色人设（prompt）' });
            return;
        }
        // 注入元数据到 prompt
        finalPrompt = injectMetaIntoPrompt(finalPrompt, meta);
    }

    const success = addCustomCharacter(id, name, avatar || '🤖', description || '', finalPrompt, meta);
    if (!success) {
        res.status(400).json({ error: '角色ID已存在或与默认角色冲突' });
        return;
    }
    res.json({
        success: true,
        character: { id, name, avatar: avatar || '🤖', description: description || '', age: ageNum, profession }
    });
});

// 追加聊天记录训练（仅限已存在的自定义角色）
app.post('/api/character/:id/append-chatlog', upload.single('chatlog'), async (req, res) => {
    const characterId = req.params.id;

    if (!isCustomCharacter(characterId as string)) {
        res.status(403).json({ error: '只能对自定义创建的角色追加聊天记录训练' });
        return;
    }

    if (!req.file) {
        res.status(400).json({ error: '请上传聊天记录文件' });
        return;
    }

    const { targetSender } = req.body;
    if (!targetSender) {
        res.status(400).json({ error: '请指定要学习的发送者（targetSender）' });
        return;
    }

    const chatlogContent = req.file.buffer.toString('utf-8');
    const charInfo = getCharacterInfo(characterId as string);
    const charName: string = charInfo?.name || (characterId as string);
    const parseResult = parseChatLogAndGeneratePrompt(chatlogContent, targetSender as string, charName);

    if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error, participants: parseResult.participants });
        return;
    }

    if (!parseResult.qaPairs || parseResult.qaPairs.length === 0) {
        res.json({ success: true, message: '聊天记录中未找到可训练的问答对', newCount: 0 });
        return;
    }

    const ragResult = await trainCharacterRAG(characterId as string, parseResult.qaPairs);
    res.json({
        success: true,
        message: `追加训练完成：新增 ${ragResult.newCount} 条向量记忆`,
        newCount: ragResult.newCount,
        messageCount: parseResult.messageCount,
    });
});

app.put('/api/character/:id', (req, res) => {
    const { name, avatar, description, prompt } = req.body;
    const success = updateCharacter(req.params.id, name, avatar, description, prompt);
    if (!success) {
        res.status(400).json({ error: '角色不存在' });
        return;
    }
    res.json({ success: true });
});

app.post('/api/character/:id/reset', (req, res) => {
    const success = resetCharacterToDefault(req.params.id);
    if (!success) {
        res.status(400).json({ error: '该角色没有可重置的修改' });
        return;
    }
    res.json({ success: true });
});

app.delete('/api/character/:id', requireAuth, (req, res) => {
    const success = deleteCustomCharacter(req.params.id as string);
    if (!success) {
        res.status(400).json({ error: '角色不存在或为默认角色' });
        return;
    }
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    const settings = getSessionSettings(sessionId);
    res.json(settings);
});

app.post('/api/session', (req, res) => {
    const { sessionId = 'default', ...settings } = req.body;
    updateSessionSettings(sessionId, settings);
    const updated = getSessionSettings(sessionId);
    res.json({ success: true, settings: updated });
});

app.post('/api/character/switch', async (req, res) => {
    const { sessionId = 'default', characterId } = req.body;
    if (!characterId) {
        res.status(400).json({ error: '请指定角色 ID' });
        return;
    }
    try {
        const success = await switchCharacter(sessionId, characterId);
        if (!success) {
            res.status(400).json({ error: '无效的角色 ID' });
            return;
        }
        const settings = getSessionSettings(sessionId);
        res.json({ success: true, settings });
    } catch (error) {
        console.error('切换角色失败:', error);
        res.status(500).json({ error: '切换角色时发生错误' });
    }
});

app.post('/api/chat', requireAuth, async (req, res) => {
    if (!isApiKeyValid()) {
        res.status(400).json({ error: '请先配置 API Key' });
        return;
    }

    try {
        const { message, sessionId = 'default' } = req.body;
        if (!message) {
            res.status(400).json({ error: '消息不能为空' });
            return;
        }

        const reply = await getReply(sessionId, message);
        const settings = getSessionSettings(sessionId);

        res.json({
            reply,
            character: {
                id: settings.characterType,
                name: settings.characterName,
                avatar: settings.characterAvatar,
            },
        });
    } catch (error) {
        console.error('聊天接口出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

app.post('/api/chat/stream', requireAuth, async (req, res) => {
    if (!isApiKeyValid()) {
        res.status(400).json({ error: '请先配置 API Key' });
        return;
    }

    try {
        const { message, sessionId = 'default', image } = req.body;
        if (!message) {
            res.status(400).json({ error: '消息不能为空' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = getReplyStream(sessionId, message, image || undefined);

        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('流式聊天接口出错:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

app.get('/api/history', (req, res) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    const history = getChatHistory(sessionId);
    res.json({ history, count: history.length });
});

app.get('/api/greeting/check', async (req, res) => {
    if (!isApiKeyValid()) {
        res.json({ should: false });
        return;
    }

    const sessionId = (req.query.sessionId as string) || 'default';
    const result = shouldSendGreeting(sessionId);

    if (result.should && result.message) {
        res.json({ should: true, message: result.message, type: result.type });
    } else if (result.should) {
        try {
            const message = await generateInitiativeMessage(sessionId);
            res.json({ should: true, message, type: 'generated' });
        } catch (error) {
            res.json({ should: false });
        }
    } else {
        res.json({ should: false });
    }
});

app.post('/api/activity', (req, res) => {
    const { sessionId = 'default' } = req.body;
    updateActivity(sessionId);
    res.json({ success: true });
});

app.post('/api/history/clear', requireAuth, (req, res) => {
    const { sessionId = 'default' } = req.body;
    clearChatHistory(sessionId);
    res.json({ success: true });
});

app.get('/api/history/export', (req, res) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    const history = getChatHistory(sessionId);
    const settings = getSessionSettings(sessionId);
    const charName = settings.characterName || 'AI';

    let txt = `对话记录 - ${charName}\n`;
    txt += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
    txt += '='.repeat(40) + '\n\n';

    history.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleString('zh-CN');
        const sender = msg.role === 'user' ? (settings.userName || '我') : charName;
        txt += `[${time}] ${sender}:\n${msg.content}\n\n`;
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const safeCharName = encodeURIComponent(charName);
    res.setHeader('Content-Disposition', `attachment; filename="chat_${safeCharName}_${Date.now()}.txt"; filename*=UTF-8''chat_${safeCharName}_${Date.now()}.txt`);
    res.send(txt);
});

app.use(express.static(path.join(__dirname, '../../public')));

export async function startWebServer(port: number = 3000) {
    return new Promise<void>((resolve) => {
        app.listen(port, () => {
            console.log(`Web 服务已启动: http://localhost:${port}`);
            printApiToken();
            resolve();
        });
    });
}
