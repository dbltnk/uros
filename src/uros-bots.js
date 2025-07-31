// uros-bots.js
// Uros-specific bot implementations adapted from the general bot system

// Define base player class for Uros
class UrosPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        this.gameEngine = gameEngine;
        this.playerColor = playerColor; // 'red' or 'blue'
        this.randomize = config.randomize || false;
        this.randomThreshold = config.randomThreshold || 0.1;
        this.useRandomSeed = config.useRandomSeed || false;
        this.randomSeed = config.randomSeed || null;
    }

    /**
     * Get a random number (either seeded or system)
     */
    getRandom() {
        if (this.useRandomSeed && this.randomSeed !== null) {
            // Use the game engine's seeded random
            return this.gameEngine.getRandom();
        }
        return Math.random();
    }

    randomizeChoice(moves, scores) {
        if (!moves || moves.length === 0) {
            return null;
        }

        // Ensure we have valid scores array matching moves
        if (!scores || scores.length !== moves.length) {
            return moves[0];
        }

        if (!this.randomize) {
            // When not randomizing, find and return the move with the highest score
            let bestScore = scores[0];
            let bestMoveIndex = 0;

            for (let i = 1; i < scores.length; i++) {
                if (scores[i] > bestScore) {
                    bestScore = scores[i];
                    bestMoveIndex = i;
                }
            }

            return moves[bestMoveIndex];
        }

        // Find best score
        const bestScore = Math.max(...scores);

        // Filter valid moves within threshold
        const viableMoves = moves.filter((move, i) => {
            // Protect against NaN or invalid scores
            if (typeof scores[i] !== 'number' || isNaN(scores[i])) {
                return false;
            }
            return bestScore - scores[i] <= this.randomThreshold * Math.abs(bestScore);
        });

        // If no viable moves found, return first valid move
        if (viableMoves.length === 0) {
            return moves[0];
        }

        // Select random viable move
        const randomIndex = Math.floor(this.getRandom() * viableMoves.length);
        return viableMoves[randomIndex];
    }

    chooseMove() {
        const validMoves = this.gameEngine.getValidMoves();
        if (!validMoves || validMoves.length === 0) {
            return null;
        }
        throw new Error('Strategy not implemented');
    }
}

// Deterministic player - always makes the first valid move
class UrosDeterministicPlayer extends UrosPlayer {
    chooseMove() {
        const validMoves = this.gameEngine.getValidMoves();
        if (!validMoves || validMoves.length === 0) {
            console.error('UrosDeterministicPlayer: No valid moves available');
            return null;
        }
        // Always pick the first valid move
        console.assert(typeof this.thinkingTime === 'number' && this.thinkingTime >= 0, 'thinkingTime must be a non-negative number');
        return validMoves[0];
    }
}

// Random player - makes random valid moves
class UrosRandomPlayer extends UrosPlayer {
    chooseMove() {
        const validMoves = this.gameEngine.getValidMoves();
        if (!validMoves || validMoves.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(this.getRandom() * validMoves.length);
        console.assert(typeof this.thinkingTime === 'number' && this.thinkingTime >= 0, 'thinkingTime must be a non-negative number');
        return validMoves[randomIndex];
    }
}

// Export bot configurations
export const UROS_AI_PLAYERS = {
    'deterministic': {
        id: 'deterministic',
        name: 'Deterministic',
        description: 'Always makes the first valid move it finds.',
        class: UrosDeterministicPlayer,
        config: {
            thinkingTime: 10
        }
    },
    'random': {
        id: 'random',
        name: 'Random',
        description: 'Makes random valid moves.',
        class: UrosRandomPlayer,
        config: {
            thinkingTime: 10
        }
    }
};

export function createUrosPlayer(strategyId, gameEngine, playerColor, config = {}) {
    const playerConfig = UROS_AI_PLAYERS[strategyId];
    if (!playerConfig) {
        throw new Error(`Unknown player strategy: ${strategyId}`);
    }

    // Merge configs: player defaults -> UI config -> explicit config
    const finalConfig = {
        ...playerConfig.config,
        ...config,
        // Always use the thinking time from the UI slider
        thinkingTime: config.thinkingTime || playerConfig.config.thinkingTime || 10
    };

    return new playerConfig.class(gameEngine, playerColor, finalConfig);
} 