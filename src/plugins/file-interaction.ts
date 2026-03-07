/**
 * File Interaction Plugin for AIbitat
 *
 * Provides safe file system operations with path restrictions.
 * Allows agents to read, write, list, and delete files within specified directories.
 */

import {existsSync} from 'fs'
import * as fs from 'fs/promises'
import * as path from 'path'

import type {AIbitat} from '..'

/**
 * File Interaction Options
 */
interface FileInteractionOptions {
  /**
   * Allowed base directories for file operations.
   * All paths will be resolved relative to these directories.
   * @default ['.']
   */
  allowedDirs?: string[]

  /**
   * Allowed file extensions for read/write operations.
   * Empty list means all extensions are allowed.
   * @default []
   */
  allowedExtensions?: string[]

  /**
   * Maximum file size for read operations (in bytes).
   * @default 1048576 (1MB)
   */
  maxFileSize?: number

  /**
   * Enable operation logging.
   * @default true
   */
  enableLogging?: boolean
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<FileInteractionOptions> = {
  allowedDirs: ['.'],
  allowedExtensions: [],
  maxFileSize: 1048576, // 1MB
  enableLogging: true,
}

/**
 * Validate and resolve path to ensure it's within allowed directories.
 */
function resolveSafePath(
  targetPath: string,
  allowedDirs: string[],
): {success: boolean; resolvedPath?: string; error?: string} {
  try {
    // Resolve to absolute path
    const resolved = path.resolve(targetPath)

    // Check if resolved path is within any allowed directory
    for (const allowedDir of allowedDirs) {
      const absoluteAllowed = path.resolve(allowedDir)
      const relative = path.relative(absoluteAllowed, resolved)

      // If relative path doesn't start with '..' and doesn't start with '..' (meaning resolved is outside or above allowed dir)
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        return {success: true, resolvedPath: resolved}
      }
    }

    return {
      success: false,
      error: `Path "${targetPath}" is outside allowed directories`,
    }
  } catch (error) {
    return {
      success: false,
      error: `Invalid path "${targetPath}": ${(error as Error).message}`,
    }
  }
}

/**
 * Check if file extension is allowed.
 */
function isExtensionAllowed(
  filePath: string,
  allowedExtensions: string[],
): boolean {
  if (allowedExtensions.length === 0) {
    return true
  }

  const ext = path.extname(filePath).toLowerCase()
  return allowedExtensions.some(allowedExt => ext === allowedExt.toLowerCase())
}

/**
 * Get file stats and validate.
 */
async function validateFile(
  filePath: string,
  maxFileSize: number,
): Promise<{success: boolean; error?: string}> {
  try {
    const stats = await fs.stat(filePath)

    if (!stats.isFile()) {
      return {success: false, error: `Path "${filePath}" is not a file`}
    }

    if (stats.size > maxFileSize) {
      return {
        success: false,
        error: `File size (${stats.size} bytes) exceeds maximum (${maxFileSize} bytes)`,
      }
    }

    return {success: true}
  } catch (error) {
    return {
      success: false,
      error: `Cannot access file "${filePath}": ${(error as Error).message}`,
    }
  }
}

/**
 * Log operation if logging is enabled.
 */
function logOperation(
  operation: string,
  details: string,
  enableLogging: boolean,
): void {
  if (enableLogging) {
    console.log(`📁 [File Interaction] ${operation}: ${details}`)
  }
}

/**
 * File Interaction Plugin
 */
export function fileInteractionPlugin(
  options: FileInteractionOptions = {},
): AIbitat.Plugin<any> {
  const opts = {...DEFAULT_OPTIONS, ...options}
  const allowedDirs = opts.allowedDirs.map(dir => path.resolve(dir))

  return {
    name: 'file-interaction-plugin',
    setup(aibitat) {
      /**
       * Read file content
       */
      aibitat.function({
        name: 'file_read',
        description:
          'Read the content of a text file. Returns file content as string.',
        parameters: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Path to the file to read. Can be relative or absolute.',
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
        async handler({path: targetPath}) {
          logOperation('READ', targetPath, opts.enableLogging)

          // Validate path
          const pathValidation = resolveSafePath(targetPath, allowedDirs)
          if (!pathValidation.success) {
            return `Error: ${pathValidation.error}`
          }

          // Check extension
          if (!isExtensionAllowed(targetPath, opts.allowedExtensions)) {
            return `Error: File extension not allowed`
          }

          // Check file stats
          const fileValidation = await validateFile(
            pathValidation.resolvedPath!,
            opts.maxFileSize,
          )
          if (!fileValidation.success) {
            return `Error: ${fileValidation.error}`
          }

          // Read file
          try {
            const content = await fs.readFile(
              pathValidation.resolvedPath!,
              'utf-8',
            )
            return content
          } catch (error) {
            return `Error: Cannot read file "${targetPath}": ${
              (error as Error).message
            }`
          }
        },
      })

      /**
       * Write content to file
       */
      aibitat.function({
        name: 'file_write',
        description:
          'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
        parameters: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Path to the file to write. Can be relative or absolute.',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file.',
            },
            createDirs: {
              type: 'boolean',
              description: 'Create parent directories if they do not exist.',
              default: false,
            },
          },
          required: ['path', 'content'],
          additionalProperties: false,
        },
        async handler({path: targetPath, content, createDirs = false}) {
          logOperation(
            'WRITE',
            `${targetPath} (${content.length} bytes)`,
            opts.enableLogging,
          )

          // Validate path
          const pathValidation = resolveSafePath(targetPath, allowedDirs)
          if (!pathValidation.success) {
            return `Error: ${pathValidation.error}`
          }

          // Check extension
          if (!isExtensionAllowed(targetPath, opts.allowedExtensions)) {
            return `Error: File extension not allowed`
          }

          const resolvedPath = pathValidation.resolvedPath!

          // Create directories if needed
          if (createDirs) {
            const dir = path.dirname(resolvedPath)
            try {
              await fs.mkdir(dir, {recursive: true})
            } catch (error) {
              return `Error: Cannot create directory "${dir}": ${
                (error as Error).message
              }`
            }
          }

          // Write file
          try {
            await fs.writeFile(resolvedPath, content, 'utf-8')
            return `Successfully wrote ${content.length} bytes to "${targetPath}"`
          } catch (error) {
            return `Error: Cannot write file "${targetPath}": ${
              (error as Error).message
            }`
          }
        },
      })

      /**
       * List files in a directory
       */
      aibitat.function({
        name: 'file_list',
        description:
          'List files and directories in a given path. Returns array of file/directory names.',
        parameters: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Path to the directory to list. Defaults to current directory.',
              default: '.',
            },
            includeHidden: {
              type: 'boolean',
              description: 'Include hidden files (starting with dot).',
              default: false,
            },
            recursive: {
              type: 'boolean',
              description: 'List files recursively in subdirectories.',
              default: false,
            },
          },
          required: [],
          additionalProperties: false,
        },
        async handler({
          path: targetPath = '.',
          includeHidden = false,
          recursive = false,
        }) {
          logOperation('LIST', targetPath, opts.enableLogging)

          // Validate path
          const pathValidation = resolveSafePath(targetPath, allowedDirs)
          if (!pathValidation.success) {
            return `Error: ${pathValidation.error}`
          }

          const resolvedPath = pathValidation.resolvedPath!

          // List files
          try {
            const items: string[] = []

            async function traverse(dir: string) {
              const entries = await fs.readdir(dir, {withFileTypes: true})

              for (const entry of entries) {
                // Skip hidden files if not requested
                if (!includeHidden && entry.name.startsWith('.')) {
                  continue
                }

                const fullPath = path.join(dir, entry.name)
                const relative = path.relative(resolvedPath, fullPath)

                if (recursive && entry.isDirectory()) {
                  await traverse(fullPath)
                }

                items.push(relative)
              }
            }

            await traverse(resolvedPath)

            return items.sort().join('\n')
          } catch (error) {
            return `Error: Cannot list directory "${targetPath}": ${
              (error as Error).message
            }`
          }
        },
      })

      /**
       * Delete a file
       */
      aibitat.function({
        name: 'file_delete',
        description: 'Delete a file. Returns success message or error.',
        parameters: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Path to the file to delete. Can be relative or absolute.',
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
        async handler({path: targetPath}) {
          logOperation('DELETE', targetPath, opts.enableLogging)

          // Validate path
          const pathValidation = resolveSafePath(targetPath, allowedDirs)
          if (!pathValidation.success) {
            return `Error: ${pathValidation.error}`
          }

          // Check extension
          if (!isExtensionAllowed(targetPath, opts.allowedExtensions)) {
            return `Error: File extension not allowed`
          }

          const resolvedPath = pathValidation.resolvedPath!

          // Check if file exists
          if (!existsSync(resolvedPath)) {
            return `Error: File "${targetPath}" does not exist`
          }

          // Delete file
          try {
            await fs.unlink(resolvedPath)
            return `Successfully deleted "${targetPath}"`
          } catch (error) {
            return `Error: Cannot delete file "${targetPath}": ${
              (error as Error).message
            }`
          }
        },
      })
    },
  } as AIbitat.Plugin<any>
}
