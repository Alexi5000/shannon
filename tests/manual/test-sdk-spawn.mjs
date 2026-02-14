import { query } from '@anthropic-ai/claude-agent-sdk';
import { dirname } from 'node:path';

console.log('Testing Claude SDK spawn...');
console.log(`Node.js: ${process.execPath}`);
console.log(`Node dir: ${dirname(process.execPath)}`);
console.log(`PATH: ${process.env.PATH?.substring(0, 200)}`);

try {
  const testDir = './repos/sdk-spawn-test';
  
  const options = {
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 1,
    cwd: testDir,
    permissionMode: 'bypassPermissions',
    mcpServers: {},
  };
  
  console.log('\\nCalling SDK query()...');
  
  for await (const message of query({ prompt: 'Just say "Hello from Claude!" and stop.', options })) {
    console.log(`Message type: ${message.type}`);
    if (message.type === 'complete') {
      console.log(`Result: ${message.result}`);
      break;
    }
  }
  
  console.log('\\n✓ SDK spawn test PASSED');
  process.exit(0);
} catch (error) {
  console.error('\\n✗ SDK spawn test FAILED:');
  console.error(error);
  process.exit(1);
}
