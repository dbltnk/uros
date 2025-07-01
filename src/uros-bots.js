// uros-bots.js
// Uros-specific bot implementations adapted from the general bot system

// Define base player class for Uros
class UrosPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        this.gameEngine = gameEngine;
        this.playerColor = playerColor; // 'red' or 'blue'
        this.randomize = config.randomize || false;
        this.randomThreshold = config.randomThreshold || 0.1;
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
        const randomIndex = Math.floor(Math.random() * viableMoves.length);
        return viableMoves[randomIndex];
    }

    chooseMove() {
        const validMoves = this.gameEngine.getValidMoves();
        if (!validMoves || validMoves.length === 0) {
            return null;
        }
        throw new Error('Strategy not implemented');
    }

    evaluateMove(move) {
        const simGame = this.simulateGame(this.gameEngine.getGameState());
        simGame.currentPlayer = this.playerColor;

        // Execute the move
        simGame.makeMove(move);

        // Evaluate the resulting position
        const score = this.evaluatePosition(simGame);
        const villages = simGame.calculateVillages();
        const myVillages = villages[this.playerColor];
        const largestVillage = this.getLargestVillage(myVillages);

        return {
            move,
            totalScore: score,
            largestVillageSize: largestVillage.size,
            largestVillageIslands: largestVillage.islands,
            isSuperposition: false
        };
    }

    evaluatePosition(game) {
        const villages = game.calculateVillages();
        const myVillages = villages[this.playerColor];
        const opponentColor = this.playerColor === 'red' ? 'blue' : 'red';
        const opponentVillages = villages[opponentColor];

        const myLargest = this.getLargestVillage(myVillages);
        const opponentLargest = this.getLargestVillage(opponentVillages);

        // Base score from largest village
        let score = myLargest.size * 10 + myLargest.islands * 5;

        // Bonus for having multiple villages
        score += myVillages.length * 2;

        // Penalty for opponent's largest village
        score -= opponentLargest.size * 8 + opponentLargest.islands * 4;

        // Bonus for houses remaining (more options)
        const housesRemaining = game.gameState.players[this.playerColor].houses;
        score += housesRemaining * 0.5;

        // Bonus for controlling more islands
        const myIslands = new Set();
        const opponentIslands = new Set();

        for (const village of myVillages) {
            for (const house of village) {
                myIslands.add(house.tile.id);
            }
        }

        for (const village of opponentVillages) {
            for (const house of village) {
                opponentIslands.add(house.tile.id);
            }
        }

        score += myIslands.size * 3;
        score -= opponentIslands.size * 2;

        return score;
    }

    getLargestVillage(villages) {
        let largest = { size: 0, islands: 0 };

        for (const village of villages) {
            const size = village.length;
            const islands = new Set(village.map(h => h.tile.id)).size;

            if (size > largest.size || (size === largest.size && islands > largest.islands)) {
                largest = { size, islands };
            }
        }

        return largest;
    }

    simulateGame(state) {
        if (!state) return null;
        return new SimulatedUrosGame(this.gameEngine, state);
    }
}

// Simulated game for bot evaluation
class SimulatedUrosGame {
    constructor(originalGame, state) {
        this.gameEngine = originalGame;
        this.boardSize = originalGame.boardSize;
        this.housesPerPlayer = originalGame.housesPerPlayer;
        this.tiles = [...originalGame.tiles];
        this.islandStyles = originalGame.islandStyles;

        // Copy game state
        this.gameState = {
            board: state.board.map(row => row.map(cell => cell)),
            placedTiles: state.placedTiles.map(tile => ({
                ...tile,
                houses: tile.houses.map(row => [...row])
            })),
            reedbed: state.reedbed.map(tile => ({
                ...tile,
                houses: tile.houses.map(row => [...row])
            })),
            players: {
                red: { ...state.players.red },
                blue: { ...state.players.blue }
            },
            currentPlayer: state.currentPlayer,
            isFirstTurn: state.isFirstTurn,
            placementsThisTurn: state.placementsThisTurn,
            placementsRequired: state.placementsRequired,
            gameOver: state.gameOver,
            gameOverWinner: state.gameOverWinner,
            gameOverRedLargest: state.gameOverRedLargest,
            gameOverBlueLargest: state.gameOverBlueLargest
        };

        // Copy interaction state
        this.interactionState = {
            mode: null,
            selectedTile: null,
            selectedPlayer: null,
            preview: null,
            hoveredTileId: null
        };
    }

    // Delegate methods to original game engine
    canPlaceTile(tile, row, col, anchorTileRow = 0, anchorTileCol = 0) {
        return this.gameEngine.canPlaceTile(tile, row, col, anchorTileRow, anchorTileCol);
    }

    placeTile(tile, row, col, anchorTileRow = 0, anchorTileCol = 0) {
        if (!tile) {
            console.error('placeTile: tile must not be null');
            return false;
        }
        if (typeof row !== 'number' || typeof col !== 'number') {
            console.error('placeTile: row and col must be numbers');
            return false;
        }
        if (!this.canPlaceTile(tile, row, col, anchorTileRow, anchorTileCol)) {
            console.warn('Cannot place tile at', row, col, 'with anchor', anchorTileRow, anchorTileCol);
            return false;
        }
        const grid = tile.shape_grid;
        const rows = grid.length;
        const cols = grid[0].length;
        // Place the tile, preserving any houses that were already on it
        const placedTile = {
            ...tile,
            row,
            col,
            anchor: { tileRow: anchorTileRow, tileCol: anchorTileCol },
            houses: tile.houses ? [...tile.houses.map(row => [...row])] : Array(rows).fill(null).map(() => Array(cols).fill(null))
        };
        this.gameState.placedTiles.push(placedTile);
        // Mark board squares as occupied
        for (let tr = 0; tr < rows; tr++) {
            for (let tc = 0; tc < cols; tc++) {
                if (grid[tr][tc] === 1) {
                    const boardR = row + (tr - anchorTileRow);
                    const boardC = col + (tc - anchorTileCol);
                    this.gameState.board[boardR][boardC] = placedTile;
                }
            }
        }
        // Remove from reedbed
        const reedbedIndex = this.gameState.reedbed.findIndex(t => t.id === tile.id);
        if (reedbedIndex !== -1) {
            this.gameState.reedbed.splice(reedbedIndex, 1);
        }
        console.log(`Placed tile ${tile.name} at (${row}, ${col}) with anchor (${anchorTileRow},${anchorTileCol})`);
        return true;
    }

    placeHouse(tile, tileRow, tileCol, player) {
        // Check if this is an island cell (green) and the square is empty
        if (!tile || this.gameState.players[player].houses <= 0 ||
            tile.shape_grid[tileRow][tileCol] !== 1 || tile.houses[tileRow][tileCol] !== null) {
            console.warn('Cannot place house');
            return false;
        }

        tile.houses[tileRow][tileCol] = player;
        this.gameState.players[player].houses--;

        console.log(`${player} placed house at tile (${tileRow}, ${tileCol})`);
        return true;
    }

    calculateVillages() {
        return this.gameEngine.calculateVillages.call(this);
    }

    floodFill(startTile, startRow, startCol, player, visited, isPlacedTile) {
        return this.gameEngine.floodFill.call(this, startTile, startRow, startCol, player, visited, isPlacedTile);
    }

    getLargestVillage(villages) {
        return this.gameEngine.getLargestVillage.call(this, villages);
    }

    checkGameOver() {
        return this.gameEngine.checkGameOver.call(this);
    }

    nextTurn() {
        return this.gameEngine.nextTurn.call(this);
    }

    isGameOver() {
        return this.gameState.gameOver;
    }

    makeMove(move) {
        // Handle different move types
        if (move.type === 'tile-placement') {
            return this.placeTile(move.tile, move.row, move.col, move.anchorTileRow, move.anchorTileCol);
        } else if (move.type === 'house-placement') {
            return this.placeHouse(move.tile, move.tileRow, move.tileCol, move.player);
        }
        return false;
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
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        return validMoves[randomIndex];
    }
}

// Minimax player with alpha-beta pruning
class UrosMinimaxPlayer extends UrosPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        super(gameEngine, playerColor, config);
        if (!config.thinkingTime) {
            throw new Error('UrosMinimaxPlayer requires thinkingTime in config');
        }
        this.thinkingTime = config.thinkingTime;
        this.bestMove = null;
        this.startTime = null;
    }

    chooseMove() {
        this.startTime = performance.now();
        this.bestMove = null;
        let depth = 1;
        const validMoves = this.gameEngine.getValidMoves();

        // Iterative deepening with time limit
        let bestScore = -Infinity;
        let moveEvaluations = validMoves.map(move => ({ move, score: -Infinity }));

        while (performance.now() - this.startTime < this.thinkingTime) {
            let completedDepth = true;

            for (let i = 0; i < validMoves.length; i++) {
                const move = validMoves[i];
                const simGame = this.simulateGame(this.gameEngine.getGameState());
                simGame.makeMove(move);

                try {
                    const score = this.minimax(simGame, depth, false, -Infinity, Infinity);
                    moveEvaluations[i].score = score;

                    if (score > bestScore) {
                        bestScore = score;
                        this.bestMove = move;
                    }
                } catch (timeoutError) {
                    completedDepth = false;
                    break;
                }

                // Check time after each move evaluation
                if (performance.now() - this.startTime >= this.thinkingTime) {
                    completedDepth = false;
                    break;
                }
            }

            if (!completedDepth) break;
            depth++;
        }

        // Use the best move found so far
        moveEvaluations.sort((a, b) => b.score - a.score);
        return this.randomizeChoice(
            moveEvaluations.map(m => m.move),
            moveEvaluations.map(m => m.score)
        );
    }

    minimax(game, depth, isMaximizing, alpha, beta) {
        // Check time limit first
        if (performance.now() - this.startTime >= this.thinkingTime) {
            throw new Error('Timeout');
        }

        if (depth === 0 || game.isGameOver()) {
            return this.evaluatePosition(game);
        }

        const validMoves = game.getValidMoves();
        if (!validMoves || validMoves.length === 0) {
            return this.evaluatePosition(game);
        }

        if (isMaximizing) {
            let maxScore = -Infinity;
            for (const move of validMoves) {
                const simGame = this.simulateGame(game.getGameState());
                simGame.currentPlayer = this.playerColor;
                simGame.makeMove(move);
                const score = this.minimax(simGame, depth - 1, false, alpha, beta);
                maxScore = Math.max(maxScore, score);
                alpha = Math.max(alpha, score);
                if (beta <= alpha) break;
            }
            return maxScore;
        } else {
            let minScore = Infinity;
            for (const move of validMoves) {
                const simGame = this.simulateGame(game.getGameState());
                const opponentColor = this.playerColor === 'red' ? 'blue' : 'red';
                simGame.currentPlayer = opponentColor;
                simGame.makeMove(move);
                const score = this.minimax(simGame, depth - 1, true, alpha, beta);
                minScore = Math.min(minScore, score);
                beta = Math.min(beta, score);
                if (beta <= alpha) break;
            }
            return minScore;
        }
    }
}

// Export bot configurations
export const UROS_AI_PLAYERS = {
    'deterministic': {
        id: 'deterministic',
        name: 'Deterministic',
        description: 'Always makes the first valid move it finds.',
        class: UrosDeterministicPlayer,
        config: {}
    },
    'random': {
        id: 'random',
        name: 'Random',
        description: 'Makes random valid moves.',
        class: UrosRandomPlayer,
        config: {}
    },
    'minimax': {
        id: 'minimax',
        name: 'Minimax',
        description: 'Uses minimax algorithm with alpha-beta pruning.',
        class: UrosMinimaxPlayer,
        config: {
            randomize: false,
            thinkingTime: 1000
        }
    },
    'minimax-some-rng': {
        id: 'minimax-some-rng',
        name: 'Medium',
        description: 'Uses minimax algorithm with some randomization.',
        class: UrosMinimaxPlayer,
        config: {
            randomize: true,
            randomThreshold: 0.1,
            thinkingTime: 1000
        }
    }
};

export function createUrosPlayer(strategyId, gameEngine, playerColor, config = {}) {
    const playerConfig = UROS_AI_PLAYERS[strategyId];
    if (!playerConfig) {
        throw new Error(`Unknown player strategy: ${strategyId}`);
    }

    // Ensure thinkingTime is provided either in config or player defaults
    const finalConfig = { ...playerConfig.config, ...config };
    if (playerConfig.class.prototype instanceof UrosMinimaxPlayer) {
        if (!finalConfig.thinkingTime) {
            throw new Error(`${playerConfig.name} requires thinkingTime in config`);
        }
    }

    return new playerConfig.class(gameEngine, playerColor, finalConfig);
} 