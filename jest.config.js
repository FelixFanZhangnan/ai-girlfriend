/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    // 防止测试时加载 .env 中的真实 API Key
    setupFiles: ['<rootDir>/tests/setup.ts'],
    // 超时设置（某些测试涉及 API Mock）
    testTimeout: 10000,
};
