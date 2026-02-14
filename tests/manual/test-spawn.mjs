// Test if spawn works in container (ES module)
import { spawn } from 'child_process';

console.log('Testing spawn in container...');
console.log('process.execPath:', process.execPath);
console.log('PATH:', process.env.PATH);
console.log('USER:', process.env.USER);
console.log('HOME:', process.env.HOME);

// Test: Spawn using absolute path
console.log('\nTest: Absolute path spawn');
const test = spawn('/usr/bin/node', ['--version']);
test.stdout.on('data', (data) => console.log('STDOUT:', data.toString()));
test.stderr.on('data', (data) => console.log('STDERR:', data.toString()));
test.on('error', (err) => console.log('ERROR:', err.message));
test.on('close', (code) => {
  console.log('Exit code:', code);
  if (code === 0) {
    console.log('SUCCESS: Spawn works!');
  }
  process.exit(code);
});
