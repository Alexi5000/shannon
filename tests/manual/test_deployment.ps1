# Shannon Deployment Test Script
# Tests complete Shannon deployment: backend (Temporal + worker) + frontend (UI)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=========================================="
Write-Host "  Shannon Deployment Test"
Write-Host "=========================================="
Write-Host ""

# Test 1: Check Docker is running
Write-Host "[1/8] Checking Docker..." -ForegroundColor Cyan
try {
    docker version | Out-Null
    Write-Host "  ✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Docker is not running - please start Docker Desktop" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: Check Temporal container
Write-Host "[2/8] Checking Temporal container..." -ForegroundColor Cyan
$temporal = docker ps --filter "name=shannon-temporal" --format "{{.Status}}"
if ($temporal -like "*healthy*") {
    Write-Host "  ✅ Temporal is healthy: $temporal" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Temporal status: $temporal" -ForegroundColor Yellow
    Write-Host "  Starting Temporal..." -ForegroundColor Yellow
    docker compose up -d temporal
    Start-Sleep 15
}
Write-Host ""

# Test 3: Check worker container
Write-Host "[3/8] Checking Shannon worker..." -ForegroundColor Cyan
$worker = docker ps --filter "name=shannon-worker" --format "{{.Status}}"
if ($worker) {
    Write-Host "  ✅ Worker is running: $worker" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Worker not running - starting..." -ForegroundColor Yellow
    docker compose up -d worker
    Start-Sleep 10
}
Write-Host ""

# Test 4: Check Shannon UI server
Write-Host "[4/8] Checking Shannon UI server..." -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost:4005/health" -TimeoutSec 3
    Write-Host "  ✅ Shannon UI is healthy" -ForegroundColor Green
    Write-Host "     Service: $($health.service)" -ForegroundColor Gray
    Write-Host "     Version: $($health.version)" -ForegroundColor Gray
    Write-Host "     Temporal: $($health.temporal)" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Shannon UI not responding on port 4005" -ForegroundColor Red
    Write-Host "     Start with: cd ui; bun run dev" -ForegroundColor Yellow
}
Write-Host ""

# Test 5: Check WebSocket server
Write-Host "[5/8] Checking WebSocket server..." -ForegroundColor Cyan
$wsTest = Test-NetConnection localhost -Port 4006 -InformationLevel Quiet
if ($wsTest) {
    Write-Host "  ✅ WebSocket port 4006 is listening" -ForegroundColor Green
} else {
    Write-Host "  ❌ WebSocket port 4006 not responding" -ForegroundColor Red
}
Write-Host ""

# Test 6: Test Shannon API status
Write-Host "[6/8] Testing Shannon API..." -ForegroundColor Cyan
try {
    $status = Invoke-RestMethod -Uri "http://localhost:4005/api/status" -TimeoutSec 3
    Write-Host "  ✅ API is responding" -ForegroundColor Green
    Write-Host "     Temporal connected: $($status.temporal.connected)" -ForegroundColor Gray
    Write-Host "     Active workflows: $($status.activeWorkflows)" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ API test failed" -ForegroundColor Red
}
Write-Host ""

# Test 7: Check TechTide integration
Write-Host "[7/8] Testing TechTide integration..." -ForegroundColor Cyan
try {
    $gateway = Invoke-RestMethod -Uri "http://localhost:18789/health" -TimeoutSec 3
    if ($gateway.connections.shannon) {
        Write-Host "  ✅ Molten Gateway sees Shannon: CONNECTED" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Molten Gateway sees Shannon: DISCONNECTED" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Molten Gateway not running on port 18789" -ForegroundColor Yellow
}
Write-Host ""

# Test 8: UI accessibility
Write-Host "[8/8] Testing UI accessibility..." -ForegroundColor Cyan
try {
    $ui = Invoke-WebRequest -Uri "http://localhost:4005/" -TimeoutSec 3
    if ($ui.Content -like '*SHANNON*') {
        Write-Host "  ✅ Shannon UI HTML serves correctly" -ForegroundColor Green
        Write-Host "     Contains SHANNON branding" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠️  UI loaded but branding not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ UI not accessible" -ForegroundColor Red
}
Write-Host ""

Write-Host "=========================================="
Write-Host "  Shannon Deployment Summary"
Write-Host "=========================================="
Write-Host ""
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "  Shannon UI:     http://localhost:4005" -ForegroundColor White
Write-Host "  WebSocket:      ws://localhost:4006" -ForegroundColor White
Write-Host "  Temporal UI:    http://localhost:8233" -ForegroundColor White
Write-Host ""
Write-Host "Open Shannon UI to see the orange pulsating effect!" -ForegroundColor Yellow
Write-Host "  start http://localhost:4005" -ForegroundColor Gray
Write-Host ""
