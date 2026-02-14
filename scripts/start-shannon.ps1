#!/usr/bin/env pwsh
# Shannon Pentesting System Startup Script
# Starts Docker Temporal, builds TypeScript, and launches worker + UI

$ErrorActionPreference = "Stop"

Write-Host "=== Shannon Pentesting System Startup ===" -ForegroundColor Cyan
Write-Host ""

# Get the Shannon root directory (parent of scripts/)
$ShannonRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ShannonRoot

# Step 1: Start Docker Temporal
Write-Host "[1/5] Starting Docker Temporal..." -ForegroundColor Yellow
try {
    docker compose up -d temporal
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed with exit code $LASTEXITCODE"
    }
    Write-Host "  Docker Temporal started" -ForegroundColor Green
} catch {
    Write-Host "  Failed to start Docker Temporal: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Wait for Temporal to be healthy
Write-Host "[2/5] Waiting for Temporal to be healthy..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$temporalReady = $false

while ($attempt -lt $maxAttempts) {
    $attempt++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8233" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $temporalReady = $true
            Write-Host "  Temporal is healthy (attempt $attempt/$maxAttempts)" -ForegroundColor Green
            break
        }
    } catch {
        # Temporal not ready yet
    }
    
    Write-Host "  Waiting for Temporal... (attempt $attempt/$maxAttempts)" -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

if (-not $temporalReady) {
    Write-Host "  Temporal failed to become healthy after $maxAttempts attempts" -ForegroundColor Red
    Write-Host "  Check Docker logs: docker compose logs temporal" -ForegroundColor Yellow
    exit 1
}

# Step 3: Build TypeScript
Write-Host "[3/5] Building TypeScript..." -ForegroundColor Yellow
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE"
    }
    Write-Host "  TypeScript build complete" -ForegroundColor Green
} catch {
    Write-Host "  Build failed: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Start Temporal worker in background
Write-Host "[4/5] Starting Temporal worker..." -ForegroundColor Yellow
try {
    # Start worker in a new PowerShell window
    $workerProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ShannonRoot'; npm run temporal:worker" -PassThru
    Start-Sleep -Seconds 3
    
    if ($workerProcess.HasExited) {
        throw "Worker process exited immediately"
    }
    
    Write-Host "  Worker started (PID: $($workerProcess.Id))" -ForegroundColor Green
} catch {
    Write-Host "  Failed to start worker: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Start UI in background
Write-Host "[5/5] Starting Shannon UI..." -ForegroundColor Yellow
try {
    # Change to ui directory and start the UI in a new PowerShell window
    $uiProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ShannonRoot/ui'; bun run dev" -PassThru
    Start-Sleep -Seconds 3
    
    if ($uiProcess.HasExited) {
        throw "UI process exited immediately"
    }
    
    Write-Host "  UI started (PID: $($uiProcess.Id))" -ForegroundColor Green
} catch {
    Write-Host "  Failed to start UI: $_" -ForegroundColor Red
    Write-Host "  Worker is still running, you can start UI manually with: cd ui; bun run dev" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Shannon System Running ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Temporal UI:  http://localhost:8233" -ForegroundColor Cyan
Write-Host "  Shannon UI:   http://localhost:4005" -ForegroundColor Cyan
Write-Host "  WebSocket:    ws://localhost:4006" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Worker PID:   $($workerProcess.Id)" -ForegroundColor Gray
Write-Host "  UI PID:       $($uiProcess.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop Shannon:" -ForegroundColor Yellow
Write-Host "  docker compose down" -ForegroundColor Gray
Write-Host "  Stop-Process -Id $($workerProcess.Id)" -ForegroundColor Gray
Write-Host "  Stop-Process -Id $($uiProcess.Id)" -ForegroundColor Gray
Write-Host ""
