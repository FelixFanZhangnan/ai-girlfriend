import { WechatyBuilder, types } from 'wechaty';
import qrTerm from 'qrcode-terminal';
import { getReply } from '../service/chat';

export function startWechatBot() {
    const bot = WechatyBuilder.build({
        name: 'ai-girlfriend',
        puppet: 'wechaty-puppet-wechat4u',
    });

    bot.on('scan', (qrcode: string) => {
        qrTerm.generate(qrcode, { small: true });
        console.log('请用微信扫描上方二维码登录');
    });

    bot.on('login', (user: any) => {
        console.log(`登录成功: ${user}`);
    });

    bot.on('message', async (msg) => {
        // 忽略自己发送的消息
        if (msg.self()) return;

        // 只处理文本消息
        if (msg.type() !== types.Message.Text) return;

        const text = msg.text();
        const userId = msg.talker().id;

        console.log(`收到消息 [${userId}]: ${text}`);

        try {
            const reply = await getReply(userId, text);
            await msg.say(reply);
            console.log(`回复 [${userId}]: ${reply}`);
        } catch (error) {
            console.error('回复消息出错:', error);
            await msg.say('抱歉，我遇到了一点问题~');
        }
    });

    bot.on('logout', (user: any) => {
        console.log(`已退出: ${user}`);
    });

    bot.start()
        .then(() => console.log('微信机器人已启动'))
        .catch((err: Error) => console.error('微信机器人启动失败:', err));
}