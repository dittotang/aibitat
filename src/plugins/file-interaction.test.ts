import * as fs from 'fs/promises'
import {mkdir, rm} from 'fs/promises'
import * as path from 'path'
import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {fileInteractionPlugin} from './file-interaction'

// Create mock AIbitat
function createMockAIbitat() {
  const functions: any[] = []
  return {
    function(mock: any) {
      functions.push(mock)
    },
    getFunctions() {
      return functions
    },
  } as any
}

describe('File Interaction Plugin', () => {
  const testDir = path.join(process.cwd(), 'test-files')
  const plugin = fileInteractionPlugin({
    allowedDirs: [testDir],
    allowedExtensions: ['.txt', '.md', '.json'],
    maxFileSize: 1024, // 1KB for testing
    enableLogging: false,
  })

  const mockAIbitat = createMockAIbitat()
  plugin.setup(mockAIbitat)

  beforeAll(async () => {
    // Create test directory
    await mkdir(testDir, {recursive: true})
  })

  afterAll(async () => {
    // Clean up test directory
    await rm(testDir, {recursive: true, force: true})
  })

  describe('Plugin Setup', () => {
    test('should register file_read function', () => {
      const funcs = mockAIbitat.getFunctions()
      expect(funcs.some((f: any) => f.name === 'file_read')).toBe(true)
    })

    test('should register file_write function', () => {
      const funcs = mockAIbitat.getFunctions()
      expect(funcs.some((f: any) => f.name === 'file_write')).toBe(true)
    })

    test('should register file_list function', () => {
      const funcs = mockAIbitat.getFunctions()
      expect(funcs.some((f: any) => f.name === 'file_list')).toBe(true)
    })

    test('should register file_delete function', () => {
      const funcs = mockAIbitat.getFunctions()
      expect(funcs.some((f: any) => f.name === 'file_delete')).toBe(true)
    })
  })

  describe('File Write', () => {
    test('should write content to a file', async () => {
      const fileWriteFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_write')

      const result = await fileWriteFunc.handler({
        path: path.join(testDir, 'test-write.txt'),
        content: 'Hello, World!',
      })

      expect(result).toContain('Successfully wrote')
      expect(result).toContain('test-write.txt')

      // Verify file was written
      const filePath = path.join(testDir, 'test-write.txt')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('Hello, World!')
    })

    test('should create parent directories when createDirs is true', async () => {
      const fileWriteFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_write')

      const result = await fileWriteFunc.handler({
        path: path.join(testDir, 'subdir/nested/test.txt'),
        content: 'Nested content',
        createDirs: true,
      })

      expect(result).toContain('Successfully wrote')

      // Verify file was created
      const filePath = path.join(testDir, 'subdir', 'nested', 'test.txt')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('Nested content')
    })

    test('should reject file with disallowed extension', async () => {
      const fileWriteFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_write')

      const result = await fileWriteFunc.handler({
        path: path.join(testDir, 'test.exe'),
        content: 'Malicious content',
      })

      expect(result).toContain('Error')
      expect(result).toContain('extension not allowed')
    })
  })

  describe('File Read', () => {
    beforeAll(async () => {
      // Create test file
      const testFile = path.join(testDir, 'test-read.txt')
      await fs.writeFile(testFile, 'Test content for reading', 'utf-8')
    })

    test('should read file content', async () => {
      const fileReadFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_read')

      const result = await fileReadFunc.handler({
        path: path.join(testDir, 'test-read.txt'),
      })

      expect(result).toBe('Test content for reading')
    })

    test('should reject reading file with disallowed extension', async () => {
      // Create file with disallowed extension
      const exeFile = path.join(testDir, 'test.exe')
      await fs.writeFile(exeFile, 'Executable content', 'utf-8')

      const fileReadFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_read')

      const result = await fileReadFunc.handler({
        path: path.join(testDir, 'test.exe'),
      })

      expect(result).toContain('Error')
      expect(result).toContain('extension not allowed')
    })

    test('should reject non-existent file', async () => {
      const fileReadFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_read')

      const result = await fileReadFunc.handler({
        path: path.join(testDir, 'non-existent.txt'),
      })

      expect(result).toContain('Error')
      expect(result).toContain('non-existent.txt')
    })
  })

  describe('File List', () => {
    beforeAll(async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'Content 1', 'utf-8')
      await fs.writeFile(path.join(testDir, 'file2.md'), 'Content 2', 'utf-8')
      await fs.writeFile(
        path.join(testDir, '.hidden'),
        'Hidden content',
        'utf-8',
      )
      await mkdir(path.join(testDir, 'subdir'), {recursive: true})
      await fs.writeFile(
        path.join(testDir, 'subdir', 'file3.txt'),
        'Content 3',
        'utf-8',
      )
    })

    test('should list files in directory', async () => {
      const fileListFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_list')

      const result = await fileListFunc.handler({
        path: testDir,
      })

      expect(result).toContain('file1.txt')
      expect(result).toContain('file2.md')
      expect(result).toContain('subdir')
      expect(result).not.toContain('.hidden') // Hidden files excluded by default
    })

    test('should include hidden files when requested', async () => {
      const fileListFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_list')

      const result = await fileListFunc.handler({
        path: testDir,
        includeHidden: true,
      })

      expect(result).toContain('.hidden')
    })

    test('should list files recursively', async () => {
      const fileListFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_list')

      const result = await fileListFunc.handler({
        path: testDir,
        recursive: true,
      })

      expect(result).toContain('file1.txt')
      expect(result).toContain('file2.md')
      expect(result).toContain('subdir')
      expect(result).toContain(path.join('subdir', 'file3.txt'))
    })
  })

  describe('File Delete', () => {
    beforeAll(async () => {
      // Create test file for deletion
      const testFile = path.join(testDir, 'to-delete.txt')
      await fs.writeFile(testFile, 'Delete me', 'utf-8')
    })

    test('should delete a file', async () => {
      const fileDeleteFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_delete')

      const result = await fileDeleteFunc.handler({
        path: path.join(testDir, 'to-delete.txt'),
      })

      expect(result).toContain('Successfully deleted')
      expect(result).toContain('to-delete.txt')

      // Verify file was deleted
      const filePath = path.join(testDir, 'to-delete.txt')
      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    })

    test('should reject deleting non-existent file', async () => {
      const fileDeleteFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_delete')

      const result = await fileDeleteFunc.handler({
        path: path.join(testDir, 'non-existent.txt'),
      })

      expect(result).toContain('Error')
      expect(result).toContain('does not exist')
    })
  })

  describe('Path Security', () => {
    test('should reject path traversal attacks', async () => {
      const fileReadFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_read')

      const result = await fileReadFunc.handler({
        path: '../../../etc/passwd',
      })

      expect(result).toContain('Error')
      expect(result).toContain('outside allowed directories')
    })

    test('should reject absolute paths outside allowed dirs', async () => {
      const fileWriteFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_write')

      const result = await fileWriteFunc.handler({
        path: '/etc/passwd',
        content: 'Malicious',
      })

      expect(result).toContain('Error')
      expect(result).toContain('outside allowed directories')
    })
  })

  describe('File Size Limits', () => {
    test('should reject file exceeding max size', async () => {
      // Create a file larger than max size (1KB)
      const largeContent = 'x'.repeat(2048) // 2KB
      const largeFile = path.join(testDir, 'large.txt')
      await fs.writeFile(largeFile, largeContent, 'utf-8')

      const fileReadFunc = mockAIbitat
        .getFunctions()
        .find((f: any) => f.name === 'file_read')

      const result = await fileReadFunc.handler({
        path: path.join(testDir, 'large.txt'),
      })

      expect(result).toContain('Error')
      expect(result).toContain('exceeds maximum')
    })
  })
})
