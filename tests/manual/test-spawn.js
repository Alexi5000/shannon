// Test if spawn works in container
const { spawn } = require('child_process');

console.log('Testing spawn in container...');
console.log('process.execPath:', process.execPath);
console.log('PATH:', process.env.PATH);

// Test 1: Spawn using absolute path
console.log('\nTest 1: Absolute path');
const test1 = spawn('/usr/bin/node', ['--version']);
test1.on('error', (err) => console.log('Test 1 FAILED:', err.message));
test1.on('close', (code) => console.log('Test 1 exit code:', code));

// Test 2: Spawn using 'node' command
setTimeout(() => {
  console.log('\nTest 2: Command name');
  const test2 = spawn('node', ['--version']);
  test2.on('error', (err) => console.log('Test 2 FAILED:', err.message));
  test2.on('close', (code) => console.log('Test 2 exit code:', code));
}, 1000);

// Test 3: Spawn npx
setTimeout(() => {
  console.log('\nTest 3: npx command');
  const test3 = spawn('npx', ['--version']);
  test3.on('error', (err) => console.log('Test 3 FAILED:', err.message));
  test3.on('close', (code) => console.log('Test 3 exit code:', code));
}, 2000);

setTimeout(() => process.exit(0), 4000);
