import {AIbitat} from '../src/index'
import {fileInteractionPlugin} from '../src/plugins/file-interaction'

/**
 * File Interaction Plugin Example
 *
 * This example demonstrates how to use the file interaction plugin
 * to enable AI agents to read, write, list, and delete files
 * with security restrictions.
 */

// Initialize AIbitat
const aibitat = new AIbitat({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20240620',
})

// Enable file interaction plugin
// This registers 4 functions: file_read, file_write, file_list, file_delete
aibitat.use(
  fileInteractionPlugin({
    allowedDirs: ['./examples'], // Only allow files in examples directory
    allowedExtensions: ['.txt', '.md', '.json'], // Only allow text files
    maxFileSize: 1048576, // 1MB limit
    enableLogging: true, // Log all operations
  }),
)

// Register a custom function that demonstrates file operations
aibitat.function({
  name: 'analyze-files',
  description:
    'Analyze the content of files in the examples directory and provide a summary.',
  parameters: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    // This function will be called by the AI agent
    // It can use file_read, file_write, file_list, file_delete
    return 'Files are ready for analysis. Use file_list to see all files, file_read to read specific files.'
  },
})

// Create agents
aibitat.agent('🤖', {
  role: 'You are a file system assistant. You can read, write, list, and delete files using the file interaction functions.',
  functions: [
    'file_read',
    'file_write',
    'file_list',
    'file_delete',
    'analyze-files',
  ],
})

// Start the conversation
if (import.meta.main) {
  console.log('=== File Interaction Plugin Example ===\n')
  console.log('Available functions:')
  console.log('- file_read: Read file content')
  console.log('- file_write: Write content to file')
  console.log('- file_list: List files in directory')
  console.log('- file_delete: Delete a file')
  console.log('- analyze-files: Analyze files in examples directory')
  console.log('\nStarting conversation...\n')

  await aibitat.start({
    from: '🧑',
    to: '🤖',
    content: `Please analyze the files in the examples directory. Start by listing all files, then read their contents and provide a summary.`,
  })
}
