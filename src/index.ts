import { config, validateApiKeyOnStartup } from './config';
import { startWechatBot } from './platform/wechat';
import { startTelegramBot } from './platform/telegram';
import { startWebServer } from './platform/web';

// ===== 启动时主动验证 API Key =====
async function main() {
    console.log('🔍 正在验证 API Key...');
    const keyCheck = await validateApiKeyOnStartup();
    console.log(keyCheck.message);

    if (!keyCheck.valid) {
        // Key 无效但不直接退出 —— 仍然启动服务，让用户可以通过界面配置
        console.log('');
        console.log('💡 提示：你仍然可以启动程序，在界面中重新配置有效的 API Key。');
        console.log('');
    }

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
}

main().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});