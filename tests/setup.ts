// 测试环境初始化
// 设置假的环境变量，防止测试时触发真实 API 请求
process.env.OPENAI_API_KEY = 'test-fake-key';
process.env.OPENAI_BASE_URL = 'https://fake.api.test/v1';
process.env.DEFAULT_MODEL = 'test-model';
process.env.CHARACTER_TYPE = 'girlfriend';
process.env.WEB_PORT = '0'; // 随机端口
process.env.ENABLE_WEB = 'false';
process.env.ENABLE_WECHAT = 'false';
process.env.ENABLE_TELEGRAM = 'false';
