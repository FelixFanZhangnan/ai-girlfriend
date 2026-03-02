import { config } from './config';
import { startWechatBot } from './platform/wechat';
import { startTelegramBot } from './platform/telegram';
import { startWebServer } from './platform/web';

// 检查 API Key
if (!config.openaiApiKey || config.openaiApiKey.includes('your_api')) {
    console.error('❌ 请在 .env 文件中配置有效的 OPENAI_API_KEY');
    process.exit(1);
}

console.log('✅ API Key 已配置');
console.log(`📝 角色类型: ${config.characterType}`);

// 启动各平台
const isElectron = process.env.ELECTRON_RUN === 'true';

if (config.enableWeb || isElectron) {
    if (isElectron && !config.enableWeb) {
        console.log('🖥️ 检测到 GUI 启动模式，自动开启 Web 服务作为后端 API (GUI 运作必需)');
    }
    startWebServer(config.webPort);
}

if (config.enableWechat) {
    startWechatBot();
}

if (config.enableTelegram) {
    startTelegramBot();
}

if (!config.enableWeb && !config.enableWechat && !config.enableTelegram && !isElectron) {
    console.error('❌ 未启用任何服务 (Web/WeChat/Telegram)，并且非 GUI 模式。程序将退出。');
    process.exit(1);
}

console.log('🚀 所有服务已启动');