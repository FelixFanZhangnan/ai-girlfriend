# AI 女友 - 多平台智能陪伴机器人

> **🎉 当前 v1.0.0 版本说明：**
> 目前的基础聊天、自由切换角色、免费 API 聚合调用等功能已经非常稳定，支持本地客户端无脑一键启动！
> 🚀 **正在火热研发中：** 近期新增了 edge-tts 语音合成系统和 Live2D 虚拟伴侣形象支持，体验更深度沉浸！

一个基于大语言模型的AI陪伴机器人，支持Web网页、微信、Telegram三大平台，提供多角色对话、聊天记录学习、个性化设置等丰富功能。内置桌面 GUI 启动器，可选择 GUI 模式或 Web 模式运行。

## ✨ 功能特性

### 🖥️ 桌面 GUI 启动器
- **可视化配置**：在图形界面中配置 API Key、模型、平台开关等，无需手动编辑配置文件
- **双启动模式**：
  - 🖥️ **GUI 模式** — 在 Electron 桌面窗口中打开聊天界面
  - 🌐 **Web 模式** — 在默认浏览器中打开聊天界面
- **键盘快捷键**：`⌘G` 快速启动 GUI 模式 / `⌘W` 快速启动 Web 模式
- **系统托盘**：最小化到系统托盘，双击恢复窗口

### 🎭 多角色系统
- **默认角色**：
  - 💕 小爱 - 温柔体贴的AI女友，善解人意
  - 🔥 可莉 - 原神中的火花骑士，天真可爱
  - 💔 小雅 - 情感反面教材，用于学习识别PUA
- **自定义角色**：创建属于你的专属AI角色
- **聊天记录学习**：上传微信聊天记录，让AI模仿特定人的说话风格

### 🔊 语音与虚拟形象系统 (New)
- **TTS 语音合成**：支持多角色音色动态切换，自带自动跟读流式播放 (`edge-tts-universal`)
- **Live2D 虚拟形象**：AI 情绪引擎驱动，通过隐藏提示词无感分离表情控制；使用 WebAudio API 根据音频 FFT 振幅实现精准实时口型同步

### 🌐 多平台支持
- **Web网页**：精美的聊天界面，支持实时流式对话
- **微信机器人**：基于网页版微信协议，自动回复消息
- **Telegram机器人**：支持Telegram平台互动

### 💬 微信风格聊天体验
- 消息分段发送，模拟真实聊天
- 人类打字延迟（1.5-3.5秒）
- 无打字光标，更自然的交互
- 角色对话历史持久化

### ⚙️ 丰富的配置选项
- API Key动态配置
- 多种AI模型选择（SiliconFlow平台）
- 服务开关控制（Web/微信/Telegram）
- 角色参数自定义（温度、最大token等）

## 🚀 快速开始

### 环境准备
1. **安装 Node.js**
   - 访问 [Node.js 官网](https://nodejs.org/)
   - 下载 LTS 版本（推荐 v18.x 或 v20.x）
   - 安装后验证：`node -v`

### 安装项目
```bash
# 进入项目目录
cd ai-girlfriend

# 安装依赖
npm install
```

### 启动方式

项目提供**三种**启动方式，选择适合你的：

#### 方式一：桌面 GUI 启动器（推荐 ⭐）

```bash
npm run dev
# 或
npm run start:gui
```

会弹出一个桌面启动器窗口，在其中可以：
- 可视化配置 API Key、模型、平台开关等
- 选择 **GUI 模式**（桌面窗口聊天）或 **Web 模式**（浏览器聊天）
- 配置自动保存到 `.env` 文件

> 💡 首次使用推荐此方式，无需手动编辑 `.env` 文件

#### 方式二：命令行 Web 模式

```bash
npm start
```

直接在终端启动后端服务，然后通过浏览器访问 http://localhost:3000

> ⚠️ 使用此方式前，需要先手动配置 `.env` 文件（见下方配置说明）

#### 方式三：打包安装

```bash
# 打包为当前系统的安装包
npm run dist

# 仅打包 Windows 版本
npm run dist:win

# 仅打包 macOS 版本
npm run dist:mac

# 打包所有平台
npm run dist:all
```

打包后的安装文件在 `release/` 目录中。

### 手动配置 .env（仅命令行模式需要）

如果使用 GUI 启动器，以下配置会在启动器界面中完成，无需手动编辑。

在项目根目录创建 `.env` 文件，填入以下内容：

**方案 A: 使用 SiliconFlow（推荐，国内访问快）**
```ini
OPENAI_API_KEY=你的SiliconFlow密钥
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
DEFAULT_MODEL=Qwen/Qwen2.5-7B-Instruct
```

**方案 B: 使用 OpenAI (ChatGPT)**
```ini
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
```

**方案 C: 使用 DeepSeek**
```ini
OPENAI_API_KEY=你的DeepSeek密钥
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

### 可选配置
```ini
# AI模型 (可在启动器中选择)
DEFAULT_MODEL=Qwen/Qwen2.5-7B-Instruct

# 角色类型 (girlfriend/klee/xiaoya)
CHARACTER_TYPE=girlfriend

# Web服务端口
WEB_PORT=3000

# 启用/禁用平台
ENABLE_WECHAT=true
ENABLE_TELEGRAM=false
ENABLE_WEB=true

# Telegram Bot Token (如启用Telegram)
TELEGRAM_BOT_TOKEN=你的TelegramBotToken
```

### 启动命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 打开桌面 GUI 启动器 |
| `npm run start:gui` | 同上 |
| `npm start` | 命令行直接启动后端服务 |
| `npm run dist` | 打包为桌面应用安装包 |

## 📖 使用指南

### GUI 启动器使用
1. 运行 `npm run dev` 打开启动器
2. 在左侧面板配置：
   - **API Key**：输入你的 API 密钥
   - **API 提供商**：选择 SiliconFlow / OpenAI / DeepSeek
   - **AI 模型**：选择免费或付费模型
   - **服务端口**：默认 3000
   - **默认角色**：小爱 / 可莉 / 小雅
   - **平台开关**：启用/禁用 Web、微信、Telegram
3. 点击右侧的启动按钮：
   - **GUI 模式启动**（或按 `⌘G`）— 在桌面窗口中打开聊天
   - **Web 模式启动**（或按 `⌘W`）— 在浏览器中打开聊天

### Web界面使用
1. 打开浏览器访问 http://localhost:3000
2. 在左侧选择或创建角色
3. 开始聊天！

### 创建自定义角色
1. 点击"创建新角色"按钮
2. 选择创建方式：
   - **手动创建**：填写角色名称、头像、描述和提示词
   - **聊天记录学习**：上传微信聊天记录文件，选择要学习的发送者

### 聊天记录学习
1. 从微信导出聊天记录（文本格式）
2. 在Web界面选择"聊天记录学习"
3. 上传文件，系统会自动解析
4. 选择要模仿的发送者
5. 输入角色名称，完成创建

### 切换角色
- 在左侧角色列表点击任意角色即可切换
- 每个角色的对话历史独立保存

## 🛠️ 技术架构

### 项目结构
```
ai-girlfriend/
├── src/
│   ├── index.ts              # 后端入口文件
│   ├── config.ts             # 配置管理
│   ├── service/
│   │   ├── chat.ts           # 聊天核心逻辑
│   │   └── chatLogParser.ts  # 聊天记录解析
│   └── platform/
│       ├── web.ts            # Web服务 (Express)
│       ├── wechat.ts         # 微信机器人
│       └── telegram.ts       # Telegram机器人
├── public/
│   ├── index.html            # Web聊天界面
│   └── launcher.html         # 桌面启动器界面
├── electron.js               # Electron 主进程（启动器 + 窗口管理）
├── preload.js                # Electron 预加载脚本（IPC桥接）
├── package.json
├── tsconfig.json
└── .env                      # 环境配置
```

### 核心技术栈
- **TypeScript** - 类型安全的JavaScript
- **Express** - Web框架
- **Electron** - 桌面应用框架（GUI启动器 + 窗口模式）
- **OpenAI SDK** - AI模型调用
- **Wechaty** - 微信机器人框架
- **node-telegram-bot-api** - Telegram机器人
- **multer** - 文件上传处理
- **async-mutex** - 并发控制

### API接口
- `GET /api/health` - 健康检查
- `GET /api/models` - 获取可用模型列表
- `POST /api/chat` - 发送聊天消息
- `POST /api/chat/stream` - 流式聊天
- `GET /api/characters` - 获取角色列表
- `POST /api/character` - 创建自定义角色
- `POST /api/character/switch` - 切换角色
- `POST /api/chatlog/parse` - 解析聊天记录
- `POST /api/config/apikey` - 更新API配置
- `POST /api/config/services` - 更新服务配置

## 🤖 支持的AI模型

项目集成了SiliconFlow平台的多种模型：

### 免费模型
- Qwen/Qwen2.5-7B-Instruct - 通义千问2.5 7B
- Qwen/Qwen2-7B-Instruct - 通义千问2 7B
- THUDM/glm-4-9b-chat - 智谱GLM-4 9B
- THUDM/chatglm3-6b - 智谱ChatGLM3 6B
- meta-llama/Meta-Llama-3.1-8B-Instruct - Meta Llama 3.1 8B
- 01-ai/Yi-1.5-9B-Chat - 零一万物Yi 1.5 9B
- google/gemma-2-9b-it - Google Gemma 2 9B
- internlm/internlm2_5-7b-chat - 书生浦语2.5 7B

### 付费模型
- Qwen/Qwen2.5-72B-Instruct - 通义千问2.5 72B
- deepseek-ai/DeepSeek-V2.5 - 深度求索V2.5
- deepseek-ai/DeepSeek-V3 - 深度求索V3
- meta-llama/Meta-Llama-3.1-70B-Instruct - Meta Llama 3.1 70B
- 01-ai/Yi-1.5-34B-Chat - 零一万物Yi 1.5 34B

## ❓ 常见问题

### Q: 如何获取 SiliconFlow API Key？
A: 访问 [SiliconFlow官网](https://siliconflow.cn/) 注册账号，在控制台获取API Key。也可以在 GUI 启动器中直接输入。

### Q: GUI 启动器打不开？
A: 确保已安装 Electron 依赖：运行 `npm install` 安装所有依赖后，再运行 `npm run dev`。

### Q: 微信二维码扫不出来或乱码？
A: 尝试把终端窗口拉大一点，或按 `Ctrl+C` 停止程序，重新运行 `npm start` 刷新二维码。

### Q: 扫码后提示"网页版微信登录受限"？
A: 这是微信官方限制。建议使用注册时间较早、绑定了银行卡的微信号再试。

### Q: 聊天记录需要什么格式？
A: 需要微信导出的文本格式聊天记录，包含时间戳、发送者和消息内容。

### Q: 对话历史会保存吗？
A: 会的，每个角色的对话历史独立保存，24小时后自动清理。

### Q: GUI 模式和 Web 模式有什么区别？
A: GUI 模式使用 Electron 桌面窗口显示聊天界面，有系统托盘支持。Web 模式则在默认浏览器中打开聊天界面。两者功能完全一样，只是运行方式不同。

## 📝 许可证

ISC License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**注意**：本项目仅供学习交流使用，请勿用于商业用途。使用微信机器人时请遵守微信相关规定，建议使用小号测试。
