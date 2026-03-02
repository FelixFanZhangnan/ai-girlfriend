import TelegramBot from 'node-telegram-bot-api';
import { getReply } from '../service/chat';
import { config } from '../config';

export function startTelegramBot() {
    if (!config.telegramBotToken) {
        console.log('Telegram Bot Token 未配置，跳过启动');
        return;
    }

    const bot = new TelegramBot(config.telegramBotToken, { polling: true });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text) return;

        console.log(`收到 Telegram 消息 [${chatId}]: ${text}`);

        try {
            const reply = await getReply(`telegram-${chatId}`, text);
            await bot.sendMessage(chatId, reply);
            console.log(`回复 Telegram [${chatId}]: ${reply}`);
        } catch (error) {
            console.error('Telegram 回复出错:', error);
            await bot.sendMessage(chatId, '抱歉，我遇到了一点问题~');
        }
    });

    bot.on('polling_error', (error) => {
        console.error('Telegram polling 错误:', error);
    });

    console.log('Telegram 机器人已启动');
}
