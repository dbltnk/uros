// Browser Logging System for LLM Debugging
// Captures console output and DOM state with minimal performance impact

class BrowserLogger {
    constructor() {
        this.logBuffer = [];
        this.lastDomSnapshot = null;
        this.logCount = 0;
        this.domUpdateCount = 0;
        this.serverUrl = 'http://localhost:3000';

        this.init();
    }

    init() {
        // Clear previous session logs on page load
        this.clearSession();

        // Process early logs that happened before initialization
        this.processEarlyLogs();

        // Override console methods (replace the early capture)
        this.overrideConsole();

        // Set up error handling to capture uncaught errors
        this.setupErrorHandling();

        // Set up periodic logging
        this.startPeriodicLogging();

        // Set up event listeners
        this.setupEventListeners();

        // Initial log
        console.log('Browser logging system initialized');
    }

    processEarlyLogs() {
        // Use the global earlyLogs captured from the very beginning
        const earlyLogs = window.earlyLogs || [];
        earlyLogs.forEach(log => {
            // Convert early log format to our buffer format
            const message = log.args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');

            this.logBuffer.push({
                timestamp: log.timestamp,
                type: log.type,
                message,
                callStack: log.callStack || []
            });
        });
        console.log(`Processed ${earlyLogs.length} early logs`);
    }

    clearSession() {
        // Send clear command to server
        fetch(`${this.serverUrl}/clear`, { method: 'POST' })
            .catch(err => console.warn('Could not clear previous session:', err));
    }

    setupErrorHandling() {
        // Capture uncaught errors
        window.addEventListener('error', (event) => {
            this.addToBuffer('ERROR', [`Uncaught error: ${event.message} at ${event.filename}:${event.lineno}`]);
        });

        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.addToBuffer('ERROR', [`Unhandled promise rejection: ${event.reason}`]);
        });
    }

    overrideConsole() {
        // Get the original console methods from the early capture
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        const originalInfo = console.info;

        // Replace the early capture with our full logging system
        console.log = (...args) => {
            originalLog.apply(console, args);
            this.addToBuffer('LOG', args);
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.addToBuffer('WARN', args);
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            this.addToBuffer('ERROR', args);
        };

        console.info = (...args) => {
            originalInfo.apply(console, args);
            this.addToBuffer('INFO', args);
        };
    }

    addToBuffer(type, args) {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        // Get call stack information
        const stack = new Error().stack;
        const stackLines = stack ? stack.split('\n').slice(2) : []; // Skip Error constructor and this function

        // Parse stack to get file and line info
        const callInfo = stackLines.map(line => {
            const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
            if (match) {
                return {
                    function: match[1],
                    file: match[2],
                    line: parseInt(match[3]),
                    column: parseInt(match[4])
                };
            }
            // Handle anonymous functions
            const anonMatch = line.match(/at\s+(.+?):(\d+):(\d+)/);
            if (anonMatch) {
                return {
                    function: '(anonymous)',
                    file: anonMatch[1],
                    line: parseInt(anonMatch[2]),
                    column: parseInt(anonMatch[3])
                };
            }
            return null;
        }).filter(Boolean);

        this.logBuffer.push({
            timestamp: new Date().toISOString(),
            type,
            message,
            callStack: callInfo
        });

        this.logCount++;
        this.updateDebugPanel();
    }

    startPeriodicLogging() {
        setInterval(() => {
            this.sendLogs();
            this.sendDomSnapshot();
        }, 2000); // Every 2 seconds
    }

    async sendLogs() {
        if (this.logBuffer.length === 0) return;

        const logs = [...this.logBuffer];
        this.logBuffer = [];

        try {
            await fetch(`${this.serverUrl}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs })
            });
        } catch (err) {
            console.warn('Failed to send logs to server:', err);
        }
    }

    async sendDomSnapshot() {
        try {
            const snapshot = this.createDomSnapshot();
            const snapshotStr = JSON.stringify(snapshot);

            // Only send if DOM has changed
            if (this.lastDomSnapshot === snapshotStr) return;

            this.lastDomSnapshot = snapshotStr;
            this.domUpdateCount++;
            this.updateDebugPanel();

            await fetch(`${this.serverUrl}/dom-snapshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snapshot)
            });
        } catch (err) {
            console.warn('Failed to send DOM snapshot:', err);
        }
    }

    createDomSnapshot() {
        const snapshot = {
            session: `session-${Date.now()}`,
            sessionStart: new Date().toISOString(),
            timestamp: new Date().toLocaleTimeString(),
            url: window.location.href,
            summary: {
                totalElements: document.querySelectorAll('*').length,
                elementsWithId: document.querySelectorAll('[id]').length,
                elementsWithClasses: document.querySelectorAll('[class]').length,
                elementsWithCssConflicts: 0
            },
            elements: []
        };

        // Sample key elements for game state
        const keyElements = [
            '#lake-board',
            '#reedbed',
            '#game-status',
            '#village-scores'
        ];

        keyElements.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                const computedStyle = window.getComputedStyle(element);
                snapshot.elements.push({
                    tag: element.tagName.toLowerCase(),
                    id: element.id,
                    classes: Array.from(element.classList),
                    computedStyles: this.getRelevantStyles(computedStyle),
                    position: this.getElementPosition(element),
                    dimensions: {
                        width: element.offsetWidth,
                        height: element.offsetHeight
                    },
                    cssConflicts: this.detectCssConflicts(element, computedStyle),
                    textContent: element.textContent?.substring(0, 100) || ''
                });
            }
        });

        return snapshot;
    }

    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
    }

    getRelevantStyles(computedStyle) {
        return {
            'background-color': computedStyle.backgroundColor,
            'color': computedStyle.color,
            'display': computedStyle.display,
            'position': computedStyle.position,
            'width': computedStyle.width,
            'height': computedStyle.height,
            'border': computedStyle.border,
            'border-radius': computedStyle.borderRadius,
            'opacity': computedStyle.opacity,
            'visibility': computedStyle.visibility
        };
    }

    detectCssConflicts(element, computedStyle) {
        const conflicts = [];

        if (computedStyle.display === 'none' && computedStyle.visibility === 'visible') {
            conflicts.push('Element hidden by display:none but visibility:visible');
        }

        if (computedStyle.opacity === '0' && computedStyle.visibility === 'visible') {
            conflicts.push('Element invisible by opacity:0 but visibility:visible');
        }

        return conflicts;
    }

    updateDebugPanel() {
        // Debug panel removed - no longer needed
    }

    setupEventListeners() {
        // Add any additional event listeners for debugging
        window.addEventListener('beforeunload', () => {
            this.sendLogs();
            this.sendDomSnapshot();
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BrowserLogger;
} 