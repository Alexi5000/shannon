// file: shannon/ui/public/app.js
// description: Shannon UI frontend logic: WebSocket client, terminal renderer, pipeline visualization
// reference: index.html, styles.css

// Configuration
const WS_PORT = window.location.hostname === 'localhost' ? 4006 : parseInt(window.location.port) + 1;
const WS_URL = `ws://${window.location.hostname}:${WS_PORT}`;
const API_BASE = window.location.origin;

// State
let ws = null;
let currentWorkflowId = null;
let isScrollLocked = false;
let startTime = null;
let elapsedInterval = null;
let lastUiErrorMessage = '';
let lastUiErrorTimestampMs = 0;

// DOM Elements
const statusBadge = document.getElementById('statusBadge');
const statusText = statusBadge.querySelector('.status-text');
const targetUrl = document.getElementById('targetUrl');
const repoPath = document.getElementById('repoPath');
const configPath = document.getElementById('configPath');
const browserProfile = document.getElementById('browserProfile');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const terminal = document.getElementById('terminal');
const scrollLockBtn = document.getElementById('scrollLockBtn');
const clearBtn = document.getElementById('clearBtn');
const elapsedTime = document.getElementById('elapsedTime');
const agentProgress = document.getElementById('agentProgress');
const totalCost = document.getElementById('totalCost');
const totalTurns = document.getElementById('totalTurns');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadSavedInputs();
    checkServiceHealth();
});

function initializeEventListeners() {
    startBtn.addEventListener('click', startPentest);
    stopBtn.addEventListener('click', stopPentest);
    scrollLockBtn.addEventListener('click', toggleScrollLock);
    clearBtn.addEventListener('click', clearTerminal);
    
    // Save inputs to localStorage on change
    [targetUrl, repoPath, configPath, browserProfile].forEach(input => {
        input.addEventListener('change', saveInputs);
    });
}

function loadSavedInputs() {
    const saved = localStorage.getItem('shannonInputs');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            targetUrl.value = data.targetUrl || '';
            repoPath.value = data.repoPath || '';
            configPath.value = data.configPath || '';
            browserProfile.value = data.browserProfile || 'red_team';
        } catch (e) {
            console.error('Failed to load saved inputs:', e);
        }
    }
}

function saveInputs() {
    localStorage.setItem('shannonInputs', JSON.stringify({
        targetUrl: targetUrl.value,
        repoPath: repoPath.value,
        configPath: configPath.value,
        browserProfile: browserProfile.value
    }));
}

async function checkServiceHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        if (data.temporal === 'connected') {
            addTerminalLine('✓ Connected to Temporal', 'success');
        } else {
            addTerminalLine('⚠ Temporal not connected', 'error');
        }
    } catch (error) {
        addTerminalLine('✗ Failed to connect to Shannon API', 'error');
    }
}

async function startPentest() {
    const url = targetUrl.value.trim();
    const repo = repoPath.value.trim();
    
    if (!url) {
        alert('Please provide Target URL');
        return;
    }
    
    // Auto-detect mode
    const mode = repo ? 'white_box' : 'black_box';
    
    setUIState('starting');
    addTerminalLine('Initiating pentest...', 'phase');
    addTerminalLine(`Execution Mode: ${mode.toUpperCase().replace('_', '-')}`, 'phase');
    addTerminalLine(`Browser Profile: ${browserProfile.value.toUpperCase().replace('_', '-')}`, 'phase');
    
    try {
        const payload = { url, mode };
        if (repo) payload.repoPath = repo;
        if (configPath.value.trim()) payload.config = configPath.value.trim();
        payload.browserProfile = browserProfile.value;
        
        const response = await fetch(`${API_BASE}/api/pentest/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to start pentest');
        }
        
        currentWorkflowId = data.workflowId;
        addTerminalLine(`Workflow started: ${currentWorkflowId}`, 'success');
        addTerminalLine(`Target: ${url}`);
        if (repo) {
            addTerminalLine(`Repository: ${repo}`);
        } else {
            addTerminalLine(`Repository: None (black-box mode)`);
        }
        addTerminalLine('');
        
        connectWebSocket(currentWorkflowId);
        setUIState('running');
        startElapsedTimer();
        
    } catch (error) {
        addTerminalLine(`Error: ${error.message}`, 'error');
        setUIState('idle');
    }
}

async function stopPentest() {
    const workflowIdToStop = currentWorkflowId;

    if (ws) {
        ws.close();
        ws = null;
    }
    
    if (elapsedInterval) {
        clearInterval(elapsedInterval);
        elapsedInterval = null;
    }

    if (workflowIdToStop) {
        addTerminalLine(`Stopping workflow: ${workflowIdToStop}`, 'phase');
        try {
            const response = await fetch(`${API_BASE}/api/pentest/emergency-stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workflowId: workflowIdToStop,
                    reason: 'Stopped by user from Shannon UI'
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Failed to terminate workflow');
            }
            addTerminalLine(`Workflow terminated: ${workflowIdToStop}`, 'success');
        } catch (error) {
            addTerminalLine(`Stop warning: ${error.message}`, 'error');
        }
    }
    
    currentWorkflowId = null;
    setUIState('idle');
    addTerminalLine('Pentest stopped by user', 'error');
}

function connectWebSocket(workflowId) {
    if (ws) {
        ws.close();
    }
    
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('[WS] Connected');
        ws.send(JSON.stringify({
            type: 'subscribe',
            workflowId
        }));
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (error) {
            console.error('[WS] Message parse error:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        addTerminalLine('WebSocket connection error', 'error');
    };
    
    ws.onclose = () => {
        console.log('[WS] Disconnected');
    };
}

function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'subscribed':
            console.log('[WS] Subscribed to workflow:', message.workflowId);
            break;
            
        case 'progress':
            updateProgress(message.data);
            break;
            
        case 'log':
            addTerminalLine(message.line);
            break;
            
        case 'phase_change':
            addTerminalLine(`→ Entering phase: ${message.phase}`, 'phase');
            if (message.agent) {
                addTerminalLine(`  Running agent: ${message.agent}`, 'phase');
            }
            break;
            
        case 'complete':
            addTerminalLine('', '');
            addTerminalLine('═'.repeat(60), 'success');
            addTerminalLine('PENTEST COMPLETE', 'success');
            addTerminalLine('═'.repeat(60), 'success');
            setUIState('complete');
            if (elapsedInterval) {
                clearInterval(elapsedInterval);
            }
            break;
            
        case 'failed':
            addTerminalLine('', '');
            addTerminalLine('═'.repeat(60), 'error');
            addTerminalLine('PENTEST FAILED', 'error');
            if (message.error) {
                addTerminalLine(`Error: ${message.error}`, 'error');
            }
            addTerminalLine('═'.repeat(60), 'error');
            setUIState('failed');
            if (elapsedInterval) {
                clearInterval(elapsedInterval);
            }
            break;
            
        case 'error':
            {
                const nextMessage = `Error: ${message.message}`;
                const now = Date.now();
                const messageChanged = nextMessage !== lastUiErrorMessage;
                const cooldownElapsed = now - lastUiErrorTimestampMs > 30000;
                if (messageChanged || cooldownElapsed) {
                    addTerminalLine(nextMessage, 'error');
                    lastUiErrorMessage = nextMessage;
                    lastUiErrorTimestampMs = now;
                }
            }
            break;
    }
}

function updateProgress(progress) {
    // Update pipeline nodes
    const allAgents = [
        'pre-recon', 'recon',
        'injection-vuln', 'xss-vuln', 'auth-vuln', 'ssrf-vuln', 'authz-vuln',
        'injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit',
        'report'
    ];
    
    allAgents.forEach(agent => {
        const node = document.querySelector(`[data-agent="${agent}"]`);
        if (!node) return;
        
        // Clear all state classes
        node.classList.remove('pending', 'running', 'exploiting', 'complete', 'failed');
        
        if (progress.completedAgents.includes(agent)) {
            node.classList.add('complete');
        } else if (progress.currentAgent === agent) {
            // Exploit agents get the red exploiting state
            if (agent.endsWith('-exploit')) {
                node.classList.add('exploiting');
            } else {
                node.classList.add('running');
            }
        } else if (progress.failedAgent === agent) {
            node.classList.add('failed');
        } else {
            node.classList.add('pending');
        }
    });
    
    // Update metrics
    agentProgress.textContent = `${progress.completedAgents.length}/13`;
    
    // Calculate total cost
    let cost = 0;
    let turns = 0;
    Object.values(progress.agentMetrics).forEach(metrics => {
        if (metrics.costUsd) cost += metrics.costUsd;
        if (metrics.numTurns) turns += metrics.numTurns;
    });
    totalCost.textContent = `$${cost.toFixed(2)}`;
    totalTurns.textContent = turns.toString();
}

function setUIState(state) {
    // Update status badge
    statusBadge.className = 'status-badge';
    
    switch (state) {
        case 'idle':
            statusBadge.classList.add('idle');
            statusText.textContent = 'IDLE';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            break;
            
        case 'starting':
            statusBadge.classList.add('working');
            statusText.textContent = 'STARTING';
            startBtn.disabled = true;
            stopBtn.disabled = false;
            break;
            
        case 'running':
            statusBadge.classList.add('working');
            statusText.textContent = 'WORKING';
            startBtn.disabled = true;
            stopBtn.disabled = false;
            break;
            
        case 'complete':
            statusBadge.classList.add('complete');
            statusText.textContent = 'COMPLETE';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            break;
            
        case 'failed':
            statusBadge.classList.add('failed');
            statusText.textContent = 'FAILED';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            break;
    }
}

function addTerminalLine(text, type = '') {
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    
    // Add timestamp
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'terminal-timestamp';
    timestampSpan.textContent = `[${timestamp}]`;
    
    line.appendChild(timestampSpan);
    line.appendChild(document.createTextNode(` ${text}`));
    
    terminal.appendChild(line);
    
    // Auto-scroll if not locked
    if (!isScrollLocked) {
        terminal.scrollTop = terminal.scrollHeight;
    }
    
    // Limit scrollback buffer
    while (terminal.children.length > 5000) {
        terminal.removeChild(terminal.firstChild);
    }
}

function toggleScrollLock() {
    isScrollLocked = !isScrollLocked;
    const icon = scrollLockBtn.querySelector('.icon');
    icon.textContent = isScrollLocked ? '▶' : '⏸';
    scrollLockBtn.title = isScrollLocked ? 'Resume Auto-Scroll' : 'Pause Auto-Scroll';
}

function clearTerminal() {
    terminal.innerHTML = '<div class="terminal-prompt">$ Shannon v1.0 - Ready</div>';
    
    // Reset metrics
    elapsedTime.textContent = '--';
    agentProgress.textContent = '0/13';
    totalCost.textContent = '$0.00';
    totalTurns.textContent = '0';
    
    // Reset pipeline nodes
    document.querySelectorAll('.pipeline-node').forEach(node => {
        node.className = 'pipeline-node pending';
    });
}

function startElapsedTimer() {
    startTime = Date.now();
    
    if (elapsedInterval) {
        clearInterval(elapsedInterval);
    }
    
    elapsedInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        elapsedTime.textContent = formatDuration(elapsed);
    }, 1000);
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
    if (elapsedInterval) {
        clearInterval(elapsedInterval);
    }
});
