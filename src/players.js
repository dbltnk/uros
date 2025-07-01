// players.js
import { EntangledGame, PLAYERS } from './gameplay.js';

// Define base player class
class EntangledPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        this.gameEngine = gameEngine;
        this.playerColor = playerColor;
        this.randomize = config.randomize;
        this.randomThreshold = config.randomThreshold;
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

        // If it's a superposition stone, evaluate potential outcomes
        if (simGame.superpositionStones.has(move)) {
            return this.evaluateSuperpositionMove(move, simGame);
        }

        simGame.makeMove(move);

        const score = simGame.getScore(this.playerColor);
        const board1Score = simGame.findLargestCluster(simGame.board1, this.playerColor);
        const board2Score = simGame.findLargestCluster(simGame.board2, this.playerColor);

        return {
            move,
            totalScore: score,
            board1Score,
            board2Score,
            difference: Math.abs(board1Score - board2Score),
            isSuperposition: false
        };
    }

    evaluateSuperpositionMove(move, simGame) {
        // Get possible positions for this superposition stone
        const positions = simGame.getValidPositionsForStone(move);
        if (!positions || positions.length === 0) {
            return {
                move,
                totalScore: -Infinity,
                board1Score: 0,
                board2Score: 0,
                difference: 0,
                isSuperposition: true
            };
        }

        // Evaluate each possible position
        const outcomes = positions.map(pos => {
            const gameCopy = this.simulateGame(simGame.getGameState());
            gameCopy.makeMove(move, pos);

            const board1Score = gameCopy.findLargestCluster(gameCopy.board1, this.playerColor);
            const board2Score = gameCopy.findLargestCluster(gameCopy.board2, this.playerColor);
            const score = board1Score + board2Score;

            return {
                position: pos,
                score,
                board1Score,
                board2Score
            };
        });

        // Calculate average and worst-case scores
        const avgScore = outcomes.reduce((sum, o) => sum + o.score, 0) / outcomes.length;
        const worstScore = Math.min(...outcomes.map(o => o.score));
        const avgBoard1 = outcomes.reduce((sum, o) => sum + o.board1Score, 0) / outcomes.length;
        const avgBoard2 = outcomes.reduce((sum, o) => sum + o.board2Score, 0) / outcomes.length;

        return {
            move,
            totalScore: avgScore * 0.7 + worstScore * 0.3, // Balance between average and worst case
            board1Score: avgBoard1,
            board2Score: avgBoard2,
            difference: Math.abs(avgBoard1 - avgBoard2),
            isSuperposition: true,
            outcomes
        };
    }

    evaluatePosition(game) {
        const myScore = game.getScore(this.playerColor);
        const opponentColor = this.playerColor === 'BLACK' ? 'WHITE' : 'BLACK';
        const opponentScore = game.getScore(opponentColor);
        const centerBonus = this.evaluateCenterControl(game);
        // Only add superposition bonus if there are SP stones in the game
        const spState = game.getSuperpositionState();
        const superpositionBonus = spState && spState.stones.length > 0 ?
            this.evaluateSuperpositionState(game) : 0;
        return myScore - opponentScore + centerBonus + superpositionBonus;
    }

    evaluateSuperpositionState(game) {
        let bonus = 0;
        const spState = game.getSuperpositionState();

        // Bonus for having superposition stones available
        for (const stone of spState.stones) {
            const positions = game.getValidPositionsForStone(stone.symbol);
            if (positions && positions.length > 0) {
                bonus += positions.length * 0.2; // Small bonus for each valid position
            }
        }

        return bonus;
    }

    evaluateCenterControl(game) {
        let bonus = 0;
        const center = Math.floor(game.boardSize / 2);
        const centerArea = [
            { row: center, col: center },
            { row: center - 1, col: center },
            { row: center + 1, col: center },
            { row: center, col: center - 1 },
            { row: center, col: center + 1 }
        ];

        for (const pos of centerArea) {
            if (pos.row >= 0 && pos.row < game.boardSize && pos.col >= 0 && pos.col < game.boardSize) {
                if (game.board1[pos.row][pos.col] === this.playerColor) bonus += 0.5;
                if (game.board2[pos.row][pos.col] === this.playerColor) bonus += 0.5;
            }
        }

        return bonus;
    }

    evaluateConnectivity(game, board) {
        // Use game engine's cluster finding methods
        const clusters = game.findLargestClusterCells(board, this.playerColor);
        let value = 0;

        for (const cluster of clusters) {
            let emptyNeighbors = 0;
            let connectedStones = 0;

            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const newRow = cluster.row + dr;
                    const newCol = cluster.col + dc;

                    if (newRow >= 0 && newRow < game.boardSize && newCol >= 0 && newCol < game.boardSize) {
                        if (board[newRow][newCol] === null) {
                            emptyNeighbors++;
                        } else if (board[newRow][newCol] === this.playerColor) {
                            connectedStones++;
                        }
                    }
                }
            }

            value += connectedStones * 0.5 + emptyNeighbors * 0.3;
        }

        return value;
    }

    evaluateGrowthPotential(game) {
        return this.evaluateConnectivity(game, game.board1) +
            this.evaluateConnectivity(game, game.board2);
    }

    simulateGame(state) {
        if (!state || !state.board1 || !state.board2) return null;
        return new SimulatedGame(this.gameEngine, state);
    }

    // Add shouldSwap method to base class
    shouldSwap() {
        if (!this.gameEngine.isSwapAvailable()) {
            return false;
        }

        // Default implementation evaluates the first move position
        const firstMove = this.gameEngine.firstMove;
        if (!firstMove) return false;

        // Simulate taking over the move
        const simGame = this.simulateGame(this.gameEngine.getGameState());
        simGame.swapFirstMove();
        const scoreAfterSwap = this.evaluatePosition(simGame);

        // Simulate our best move as second player
        const originalGame = this.simulateGame(this.gameEngine.getGameState());
        const validMoves = originalGame.getValidMoves();
        let bestMoveScore = -Infinity;

        for (const move of validMoves) {
            const moveGame = this.simulateGame(originalGame.getGameState());
            moveGame.makeMove(move);
            const score = this.evaluatePosition(moveGame);
            bestMoveScore = Math.max(bestMoveScore, score);
        }

        // Compare the two scenarios
        return scoreAfterSwap > bestMoveScore;
    }
}

class SimulatedGame extends EntangledGame {
    constructor(originalGame, state) {
        super(
            originalGame.board1Layout,
            originalGame.board2Layout,
            '',
            '',
            originalGame.enableSwapRule,
            originalGame.board1Type,
            originalGame.board2Type
        );

        // Copy board state from passed state
        for (let i = 0; i < state.board1.length; i++) {
            for (let j = 0; j < state.board1[i].length; j++) {
                this.board1[i][j] = state.board1[i][j];
                this.board2[i][j] = state.board2[i][j];
            }
        }

        // Copy game state from passed state
        this.currentPlayer = state.currentPlayer;
        this.playerTurns = { ...state.playerTurns };
        this.gameOver = state.gameOver;
        this._lastMove = state.lastMove;
        this.lastPlacedStone = state.lastPlacedStone;

        // Copy swap rule state
        this.enableSwapRule = originalGame.enableSwapRule;
        this.firstMove = state.firstMove;
        this.swapAvailable = state.swapAvailable;
        this.swapOccurred = state.swapOccurred;

        // Copy required maps and methods from original game
        this.symbolToPosition = new Map(originalGame.symbolToPosition);
        this.superpositionStones = new Map(originalGame.superpositionStones || new Map());

        // Copy over any additional methods that might be needed
        this.getValidPositionsForStone = originalGame.getValidPositionsForStone.bind(this);
        this.getSuperpositionState = originalGame.getSuperpositionState.bind(this);
        this.findSymbolAtPosition = originalGame.findSymbolAtPosition.bind(this);
        this.checkAllNeighborsFilled = originalGame.checkAllNeighborsFilled.bind(this);
        this.collapseSuperpositionStone = originalGame.collapseSuperpositionStone.bind(this);
    }
}

class DeterministicPlayer extends EntangledPlayer {
    shouldSwap() {
        // Always take predictable action based on board position
        return this.gameEngine.firstMove &&
            this.gameEngine.firstMove.charCodeAt(0) % 2 === 0;
    }

    chooseMove() {
        const validMoves = this.gameEngine.getValidMoves();
        if (!validMoves || validMoves.length === 0) {
            console.error('DeterministicPlayer: No valid moves available');
            return null;
        }
        // Always pick the first valid move
        return validMoves[0];
    }
}

class RandomPlayer extends EntangledPlayer {
    shouldSwap() {
        // Random 50/50 decision
        return this.gameEngine.isSwapAvailable() && Math.random() < 0.5;
    }

    chooseMove() {
        const validMoves = this.gameEngine.getValidMoves();
        const randomIndex = Math.floor(Math.random() * validMoves.length);
        return validMoves[randomIndex];
    }
}

class MinimaxPlayer extends EntangledPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        super(gameEngine, playerColor, config);
        if (!config.thinkingTime) {
            throw new Error('MinimaxPlayer requires thinkingTime in config');
        }
        this.thinkingTime = config.thinkingTime;
        this.bestMove = null;
        this.startTime = null;
        // Maximum theoretical score (all stones connected)
        this.maxPossibleScore = Math.floor(this.gameEngine.calculatePlayablePositions() / 2);
    }

    shouldSwap() {
        if (!this.gameEngine.isSwapAvailable()) return false;

        this.startTime = performance.now();
        let depth = 1;
        let bestScore = -Infinity;
        let bestMoveScore = -Infinity;

        try {
            // Evaluate swap position with iterative deepening
            const swapGame = this.simulateGame(this.gameEngine.getGameState());
            swapGame.swapFirstMove();

            // Evaluate best regular move with iterative deepening
            const validMoves = this.gameEngine.getValidMoves();

            while (performance.now() - this.startTime < this.thinkingTime / 2) {
                try {
                    // Evaluate swap
                    const swapEval = this.minimax(swapGame, depth, true, -Infinity, Infinity);
                    if (swapEval > bestScore) {
                        bestScore = swapEval;
                    }

                    // Evaluate regular moves
                    for (const move of validMoves) {
                        const moveGame = this.simulateGame(this.gameEngine.getGameState());
                        moveGame.makeMove(move);
                        const score = this.minimax(moveGame, depth, false, -Infinity, Infinity);
                        bestMoveScore = Math.max(bestMoveScore, score);
                    }

                    depth++;
                } catch (error) {
                    if (error.message === 'Timeout') {
                        break;
                    }
                    throw error;
                }
            }

            return bestScore > bestMoveScore;
        } catch (error) {
            console.warn('Error in shouldSwap, defaulting to false:', error);
            return false;
        }
    }

    chooseMove() {
        this.startTime = performance.now();
        this.bestMove = null;
        let depth = 1;
        const validMoves = this.gameEngine.getValidMoves();

        // For superposition stones, use simpler evaluation
        if (validMoves.some(move => this.gameEngine.superpositionStones &&
            this.gameEngine.superpositionStones.has(move))) {
            const moveEvaluations = validMoves.map(move => {
                const spEval = this.evaluateMove(move);
                const gameProgress = Object.values(this.gameEngine.playerTurns).reduce((a, b) => a + b);
                const superpositionBonus = gameProgress < 15 ? 2 : 0;
                return {
                    move,
                    score: spEval.totalScore + superpositionBonus
                };
            });

            moveEvaluations.sort((a, b) => b.score - a.score);
            return this.randomizeChoice(
                moveEvaluations.map(m => m.move),
                moveEvaluations.map(m => m.score)
            );
        }

        // Iterative deepening with time limit
        let bestScore = -Infinity;
        let moveEvaluations = validMoves.map(move => ({ move, score: -Infinity }));
        let previousBestMove = null;
        let stableDepths = 0; // Count how many depths the best move remains stable

        while (performance.now() - this.startTime < this.thinkingTime) {
            let completedDepth = true;

            for (let i = 0; i < validMoves.length; i++) {
                const move = validMoves[i];
                const simGame = this.simulateGame(this.gameEngine.getGameState());
                simGame.makeMove(move);

                try {
                    const score = this.minimax(simGame, depth, false, -Infinity, Infinity);
                    moveEvaluations[i].score = score;

                    // Early return conditions
                    if (score > bestScore) {
                        bestScore = score;
                        this.bestMove = move;

                        // If we found a move that achieves maximum possible score
                        if (score >= this.maxPossibleScore) {
                            return move;
                        }

                        // If this move is significantly better than others (2x better)
                        const secondBestScore = Math.max(...moveEvaluations
                            .filter(m => m.move !== move)
                            .map(m => m.score));
                        if (score > secondBestScore * 2 && depth >= 3) {
                            return move;
                        }
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

            // Check if best move is stable
            if (this.bestMove === previousBestMove) {
                stableDepths++;
                // If best move remains the same for 3 depths and we're at least at depth 4
                if (stableDepths >= 3 && depth >= 4) {
                    return this.bestMove;
                }
            } else {
                stableDepths = 0;
                previousBestMove = this.bestMove;
            }

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
                const opponentColor = this.playerColor === 'BLACK' ? 'WHITE' : 'BLACK';
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

class MCTSPlayer extends EntangledPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        super(gameEngine, playerColor, config);
        if (!config.thinkingTime) {
            throw new Error('MCTSPlayer requires thinkingTime in config');
        }
        this.thinkingTime = config.thinkingTime;
        // Create reusable components for simulations
        this.baseSimGame = null;
        this.simBoards = {
            board1: Array(gameEngine.boardSize).fill(null).map(() => Array(gameEngine.boardSize).fill(null)),
            board2: Array(gameEngine.boardSize).fill(null).map(() => Array(gameEngine.boardSize).fill(null))
        };
        // Early return thresholds
        this.minSimulationsPerMove = 30;     // Minimum simulations per move before checking convergence
        this.convergenceWindow = 20;         // Number of recent simulations to check for convergence
        this.convergenceThreshold = 0.01;    // Maximum allowed change in win rates
    }

    shouldSwap() {
        if (!this.gameEngine.isSwapAvailable()) return false;

        const startTime = performance.now();
        let swapWins = 0;
        let regularWins = 0;
        let totalSimulations = 0;

        // Initialize base simulation game
        this.initBaseSimGame(this.gameEngine.getGameState());

        while (performance.now() - startTime < this.thinkingTime / 2) {
            // Simulate swap scenario
            const swapGame = this.getSimulationGame();
            swapGame.swapFirstMove();
            const swapScore = this.playRandomGame(swapGame);
            swapWins += swapScore > 0 ? 1 : 0;

            // Simulate regular move
            const regularGame = this.getSimulationGame();
            const validMoves = regularGame.getValidMoves();
            if (validMoves.length > 0) {
                const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                regularGame.makeMove(randomMove);
                const regularScore = this.playRandomGame(regularGame);
                regularWins += regularScore > 0 ? 1 : 0;
            }

            totalSimulations++;
        }

        return swapWins > regularWins;
    }

    // Fast board state copy without object creation
    copyBoardState(source, target) {
        for (let i = 0; i < source.length; i++) {
            for (let j = 0; j < source[i].length; j++) {
                target[i][j] = source[i][j];
            }
        }
    }

    // Initialize base simulation game once
    initBaseSimGame(gameState) {
        if (!this.baseSimGame) {
            this.baseSimGame = new SimulatedGame(this.gameEngine, gameState);
        } else {
            // Update existing base game state
            this.copyBoardState(gameState.board1, this.baseSimGame.board1);
            this.copyBoardState(gameState.board2, this.baseSimGame.board2);
            this.baseSimGame.currentPlayer = gameState.currentPlayer;
            this.baseSimGame.playerTurns = { ...gameState.playerTurns };
            this.baseSimGame.gameOver = gameState.gameOver;
            this.baseSimGame._lastMove = gameState.lastMove;
            this.baseSimGame.lastPlacedStone = gameState.lastPlacedStone;
            this.baseSimGame.superpositionStones = new Map(this.gameEngine.superpositionStones);
        }
    }

    // Fast game state copy for simulation
    getSimulationGame() {
        // Copy board states to reusable boards
        this.copyBoardState(this.baseSimGame.board1, this.simBoards.board1);
        this.copyBoardState(this.baseSimGame.board2, this.simBoards.board2);

        // Create a proper game state for simulation
        return new SimulatedGame(this.gameEngine, {
            board1: this.simBoards.board1,
            board2: this.simBoards.board2,
            currentPlayer: this.baseSimGame.currentPlayer,
            playerTurns: { ...this.baseSimGame.playerTurns },
            gameOver: this.baseSimGame.gameOver,
            lastMove: this.baseSimGame.lastMove,
            lastPlacedStone: this.baseSimGame.lastPlacedStone,
            firstMove: this.baseSimGame.firstMove,
            swapAvailable: this.baseSimGame.swapAvailable,
            swapOccurred: this.baseSimGame.swapOccurred
        });
    }

    chooseMove() {
        const startTime = performance.now();
        const validMoves = this.gameEngine.getValidMoves();
        const hasSuperposition = validMoves.some(move =>
            this.gameEngine.superpositionStones && this.gameEngine.superpositionStones.has(move));

        // Initialize base simulation game
        this.initBaseSimGame(this.gameEngine.getGameState());

        // Track simulations and scores for each move
        const moveSimulations = validMoves.map(() => 0);
        const moveScores = validMoves.map(() => 0);

        // Track recent win rates for convergence check
        const recentWinRates = validMoves.map(() => []);

        // Keep simulating until time limit is reached
        while (performance.now() - startTime < this.thinkingTime) {
            // Find move with least simulations
            const minSims = Math.min(...moveSimulations);
            const moveIndices = moveSimulations
                .map((sims, i) => sims === minSims ? i : -1)
                .filter(i => i !== -1);
            const moveIndex = moveIndices[Math.floor(Math.random() * moveIndices.length)];
            const move = validMoves[moveIndex];

            try {
                let score = 0;
                if (this.gameEngine.superpositionStones && this.gameEngine.superpositionStones.has(move)) {
                    const positions = this.gameEngine.getValidPositionsForStone(move);
                    if (positions && positions.length > 0) {
                        const randomPos = positions[Math.floor(Math.random() * positions.length)];
                        this.baseSimGame.makeMove(move, randomPos);
                        score = this.playRandomGame(this.getSimulationGame());
                    } else {
                        score = -1000;
                    }
                } else {
                    this.baseSimGame.makeMove(move);
                    score = this.playRandomGame(this.getSimulationGame());
                }

                moveScores[moveIndex] += score;
                moveSimulations[moveIndex]++;

                // Track win rate for convergence check
                const currentWinRate = moveScores[moveIndex] / moveSimulations[moveIndex];
                recentWinRates[moveIndex].push(currentWinRate);
                if (recentWinRates[moveIndex].length > this.convergenceWindow) {
                    recentWinRates[moveIndex].shift();
                }

                // Reset base game state
                this.initBaseSimGame(this.gameEngine.getGameState());

                // Early return conditions
                // Only check if not dealing with superposition stones and have enough data
                if (!hasSuperposition && Math.min(...moveSimulations) >= this.minSimulationsPerMove) {
                    // Check if win rates have converged
                    let hasConverged = true;
                    for (let i = 0; i < validMoves.length; i++) {
                        if (recentWinRates[i].length < this.convergenceWindow) {
                            hasConverged = false;
                            break;
                        }
                        // Check if win rate has stabilized
                        const recentRates = recentWinRates[i];
                        const oldAvg = recentRates.slice(0, this.convergenceWindow / 2).reduce((a, b) => a + b) / (this.convergenceWindow / 2);
                        const newAvg = recentRates.slice(-this.convergenceWindow / 2).reduce((a, b) => a + b) / (this.convergenceWindow / 2);
                        if (Math.abs(newAvg - oldAvg) > this.convergenceThreshold) {
                            hasConverged = false;
                            break;
                        }
                    }

                    // If converged, return the best move
                    if (hasConverged) {
                        const moveEvaluations = validMoves.map((move, i) => ({
                            move,
                            score: moveScores[i] / moveSimulations[i]
                        }));
                        moveEvaluations.sort((a, b) => b.score - a.score);
                        return this.randomizeChoice(
                            moveEvaluations.map(m => m.move),
                            moveEvaluations.map(m => m.score)
                        );
                    }
                }

            } catch (error) {
                moveScores[moveIndex] -= 1000;
                moveSimulations[moveIndex]++;
            }
        }

        const moveEvaluations = validMoves.map((move, i) => ({
            move,
            score: moveSimulations[i] > 0 ? moveScores[i] / moveSimulations[i] : -Infinity,
            simulations: moveSimulations[i]
        }));

        moveEvaluations.sort((a, b) => b.score - a.score);

        return this.randomizeChoice(
            moveEvaluations.map(m => m.move),
            moveEvaluations.map(m => m.score)
        );
    }

    playRandomGame(simGame) {
        let validMoves = simGame.getValidMoves();
        const maxMoves = simGame.boardSize * simGame.boardSize;
        let moveCount = 0;

        while (!simGame.isGameOver() && moveCount < maxMoves && validMoves.length > 0) {
            const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];

            try {
                simGame.makeMove(randomMove);
                moveCount++;
                validMoves = simGame.getValidMoves();
            } catch (error) {
                break;
            }
        }

        const blackScore =
            simGame.findLargestCluster(simGame.board1, 'BLACK') +
            simGame.findLargestCluster(simGame.board2, 'BLACK');

        const whiteScore =
            simGame.findLargestCluster(simGame.board1, 'WHITE') +
            simGame.findLargestCluster(simGame.board2, 'WHITE');

        return this.playerColor === 'BLACK' ? blackScore - whiteScore : whiteScore - blackScore;
    }

    destroy() {
        this.baseSimGame = null;
        this.simBoards = null;
    }
}

export const AI_PLAYERS = {
    'deterministic': {
        id: 'deterministic',
        name: 'Deterministic',
        description: 'Always makes the first valid move it finds.',
        class: DeterministicPlayer,
        config: {}
    },
    'random': {
        id: 'random',
        name: 'Random',
        description: 'Makes random valid moves.',
        class: RandomPlayer,
        config: {}
    },
    'minimax': {
        id: 'minimax',
        name: 'Minimax (deterministic)',
        description: 'Uses minimax algorithm with alpha-beta pruning.',
        class: MinimaxPlayer,
        config: {
            randomize: false,
            thinkingTime: 1000
        }
    },
    'minimax-some-rng': {
        id: 'minimax-some-rng',
        name: 'Medium',
        description: 'Uses minimax algorithm with alpha-beta pruning and some randomization.',
        class: MinimaxPlayer,
        config: {
            randomize: true,
            randomThreshold: 0.1,
            thinkingTime: 1000
        }
    },
    'mcts': {
        id: 'mcts',
        name: 'Hard',
        description: 'Uses Monte Carlo Tree Search.',
        class: MCTSPlayer,
        config: {
            randomize: true,
            thinkingTime: 1000
        }
    }
};

export function createPlayer(strategyId, gameEngine, playerColor, config = {}) {
    const playerConfig = AI_PLAYERS[strategyId];
    if (!playerConfig) {
        throw new Error(`Unknown player strategy: ${strategyId}`);
    }

    // Ensure thinkingTime is provided either in config or player defaults
    const finalConfig = { ...playerConfig.config, ...config };
    if (playerConfig.class.prototype instanceof MinimaxPlayer ||
        playerConfig.class.prototype instanceof MCTSPlayer) {
        if (!finalConfig.thinkingTime) {
            throw new Error(`${playerConfig.name} requires thinkingTime in config`);
        }
    }

    return new playerConfig.class(gameEngine, playerColor, finalConfig);
}