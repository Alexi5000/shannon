# Shannon on WSL2 - Quick Start

**Why WSL2?** The Claude Agent SDK cannot spawn subprocesses on native Windows. WSL2 provides a Linux environment where Shannon works correctly.

## One-Time Setup

```bash
# Open WSL2 terminal
wsl

# Navigate to Shannon (use Windows path via /mnt/c)
cd /mnt/c/TechTide/Apps/shannon

# Verify Node.js (should be available from Windows)
node --version  # Should show v18 or higher

# If node not found, install in WSL2:
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt-get install -y nodejs

# Install dependencies (if needed)
npm install
```

## Run Shannon in WSL2

### Start Temporal (if not already running)

```bash
# Temporal can run in Docker on Windows, accessible from WSL2
docker compose up -d temporal

# Verify Temporal is accessible
curl http://localhost:8233  # Should return HTML
```

### Start Shannon Worker

```bash
# In WSL2 terminal
cd /mnt/c/TechTide/Apps/shannon
npm run temporal:worker
```

You should see:
```
[Worker Init] Node.js: /usr/bin/node  # or similar Linux path
[Worker Init] PATH updated to include: /usr/bin
✓ Temporal server ready at localhost:7233
Shannon worker started
Task queue: shannon-pipeline
```

### Start Shannon UI (separate terminal)

```bash
# In WSL2 terminal 2
cd /mnt/c/TechTide/Apps/shannon/ui
bun run dev
```

### Test Shannon

```bash
# In WSL2 terminal 3
cd /mnt/c/TechTide/Apps/shannon
node dist/temporal/client.js http://localhost:3000 repos/test --workflow-id wsl-test --pipeline-testing --wait
```

## Expected Behavior

✅ **Worker should execute agents without spawn errors**  
✅ **Claude SDK subprocess spawns correctly in Linux**  
✅ **All 13 pentest agents execute successfully**  
✅ **Workflows complete through all phases**

## Performance Note

Using `/mnt/c/` paths is slower than native WSL2 paths due to filesystem translation. For better performance:

```bash
# Copy Shannon to WSL2 home directory
cp -r /mnt/c/TechTide/Apps/shannon ~/shannon
cd ~/shannon
npm install  # Reinstall for Linux

# Then run worker
npm run temporal:worker
```

## Troubleshooting

**Worker can't connect to Temporal:**
```bash
# Temporal in Docker should be accessible from WSL2
netstat -an | grep 7233  # Should show listening port
```

**Node not found:**
```bash
# Install Node.js in WSL2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Permission errors:**
```bash
# Fix ownership if needed
sudo chown -R $USER:$USER /mnt/c/TechTide/Apps/shannon
```

## Permanent Solution

Once verified working in WSL2, consider:

1. **Keep Shannon in WSL2:** Best performance, native Linux environment
2. **Docker Compose:** Run entire stack in containers
3. **Replace SDK:** Switch to Anthropic API directly (longer-term)

---

For details on the Windows spawn issue, see `WINDOWS_SPAWN_ISSUE.md`.
