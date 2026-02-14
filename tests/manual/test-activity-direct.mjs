// Direct activity test without Temporal to isolate the issue
import { runClaudePrompt } from './dist/ai/claude-executor.js';
import { loadPrompt } from './dist/prompts/prompt-manager.js';
import { getPromptNameForAgent } from './dist/types/agents.js';
import chalk from 'chalk';

console.log('Testing activity execution directly...');
console.log('process.env.ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY?.substring(0, 20));

const testDir = './repos/direct-activity-test';
const agentName = 'pre-recon';

try {
  console.log('\\nLoading prompt...');
  const promptName = getPromptNameForAgent(agentName);
  const prompt = await loadPrompt(
    promptName,
    { webUrl: 'https://example.com', repoPath: testDir },
    null,
    true // pipeline testing mode
  );
  
  console.log('\\nCalling runClaudePrompt...');
  const result = await runClaudePrompt(
    prompt,
    testDir,
    '',
    agentName,
    agentName,
    chalk.cyan,
    null,
    null,
    1
  );
  
  console.log('\\n✓ Activity executed successfully!');
  console.log('Result:', result);
} catch (err) {
  console.error('\\n✗ Activity failed:', err);
  process.exit(1);
}
