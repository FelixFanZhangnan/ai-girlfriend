const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let launcherWindow = null;
let mainWindow = null;
let tray = null;
let serverProcess = null;
let isLaunching = false;
let serverRunning = false;
let launchMode = null; // 'gui' or 'web'

const isDev = process.env.NODE_ENV === 'development';

// ===== .env File Helpers =====

function getEnvPath() {
    if (isDev) {
        return path.join(__dirname, '.env');
    }
    // Electron 生产环境：使用用户数据目录存储配置
    const userDataDir = app.getPath('userData');
    const configPath = path.join(userDataDir, 'config.env');

    // 首次启动：创建空的默认配置模板
    if (!fs.existsSync(configPath)) {
        const defaultConfig = [
            '# AI 女友 - 运行时配置',
            '# 通过 GUI 设置页面修改，或手动编辑此文件',
            '',
            'OPENAI_API_KEY=',
            'OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1',
            'DEFAULT_MODEL=qwen/qwen3.5-397b-a17b',
            'CHARACTER_TYPE=girlfriend',
            'WEB_PORT=3000',
            'ENABLE_WEB=true',
            'ENABLE_WECHAT=true',
            'ENABLE_TELEGRAM=false',
            'TELEGRAM_BOT_TOKEN=',
            '',
        ].join('\n');
        try {
            fs.writeFileSync(configPath, defaultConfig, 'utf-8');
            console.log(`首次启动：已在 ${configPath} 创建默认配置`);
        } catch (e) {
            console.error('创建默认配置失败:', e);
        }
    }
    return configPath;
}

function readEnvConfig() {
    const envPath = getEnvPath();
    const config = {
        apiKey: '',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'qwen/qwen3.5-397b-a17b',
        port: 3000,
        characterType: 'girlfriend',
        enableWeb: true,
        enableWechat: true,
        enableTelegram: false,
        telegramToken: '',
    };

    try {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx === -1) continue;
                const key = trimmed.substring(0, eqIdx).trim();
                const value = trimmed.substring(eqIdx + 1).trim();

                switch (key) {
                    case 'OPENAI_API_KEY': config.apiKey = value; break;
                    case 'OPENAI_BASE_URL': config.baseUrl = value; break;
                    case 'DEFAULT_MODEL': config.model = value; break;
                    case 'WEB_PORT': config.port = parseInt(value) || 3000; break;
                    case 'CHARACTER_TYPE': config.characterType = value; break;
                    case 'ENABLE_WEB': config.enableWeb = value !== 'false'; break;
                    case 'ENABLE_WECHAT': config.enableWechat = value !== 'false'; break;
                    case 'ENABLE_TELEGRAM': config.enableTelegram = value === 'true'; break;
                    case 'TELEGRAM_BOT_TOKEN': config.telegramToken = value; break;
                }
            }
        }
    } catch (e) {
        console.error('读取配置失败:', e);
    }

    return config;
}

function saveEnvConfig(config) {
    const envPath = getEnvPath();
    const lines = [
        '# AI 女友 - 运行时配置',
        `OPENAI_API_KEY=${config.apiKey || ''}`,
        `OPENAI_BASE_URL=${config.baseUrl || 'https://integrate.api.nvidia.com/v1'}`,
        '',
        `DEFAULT_MODEL=${config.model || 'qwen/qwen3.5-397b-a17b'}`,
        `CHARACTER_TYPE=${config.characterType || 'girlfriend'}`,
        `TELEGRAM_BOT_TOKEN=${config.telegramToken || ''}`,
        `WEB_PORT=${config.port || 3000}`,
        `ENABLE_WECHAT=${config.enableWechat ? 'true' : 'false'}`,
        `ENABLE_TELEGRAM=${config.enableTelegram ? 'true' : 'false'}`,
        `ENABLE_WEB=${config.enableWeb !== false ? 'true' : 'false'}`,
        '',
    ];
    try {
        fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
        console.log(`配置已保存到 ${envPath}`);
    } catch (e) {
        console.error('保存配置失败:', e);
        throw e;
    }
}

// ===== Window Creators =====

function createLauncherWindow() {
    launcherWindow = new BrowserWindow({
        width: 960,
        height: 700,
        resizable: true,
        minWidth: 780,
        minHeight: 560,
        frame: false,
        transparent: false,
        title: 'AI 女友 - 启动器',
        icon: path.join(__dirname, 'public', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        show: false,
    });

    launcherWindow.loadFile(path.join(__dirname, 'public', 'launcher.html'));

    launcherWindow.once('ready-to-show', () => {
        launcherWindow.show();
        console.log('启动器窗口已显示');
    });

    launcherWindow.on('closed', () => {
        launcherWindow = null;
        // Only quit if NOT in the middle of launching and no other window/server exists
        if (!isLaunching && !mainWindow && !serverRunning) {
            app.quit();
        }
    });
}

function createMainWindow() {
    const serverPort = readEnvConfig().port || 3000;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'AI 女友',
        icon: path.join(__dirname, 'public', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false
    });

    // IMPORTANT: Always load through the Express server URL so API calls work
    // Loading via file:// would break all fetch('/api/...') calls
    mainWindow.loadURL(`http://localhost:${serverPort}`);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log('主窗口已显示');
    });

    // Close button → ask user what to do
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();

            const choice = dialog.showMessageBoxSync(mainWindow, {
                type: 'question',
                buttons: ['最小化到托盘', '退出并停止服务', '取消'],
                defaultId: 0,
                cancelId: 2,
                title: 'AI 女友',
                message: '要怎么处理？',
                detail: '后端服务正在运行中。关闭窗口不会停止服务。',
            });

            if (choice === 0) {
                // Minimize to tray
                mainWindow.hide();
                console.log('窗口已隐藏到托盘');
            } else if (choice === 1) {
                // Quit and stop server
                app.isQuitting = true;
                app.quit();
            }
            // choice === 2: Cancel, do nothing
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    console.log('主窗口已创建');
}

function createTray() {
    if (tray) return; // Prevent duplicate tray icons

    const iconPath = path.join(__dirname, 'public', 'icon.png');
    let trayIcon;

    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            trayIcon = nativeImage.createEmpty();
        }
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } catch (e) {
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);

    const serverPort = readEnvConfig().port || 3000;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示窗口',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else if (launchMode === 'gui') {
                    // Re-create main window if it was fully closed
                    createMainWindow();
                }
            }
        },
        {
            label: '在浏览器中打开',
            click: () => {
                shell.openExternal(`http://localhost:${serverPort}`);
            }
        },
        { type: 'separator' },
        {
            label: '退出并停止服务',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('AI 女友 - 服务运行中');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        } else {
            shell.openExternal(`http://localhost:${serverPort}`);
        }
    });

    console.log('系统托盘已创建');
}

// ===== Server Management =====

function startServer() {
    return new Promise((resolve, reject) => {
        const entryScript = path.join(__dirname, 'src', 'index.ts');
        const tsNodePath = path.join(__dirname, 'node_modules', '.bin', 'ts-node');

        const cmd = process.platform === 'win32' ? `${tsNodePath}.cmd` : tsNodePath;

        serverProcess = spawn(cmd, [entryScript], {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ELECTRON_RUN: 'true' },
            detached: false,
        });

        let started = false;

        const onData = (data) => {
            const text = data.toString();
            console.log('[Server]', text.trim());
            if (!started && (text.includes('Web 服务已启动') || text.includes('所有服务已启动') || text.includes('API Key 已配置'))) {
                started = true;
                serverRunning = true;
                resolve();
            }
        };

        serverProcess.stdout.on('data', onData);
        serverProcess.stderr.on('data', (data) => {
            const text = data.toString().trim();
            if (text.includes('DeprecationWarning') || text.includes('ExperimentalWarning')) return;
            console.error('[Server]', text);
        });

        serverProcess.on('error', (error) => {
            console.error('启动服务器失败:', error);
            serverRunning = false;
            if (!started) reject(error);
        });

        serverProcess.on('exit', (code, signal) => {
            console.log('服务器进程退出:', code, signal);
            serverRunning = false;
            if (!started) reject(new Error(`Server exited with code ${code}, signal ${signal}`));
        });

        setTimeout(() => {
            if (!started) {
                started = true;
                serverRunning = true;
                console.log('服务器启动超时，假定已启动');
                resolve();
            }
        }, 8000);

        console.log('后端服务启动中...');
    });
}

function stopServer() {
    if (serverProcess) {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
        } else {
            serverProcess.kill('SIGTERM');
        }
        serverProcess = null;
        serverRunning = false;
        console.log('后端服务已停止');
    }
}

// ===== IPC Handlers =====

function setupIPC() {
    // Window controls
    ipcMain.handle('window-action', (event, action) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        switch (action) {
            case 'minimize': win.minimize(); break;
            case 'maximize':
                if (win.isMaximized()) win.unmaximize();
                else win.maximize();
                break;
            case 'close': win.close(); break;
        }
    });

    ipcMain.handle('get-env-config', () => {
        return readEnvConfig();
    });

    ipcMain.handle('save-env-config', (_event, config) => {
        saveEnvConfig(config);
        return { success: true };
    });

    ipcMain.handle('launch-gui', async () => {
        try {
            isLaunching = true;
            launchMode = 'gui';

            // Start backend server first (before closing any windows!)
            await startServer();

            // Create main chat window (loads from http://localhost:PORT)
            createMainWindow();
            createTray();

            // Now safe to close the launcher
            if (launcherWindow) {
                launcherWindow.close();
                launcherWindow = null;
            }

            isLaunching = false;
            return { success: true };
        } catch (error) {
            isLaunching = false;
            console.error('GUI 模式启动失败:', error);
            throw error;
        }
    });

    ipcMain.handle('launch-web', async () => {
        try {
            isLaunching = true;
            launchMode = 'web';
            const config = readEnvConfig();
            const port = config.port || 3000;

            // Start backend server first
            await startServer();

            // Create tray so user can manage/quit
            createTray();

            // Open in default browser
            shell.openExternal(`http://localhost:${port}`);

            // Now safe to close the launcher
            if (launcherWindow) {
                launcherWindow.close();
                launcherWindow = null;
            }

            isLaunching = false;
            return { success: true };
        } catch (error) {
            isLaunching = false;
            console.error('Web 模式启动失败:', error);
            throw error;
        }
    });
}

// ===== App Lifecycle =====

app.whenReady().then(() => {
    console.log('应用准备就绪');

    setupIPC();
    createLauncherWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            if (serverRunning && launchMode === 'gui') {
                createMainWindow();
            } else if (!serverRunning) {
                createLauncherWindow();
            }
        } else if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
});

app.on('window-all-closed', () => {
    // Don't quit during launch transition
    if (isLaunching) return;
    // Don't quit if server is running (Web mode or minimized to tray)
    if (serverRunning) return;
    // On macOS, apps stay active until explicitly quit
    if (process.platform === 'darwin') return;
    app.quit();
});

app.on('before-quit', () => {
    app.isQuitting = true;
    stopServer();
});

process.on('exit', () => {
    stopServer();
});
