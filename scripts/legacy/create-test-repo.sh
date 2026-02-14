#!/bin/bash
cd ~/shannon
mkdir -p repos/direct-activity-test
cd repos/direct-activity-test
git init
git config user.email "shannon@test.com"
git config user.name "Shannon Test"
echo "test" > README.md
git add .
git commit -m "initial commit"
cd ../..
ls -la repos/direct-activity-test
node test-spawn-subdir2.mjs
