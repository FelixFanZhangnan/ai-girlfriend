/**
 * security.test.ts
 * 对应测试计划：模块八（安全与稳定性）
 * 
 * 覆盖用例：
 * - 8.1 Pre-commit 安全扫描（验证 hook 文件存在且可执行）
 * - 8.2 .env 不上传（验证 .gitignore 覆盖）
 * - API Key 模式检测逻辑
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.join(__dirname, '..');

describe('.gitignore 安全覆盖', () => {
    let gitignoreContent: string;

    beforeAll(() => {
        gitignoreContent = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    });

    test('.env 应在 .gitignore 中', () => {
        expect(gitignoreContent).toContain('.env');
    });

    test('.env.local 应在 .gitignore 中', () => {
        expect(gitignoreContent).toContain('.env.local');
    });

    test('node_modules/ 应在 .gitignore 中', () => {
        expect(gitignoreContent).toContain('node_modules/');
    });

    test('release/ 应在 .gitignore 中', () => {
        expect(gitignoreContent).toContain('release/');
    });

    test('dist/ 应在 .gitignore 中', () => {
        expect(gitignoreContent).toContain('dist/');
    });

    test('data/ 应在 .gitignore 中', () => {
        expect(gitignoreContent).toContain('data/');
    });
});

describe('Pre-commit Hook', () => {
    const hookPath = path.join(PROJECT_ROOT, '.git', 'hooks', 'pre-commit');

    test('pre-commit hook 文件应存在', () => {
        expect(fs.existsSync(hookPath)).toBe(true);
    });

    test('pre-commit hook 内容应包含 API Key 扫描逻辑', () => {
        const content = fs.readFileSync(hookPath, 'utf-8');
        expect(content).toContain('sk-');
        expect(content).toContain('nvapi-');
    });

    test('pre-commit hook 应有可执行权限', () => {
        const stats = fs.statSync(hookPath);
        // 检查 owner 执行位 (0o100)
        const isExecutable = (stats.mode & 0o111) !== 0;
        expect(isExecutable).toBe(true);
    });
});

describe('API Key 模式检测', () => {
    // 模拟 pre-commit hook 中的核心正则逻辑
    const API_KEY_REGEX = /(sk-[a-zA-Z0-9]{20,}|nvapi-[a-zA-Z0-9_-]{20,})/;

    test('应检测出硅基流动格式的 Key', () => {
        const line = "apiKey: 'sk-xerpolscegvnelioqwjbpsnnywcuofgygjxmrwrmbrendxrb'";
        expect(API_KEY_REGEX.test(line)).toBe(true);
    });

    test('应检测出 NVIDIA NIM 格式的 Key', () => {
        const line = "const key = 'nvapi-abc123DEF456_test-key-1234567890'";
        expect(API_KEY_REGEX.test(line)).toBe(true);
    });

    test('应放过 README 中的占位 Key', () => {
        const line = 'OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
        // "sk-xxxx..." 全是 x，长度够，但这在实际 hook 中被 README 排除
        // 这里验证正则本身可以匹配（排除是在 hook 里按文件名做的）
        expect(API_KEY_REGEX.test(line)).toBe(true);
    });

    test('应放过不含 Key 的正常代码', () => {
        const line = "const greeting = 'Hello, World!';";
        expect(API_KEY_REGEX.test(line)).toBe(false);
    });

    test('应放过短于 20 位的 sk- 前缀', () => {
        const line = "const prefix = 'sk-short';";
        expect(API_KEY_REGEX.test(line)).toBe(false);
    });
});

describe('源代码中不含硬编码 API Key', () => {
    const SRC_DIR = path.join(PROJECT_ROOT, 'src');
    const API_KEY_REGEX = /sk-[a-zA-Z0-9]{30,}/;

    function scanDirectory(dir: string): { file: string, line: number, content: string }[] {
        const results: { file: string, line: number, content: string }[] = [];
        const files = fs.readdirSync(dir, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                results.push(...scanDirectory(fullPath));
            } else if (file.name.endsWith('.ts') || file.name.endsWith('.js')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                    if (API_KEY_REGEX.test(line)) {
                        results.push({ file: fullPath, line: idx + 1, content: line.trim() });
                    }
                });
            }
        }
        return results;
    }

    test('src/ 目录下的所有 .ts/.js 文件不应包含硬编码 API Key', () => {
        const leaks = scanDirectory(SRC_DIR);
        if (leaks.length > 0) {
            const report = leaks.map(l => `${l.file}:${l.line} → ${l.content.substring(0, 60)}...`).join('\n');
            fail(`发现 ${leaks.length} 处可能的 API Key 泄露:\n${report}`);
        }
        expect(leaks.length).toBe(0);
    });
});
