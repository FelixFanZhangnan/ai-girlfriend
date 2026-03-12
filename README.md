# AI Girlfriend - Multi-Platform AI Companion Bot

> **🎉 Current v1.0.0 Release Notes:**
> The fundamental chat abilities, character switching, and free API integrations are extremely stable now! You can easily launch the local client with zero configuration.
> 🚀 **Currently in Hot Development:** We've recently added edge-tts Voice Synthesis capabilities and Live2D virtual avatars for fully immersive interactions! Stay tuned for more!

An AI companion bot based on large language models, supporting Web, WeChat, and Telegram platforms. Features a desktop GUI launcher, multi-character conversations, chat log learning, and personalized settings.

## ✨ Features

### 🖥️ Desktop GUI Launcher
- **Visual Configuration**: Configure API Key, model, platform toggles, etc. in a graphical interface — no need to manually edit config files
- **Dual Launch Modes**:
  - 🖥️ **GUI Mode** — Opens the chat interface in an Electron desktop window
  - 🌐 **Web Mode** — Opens the chat interface in the default browser
- **Keyboard Shortcuts**: `⌘G` for GUI mode / `⌘W` for Web mode
- **System Tray**: Minimizes to system tray, double-click to restore

### 🎭 Multi-Character System
- **Default Characters**:
  - 💕 Xiaoai - A gentle and thoughtful AI girlfriend
  - 🔥 Klee - Spark Knight from Genshin Impact, innocent and cute
  - 💔 Xiaoya - Emotional lessons character, for learning to identify manipulation
- **Custom Characters**: Create your own exclusive AI characters
- **Chat Log Learning**: Upload WeChat chat logs to let AI mimic specific people's speaking styles

### 🔊 Voice & Avatar System (New)
- **TTS Voice Synthesis**: Support dynamically switching character voices with automatic speech reading using `edge-tts-universal`.
- **Live2D Virtual Avatar**: AI emotional engine dynamically drives facial expressions and WebAudio API controls lip-sync for realistic immersion.

### 🌐 Multi-Platform Support
- **Web Interface**: Beautiful chat interface with real-time streaming conversations
- **WeChat Bot**: Based on WeChat web protocol, auto-replies to messages
- **Telegram Bot**: Supports Telegram platform interactions

### 💬 WeChat-Style Chat Experience
- Segmented message sending, simulating real conversations
- Human-like typing delays (1.5-3.5 seconds)
- No typing cursor, more natural interaction
- Character-specific conversation history persistence

### ⚙️ Rich Configuration Options
- Dynamic API Key configuration
- Multiple AI model selection (SiliconFlow platform)
- Service toggle controls (Web/WeChat/Telegram)
- Character parameter customization (temperature, max tokens, etc.)

## 🚀 Quick Start

### Prerequisites
1. **Install Node.js**
   - Visit [Node.js Official Website](https://nodejs.org/)
   - Download LTS version (recommended v18.x or v20.x)
   - Verify installation: `node -v`

### Installation
```bash
# Navigate to project directory
cd ai-girlfriend

# Install dependencies
npm install
```

### Launch Methods

The project provides **three** ways to start — choose what suits you:

#### Method 1: Desktop GUI Launcher (Recommended ⭐)

```bash
npm run dev
# or
npm run start:gui
```

A desktop launcher window will appear where you can:
- Visually configure API Key, model, platform toggles, etc.
- Choose **GUI Mode** (desktop window chat) or **Web Mode** (browser chat)
- Configuration is automatically saved to `.env`

> 💡 Recommended for first-time users — no need to manually edit `.env`

#### Method 2: Command-Line Web Mode

```bash
npm start
```

Starts the backend server directly in the terminal, then access via browser at http://localhost:3000

> ⚠️ Requires manual `.env` configuration first (see below)

#### Method 3: Build Installable Package

```bash
# Build for current platform
npm run dist

# Build for Windows only
npm run dist:win

# Build for macOS only
npm run dist:mac

# Build for all platforms
npm run dist:all
```

Built installers will be in the `release/` directory.

### Manual .env Configuration (CLI mode only)

If using the GUI Launcher, this configuration is done visually in the launcher interface.

Create a `.env` file in the project root:

**Option A: Using SiliconFlow (Recommended, fast in China)**
```ini
OPENAI_API_KEY=your_SiliconFlow_api_key
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
DEFAULT_MODEL=Qwen/Qwen2.5-7B-Instruct
```

**Option B: Using OpenAI (ChatGPT)**
```ini
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
```

**Option C: Using DeepSeek**
```ini
OPENAI_API_KEY=your_DeepSeek_api_key
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

### Optional Configuration
```ini
# AI Model (selectable in the launcher)
DEFAULT_MODEL=Qwen/Qwen2.5-7B-Instruct

# Character type (girlfriend/klee/xiaoya)
CHARACTER_TYPE=girlfriend

# Web service port
WEB_PORT=3000

# Enable/disable platforms
ENABLE_WECHAT=true
ENABLE_TELEGRAM=false
ENABLE_WEB=true

# Telegram Bot Token (if enabling Telegram)
TELEGRAM_BOT_TOKEN=your_Telegram_bot_token
```

### Command Quick Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Open desktop GUI launcher |
| `npm run start:gui` | Same as above |
| `npm start` | Start backend server via CLI |
| `npm run dist` | Build installable desktop app |

## 📖 Usage Guide

### GUI Launcher Usage
1. Run `npm run dev` to open the launcher
2. Configure in the left panel:
   - **API Key**: Enter your API key
   - **API Provider**: Choose SiliconFlow / OpenAI / DeepSeek
   - **AI Model**: Select free or paid models
   - **Port**: Default 3000
   - **Default Character**: Xiaoai / Klee / Xiaoya
   - **Platform Toggles**: Enable/disable Web, WeChat, Telegram
3. Click a launch button on the right:
   - **GUI Mode** (or press `⌘G`) — Opens chat in desktop window
   - **Web Mode** (or press `⌘W`) — Opens chat in browser

### Web Interface Usage
1. Open browser and visit http://localhost:3000
2. Select or create a character on the left sidebar
3. Start chatting!

### Creating Custom Characters
1. Click "Create New Character" button
2. Choose creation method:
   - **Manual Creation**: Fill in character name, avatar, description, and prompt
   - **Chat Log Learning**: Upload WeChat chat log file, select sender to learn from

### Chat Log Learning
1. Export chat logs from WeChat (text format)
2. Select "Chat Log Learning" in Web interface
3. Upload file, system will auto-parse
4. Select sender to mimic
5. Enter character name, complete creation

### Switching Characters
- Click any character in left sidebar to switch
- Each character's conversation history is saved independently

## 🛠️ Technical Architecture

### Project Structure
```
ai-girlfriend/
├── src/
│   ├── index.ts              # Backend entry file
│   ├── config.ts             # Configuration management
│   ├── service/
│   │   ├── chat.ts           # Core chat logic
│   │   └── chatLogParser.ts  # Chat log parser
│   └── platform/
│       ├── web.ts            # Web service (Express)
│       ├── wechat.ts         # WeChat bot
│       └── telegram.ts       # Telegram bot
├── public/
│   ├── index.html            # Web chat interface
│   └── launcher.html         # Desktop launcher interface
├── electron.js               # Electron main process (launcher + window management)
├── preload.js                # Electron preload script (IPC bridge)
├── package.json
├── tsconfig.json
└── .env                      # Environment configuration
```

### Core Tech Stack
- **TypeScript** - Type-safe JavaScript
- **Express** - Web framework
- **Electron** - Desktop app framework (GUI launcher + window mode)
- **OpenAI SDK** - AI model calling
- **Wechaty** - WeChat bot framework
- **node-telegram-bot-api** - Telegram bot
- **multer** - File upload handling
- **async-mutex** - Concurrency control

### API Endpoints
- `GET /api/health` - Health check
- `GET /api/models` - Get available model list
- `POST /api/chat` - Send chat message
- `POST /api/chat/stream` - Streaming chat
- `GET /api/characters` - Get character list
- `POST /api/character` - Create custom character
- `POST /api/character/switch` - Switch character
- `POST /api/chatlog/parse` - Parse chat log
- `POST /api/config/apikey` - Update API configuration
- `POST /api/config/services` - Update service configuration

## 🤖 Supported AI Models

Project integrates multiple models from SiliconFlow platform:

### Free Models
- Qwen/Qwen2.5-7B-Instruct - Qwen 2.5 7B
- Qwen/Qwen2-7B-Instruct - Qwen 2 7B
- THUDM/glm-4-9b-chat - GLM-4 9B
- THUDM/chatglm3-6b - ChatGLM3 6B
- meta-llama/Meta-Llama-3.1-8B-Instruct - Meta Llama 3.1 8B
- 01-ai/Yi-1.5-9B-Chat - Yi 1.5 9B
- google/gemma-2-9b-it - Google Gemma 2 9B
- internlm/internlm2_5-7b-chat - InternLM2.5 7B

### Paid Models
- Qwen/Qwen2.5-72B-Instruct - Qwen 2.5 72B
- deepseek-ai/DeepSeek-V2.5 - DeepSeek V2.5
- deepseek-ai/DeepSeek-V3 - DeepSeek V3
- meta-llama/Meta-Llama-3.1-70B-Instruct - Meta Llama 3.1 70B
- 01-ai/Yi-1.5-34B-Chat - Yi 1.5 34B

## ❓ FAQ

### Q: How to get SiliconFlow API Key?
A: Visit [SiliconFlow Official Website](https://siliconflow.cn/) to register and get API Key in console. You can also enter it directly in the GUI launcher.

### Q: GUI launcher won't open?
A: Make sure Electron dependencies are installed: run `npm install` first, then `npm run dev`.

### Q: WeChat QR code won't scan or is garbled?
A: Try making the terminal window larger, or press `Ctrl+C` to stop the program and rerun `npm start` to refresh the QR code.

### Q: Scanning shows "Web WeChat login restricted"?
A: This is WeChat official restriction. Recommend using an older WeChat account with bank card bound.

### Q: What format do chat logs need to be?
A: Requires text format chat logs exported from WeChat, including timestamp, sender, and message content.

### Q: Will conversation history be saved?
A: Yes, each character's conversation history is saved independently, auto-cleaned after 24 hours.

### Q: What's the difference between GUI mode and Web mode?
A: GUI mode displays the chat interface in an Electron desktop window with system tray support. Web mode opens the chat interface in your default browser. Both have identical functionality, just different runtime environments.

## 📝 License

ISC License

## 🤝 Contributing

Welcome to submit Issues and Pull Requests!

---

**Note**: This project is for learning and communication purposes only, not for commercial use. Please comply with WeChat regulations when using WeChat bot, recommend using a secondary account for testing.
