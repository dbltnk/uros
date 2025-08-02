// Main initialization file for Uros game
// Imports and initializes both game and logging systems

// Initialize both systems when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize logging system
    window.browserLogger = new BrowserLogger();

    // Test bot system loading
    import('./uros-bots.js').then(module => {
        console.log('Bot system loaded successfully in main.js:', module);
        window.urosBots = module;
    }).catch(error => {
        console.error('Failed to load bot system in main.js:', error);
    });

    // Initialize game
    window.urosGame = new UrosGame();
    // (No need to call startNewGame here)

    console.log('Uros game and logging system initialized');
}); 