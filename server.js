const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = 3000;
const LOGS_DIR = path.join(__dirname, 'logs');

// Track active connections
const connections = new Set();

// Session tracking
let sessionId = null;
let sessionStartTime = null;

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// File paths
const LOGS_FILE = path.join(LOGS_DIR, 'logs.txt');
const DOM_FILE = path.join(LOGS_DIR, 'dom-snapshot.json');

// Clear files on startup
function clearFiles() {
    try {
        fs.writeFileSync(LOGS_FILE, '');
        fs.writeFileSync(DOM_FILE, '');

        // Generate new session ID
        sessionId = `session-${Date.now()}`;
        sessionStartTime = new Date().toISOString();

        // Write session start marker
        const sessionStart = `=== SESSION START: ${sessionId} ===\n`;
        fs.writeFileSync(LOGS_FILE, sessionStart);

        console.log('✅ Cleared previous session logs');
    } catch (err) {
        console.error('❌ Failed to clear log files:', err.message);
    }
}

// Format timestamp for LLM efficiency (HH:MM:SS)
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toTimeString().split(' ')[0]; // Just HH:MM:SS
}

// Format call stack for LLM efficiency
function formatCallStack(callStack) {
    if (!callStack || callStack.length === 0) return '';

    return callStack.map(frame => {
        const fileName = frame.file.split('/').pop() || frame.file;
        return `@${frame.line}:${fileName}`;
    }).join(' → ');
}

// Write logs to file
function writeLogs(logs) {
    try {
        let logEntries = '';

        // Write logs in chronological order
        logs.forEach(log => {
            const timestamp = formatTimestamp(log.timestamp);
            let entry = `[${timestamp}] ${log.type}: ${log.message}`;

            // Add call stack information if available
            if (log.callStack && log.callStack.length > 0) {
                const stackInfo = formatCallStack(log.callStack);
                if (stackInfo) {
                    entry += `\n  ${stackInfo}`;
                }
            }

            logEntries += entry + '\n';
        });

        fs.appendFileSync(LOGS_FILE, logEntries);
    } catch (err) {
        console.error('❌ Failed to write logs:', err.message);
    }
}

// Write DOM snapshot to file
function writeDomSnapshot(snapshot) {
    try {
        // Calculate DOM statistics
        const elementCount = snapshot.elements.length;
        const elementsWithId = snapshot.elements.filter(el => el.id).length;
        const elementsWithClasses = snapshot.elements.filter(el => el.classes.length > 0).length;
        const elementsWithConflicts = snapshot.elements.filter(el => el.cssConflicts && el.cssConflicts.length > 0).length;

        // Add session metadata and statistics to snapshot
        const enhancedSnapshot = {
            session: sessionId,
            sessionStart: sessionStartTime,
            timestamp: snapshot.timestamp,
            url: snapshot.url,
            summary: {
                totalElements: elementCount,
                elementsWithId: elementsWithId,
                elementsWithClasses: elementsWithClasses,
                elementsWithCssConflicts: elementsWithConflicts
            },
            elements: snapshot.elements
        };

        fs.writeFileSync(DOM_FILE, JSON.stringify(enhancedSnapshot, null, 2));
    } catch (err) {
        console.error('❌ Failed to write DOM snapshot:', err.message);
    }
}

// Parse JSON from request body
function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(err);
            }
        });
    });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    // Track this connection
    connections.add(res);
    res.on('close', () => connections.delete(res));

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        if (req.method === 'POST') {
            if (req.url === '/log') {
                const data = await parseJsonBody(req);
                writeLogs(data.logs);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, logsProcessed: data.logs.length }));

            } else if (req.url === '/dom-snapshot') {
                const snapshot = await parseJsonBody(req);
                writeDomSnapshot(snapshot);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, elementsCaptured: snapshot.elements.length }));

            } else if (req.url === '/clear') {
                clearFiles();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Logs cleared' }));

            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Endpoint not found' }));
            }
        } else {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    } catch (err) {
        console.error('❌ Server error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Browser logging server running on http://localhost:${PORT}`);
    console.log(`📁 Log files will be written to: ${LOGS_DIR}`);
    console.log(`📝 Console logs: ${LOGS_FILE}`);
    console.log(`🌐 DOM snapshots: ${DOM_FILE}`);
    console.log('');
    console.log('💡 Open index.html in your browser to start logging');
    console.log('🔄 Press Ctrl+C to stop the server');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');

    // Write session end marker
    try {
        const sessionEnd = `\n=== SESSION END: ${sessionId} ===\n`;
        fs.appendFileSync(LOGS_FILE, sessionEnd);
    } catch (err) {
        console.error('Failed to write session end marker:', err.message);
    }

    // Close all active connections
    connections.forEach(connection => {
        connection.destroy();
    });

    // Close server and force exit after timeout
    server.close(() => {
        console.log('✅ Server stopped gracefully');
        process.exit(0);
    });

    // Force exit after 3 seconds if graceful shutdown fails
    setTimeout(() => {
        console.log('⚠️ Force shutting down server...');
        process.exit(1);
    }, 3000);
});

// Also handle SIGTERM for container environments
process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down server...');

    // Write session end marker
    try {
        const sessionEnd = `\n=== SESSION END: ${sessionId} ===\n`;
        fs.appendFileSync(LOGS_FILE, sessionEnd);
    } catch (err) {
        console.error('Failed to write session end marker:', err.message);
    }

    // Close all active connections
    connections.forEach(connection => {
        connection.destroy();
    });

    server.close(() => {
        console.log('✅ Server stopped gracefully');
        process.exit(0);
    });

    setTimeout(() => {
        console.log('⚠️ Force shutting down server...');
        process.exit(1);
    }, 3000);
});