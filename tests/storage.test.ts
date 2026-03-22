/**
 * storage.ts 测试
 * 覆盖：本地 JSON 文件的防崩溃读写逻辑
 */
import fs from 'fs';
import path from 'path';
import { saveJSON, loadJSON, loadAllMemories, saveAllMemories } from '../src/service/storage';

// 我们可以利用 jest.spyOn 来 mock fs 方法，避免实际写盘
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

describe('storage.ts JSON 文件读写', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('saveJSON', () => {
        test('如果目录不存在应创建', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            saveJSON('test.json', { a: 1 });
            expect(fs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('data'),
                { recursive: true }
            );
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        test('应当把对象序列化后写入文件', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            saveJSON('test2.json', { hello: 'world' });
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('test2.json'),
                "{\n  \"hello\": \"world\"\n}",
                "utf-8"
            );
        });

        test('遇到异常时捕获而不是崩溃', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.writeFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('Disk full');
            });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            expect(() => saveJSON('fail.json', {})).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('保存 fail.json 失败:'),
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });
    });

    describe('loadJSON', () => {
        test('文件存在时应返回解析结果', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('{"key": "value"}');
            
            const result = loadJSON('valid.json', { default: true });
            expect(result).toEqual({ key: 'value' });
        });

        test('文件不存在时应返回默认值', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            
            const result = loadJSON('missing.json', { default: 'yes' });
            expect(result).toEqual({ default: 'yes' });
        });

        test('文件格式损坏时应捕获异常并返回默认值', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('{ broken json');
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            const result = loadJSON('broken.json', { fallback: 1 });
            expect(result).toEqual({ fallback: 1 });
            expect(consoleSpy).toHaveBeenCalled();
            
            consoleSpy.mockRestore();
        });
    });
});
