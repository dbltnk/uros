// Main initialization file for Uros game
// Imports and initializes both game and logging systems

// Initialize both systems when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize logging system
    window.browserLogger = new BrowserLogger();

    // Initialize game
    window.urosGame = new UrosGame();
}); 