let live2dInstance = null;
let currentAudioContext = null;
let currentAnalyser = null;
let currentSource = null;

// 根据用户指令，初始化 Live2D
export async function initLive2D(modelPath = '/live2d-models/Hiyori/Hiyori.model3.json') {
    if (live2dInstance) return live2dInstance;

    try {
        const PIXI = await import('/node_modules/pixi.js/dist/pixi.mjs');
        const { Live2D } = await import('/node_modules/easy-live2d/dist/index.js');

        // 设置全局 PIXI 供 SDK 内部使用
        window.PIXI = PIXI;

        const canvas = document.getElementById('live2d-canvas');
        if (!canvas) {
            console.error('Live2D Canvas 未找到');
            return null;
        }

        live2dInstance = new Live2D({
            models: [{
                path: modelPath,
                scale: 0.15,
                offsetX: 0,
                offsetY: 0
            }],
            canvas: canvas,
            transparent: true,
            autoUpdate: true,
            MouseFollow: true
        });

        // 绑定一些交互
        live2dInstance.on('contextReady', () => {
             console.log('Live2D 渲染上下文准备完毕');
        });

        // 将实例挂载到 window，供 index.html 的代码调用
        window.live2dInstance = live2dInstance;

        // 设置口型同步循环
        setupLipSyncLoop();

        return live2dInstance;
    } catch (error) {
        console.error('Live2D 初始化失败:', error);
    }
}

// 控制表情切换
export function live2dSetEmotion(emotion) {
    if (!live2dInstance) return;
    
    // 假设常用的 Live2D 表情 ID 是这些（需要根据具体模型调整，这里按照常规 Hiyori 结构映射）
    const map = {
        happy: 1,    // ex01
        sad: 2,      // ex02
        angry: 3,    // ex03
        shy: 4,      // ex04
        surprise: 5, // ex05
        normal: 0    // base
    };

    const expressionId = map[emotion] || 0;
    // 如果 SDK 暴露了设置表情接口
    try {
        if (live2dInstance.models[0]?.internalModel?.motionManager) {
            live2dInstance.models[0].internalModel.motionManager.expressionManager.setExpression(expressionId);
        }
    } catch (e) {
        console.warn('表情切换调用失败或模型不支持:', e);
    }
}

// 切换画布显示隐藏
export function toggleLive2D() {
    const canvas = document.getElementById('live2d-canvas');
    if (!canvas) return;

    if (canvas.style.display === 'none') {
        canvas.style.display = 'block';
        if (!live2dInstance) {
            initLive2D();
        }
    } else {
        canvas.style.display = 'none';
    }
}

function setupLipSyncLoop() {
    function processLipSync() {
        if (currentAnalyser && live2dInstance) {
            const dataArray = new Uint8Array(currentAnalyser.frequencyBinCount);
            currentAnalyser.getByteFrequencyData(dataArray);

            // 计算音量平均值 0-255
            let sum = 0;
            for(let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const volume = average / 255.0; // 0.0 ~ 1.0

            // 写入 Live2D Core ParamMouthOpenY
            try {
                const coreModel = live2dInstance.models[0]?.internalModel?.coreModel;
                if (coreModel) {
                    // 放大概率，使嘴唇动得更明显
                    let openY = Math.min(1.0, volume * 1.5);
                    coreModel.setParameterValueById('ParamMouthOpenY', openY);
                }
            } catch(e) {}
        }
        requestAnimationFrame(processLipSync);
    }
    requestAnimationFrame(processLipSync);
}

// 对外暴露的播放入口，接收 url 并进行 Web Audio 播放
window.live2dLipSync = async function(audioUrl, onended) {
    try {
        if (!currentAudioContext) {
            currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (currentAudioContext.state === 'suspended') {
            await currentAudioContext.resume();
        }

        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await currentAudioContext.decodeAudioData(arrayBuffer);

        currentSource = currentAudioContext.createBufferSource();
        currentSource.buffer = audioBuffer;

        currentAnalyser = currentAudioContext.createAnalyser();
        currentAnalyser.fftSize = 256;

        currentSource.connect(currentAnalyser);
        currentAnalyser.connect(currentAudioContext.destination);

        currentSource.onended = () => {
            currentSource = null;
            currentAnalyser = null;
            if (live2dInstance) {
                try {
                    const coreModel = live2dInstance.models[0]?.internalModel?.coreModel;
                    if (coreModel) coreModel.setParameterValueById('ParamMouthOpenY', 0);
                } catch(e){}
            }
            if (onended) onended();
        };

        currentSource.start(0);

        return currentSource;
    } catch (error) {
        console.error('Web Audio 解析失败:', error);
        if (onended) onended();
        return null;
    }
};

window.toggleLive2D = toggleLive2D;
window.live2dSetEmotion = live2dSetEmotion;
