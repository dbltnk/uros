// uros-bots.js
// Uros-specific bot implementations adapted from the general bot system

// Define base player class for Uros
class UrosPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        this.gameEngine = gameEngine;
        this.playerColor = playerColor; // 'red' or 'blue'

        // Validate required config values instead of using fallbacks
        if (typeof config.randomize !== 'boolean') {
            throw new Error(`UrosPlayer: config.randomize must be a boolean, got ${typeof config.randomize}`);
        }
        if (typeof config.randomThreshold !== 'number' || config.randomThreshold < 0 || config.randomThreshold > 1) {
            throw new Error(`UrosPlayer: config.randomThreshold must be a number between 0 and 1, got ${config.randomThreshold}`);
        }
        if (typeof config.useRandomSeed !== 'boolean') {
            throw new Error(`UrosPlayer: config.useRandomSeed must be a boolean, got ${typeof config.useRandomSeed}`);
        }
        if (config.useRandomSeed && (typeof config.randomSeed !== 'number' || config.randomSeed === null)) {
            throw new Error(`UrosPlayer: config.randomSeed must be a number when useRandomSeed is true, got ${config.randomSeed}`);
        }
        if (typeof config.thinkingTime !== 'number' || config.thinkingTime <= 0) {
            throw new Error(`UrosPlayer: config.thinkingTime must be a positive number, got ${config.thinkingTime}`);
        }

        this.randomize = config.randomize;
        this.randomThreshold = config.randomThreshold;
        this.useRandomSeed = config.useRandomSeed;
        this.randomSeed = config.randomSeed;
        this.thinkingTime = config.thinkingTime;
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

        // Base score from largest village (primary scoring mechanism)
        let score = myLargest.size * 15 + myLargest.islands * 8;

        // Bonus for having multiple villages (diversification)
        score += myVillages.length * 3;

        // Penalty for opponent's largest village (defensive consideration)
        score -= opponentLargest.size * 12 + opponentLargest.islands * 6;

        // Bonus for houses remaining (more options for future moves)
        const housesRemaining = game.gameState.players[this.playerColor].houses;
        score += housesRemaining * 1.0;

        // Bonus for controlling more islands (strategic positioning)
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

        score += myIslands.size * 4;
        score -= opponentIslands.size * 3;

        // Bonus for connectivity potential (empty adjacent cells)
        const connectivityBonus = this.evaluateConnectivityPotential(game);
        score += connectivityBonus;

        // Bonus for blocking opponent's expansion
        const blockingBonus = this.evaluateBlockingPotential(game);
        score += blockingBonus;

        // End-game considerations
        const totalHousesPlaced = (game.gameState.players.red.houses + game.gameState.players.blue.houses);
        const gameProgress = (30 - totalHousesPlaced) / 30; // 0 = end game, 1 = early game

        if (gameProgress < 0.3) {
            // End game: focus more on village size
            score = score * 1.2;
        } else if (gameProgress > 0.7) {
            // Early game: focus more on expansion and blocking
            score = score * 0.9;
        }

        return score;
    }

    evaluateConnectivityPotential(game) {
        let bonus = 0;
        const myColor = this.playerColor;

        // Check for empty adjacent cells to existing villages
        for (const tile of game.gameState.placedTiles) {
            for (let r = 0; r < tile.houses.length; r++) {
                for (let c = 0; c < tile.houses[r].length; c++) {
                    if (tile.houses[r][c] === myColor) {
                        // Check adjacent cells for expansion opportunities
                        const adjacentPositions = [
                            { row: r - 1, col: c },
                            { row: r + 1, col: c },
                            { row: r, col: c - 1 },
                            { row: r, col: c + 1 }
                        ];

                        for (const pos of adjacentPositions) {
                            if (pos.row >= 0 && pos.row < tile.houses.length &&
                                pos.col >= 0 && pos.col < tile.houses[r].length &&
                                tile.shape_grid[pos.row][pos.col] === 1 &&
                                tile.houses[pos.row][pos.col] === null) {
                                bonus += 2; // Bonus for each empty adjacent cell
                            }
                        }
                    }
                }
            }
        }

        return bonus;
    }

    evaluateBlockingPotential(game) {
        let bonus = 0;
        const opponentColor = this.playerColor === 'red' ? 'blue' : 'red';

        // Check if we can block opponent's village expansion
        for (const tile of game.gameState.placedTiles) {
            for (let r = 0; r < tile.houses.length; r++) {
                for (let c = 0; c < tile.houses[r].length; c++) {
                    if (tile.houses[r][c] === opponentColor) {
                        // Check if we can place a house adjacent to opponent's house
                        const adjacentPositions = [
                            { row: r - 1, col: c },
                            { row: r + 1, col: c },
                            { row: r, col: c - 1 },
                            { row: r, col: c + 1 }
                        ];

                        for (const pos of adjacentPositions) {
                            if (pos.row >= 0 && pos.row < tile.houses.length &&
                                pos.col >= 0 && pos.col < tile.houses[r].length &&
                                tile.shape_grid[pos.row][pos.col] === 1 &&
                                tile.houses[pos.row][pos.col] === null) {
                                bonus += 3; // Higher bonus for blocking moves
                            }
                        }
                    }
                }
            }
        }

        return bonus;
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

    rotateTile(tile, direction = 1) {
        return this.gameEngine.rotateTile(tile, direction);
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


        return true;
    }

    calculateVillages() {
        const visited = new Set();
        const villages = { red: [], blue: [] };

        // Check if game state exists
        if (!this.gameState || !this.gameState.placedTiles) {
            return villages;
        }

        // Only consider villages for houses on placed tiles (lake board), per rules
        for (const tile of this.gameState.placedTiles) {
            for (let r = 0; r < tile.houses.length; r++) {
                for (let c = 0; c < tile.houses[r].length; c++) {
                    const player = tile.houses[r][c];
                    // Only consider houses on island cells (green cells)
                    if (player && tile.shape_grid[r][c] === 1 && !visited.has(`placed-${tile.id}-${r}-${c}`)) {
                        const village = this.floodFill(tile, r, c, player, visited, true);
                        if (village.length > 0) {
                            villages[player].push(village);
                        }
                    }
                }
            }
        }

        return villages;
    }

    floodFill(startTile, startRow, startCol, player, visited, isPlacedTile) {
        const village = [];
        const stack = [{ tile: startTile, row: startRow, col: startCol }];

        while (stack.length > 0) {
            const { tile, row, col } = stack.pop();
            const key = `${isPlacedTile ? 'placed' : 'reedbed'}-${tile.id}-${row}-${col}`;

            if (visited.has(key)) continue;
            visited.add(key);

            // Check if this position is valid and has the right player's house
            if (row >= 0 && row < tile.houses.length &&
                col >= 0 && col < tile.houses[row].length &&
                tile.houses[row][col] === player &&
                tile.shape_grid[row][col] === 1) {

                // Add this house to the village
                village.push({
                    tile: tile,
                    tileRow: row,
                    tileCol: col,
                    player: player
                });

                // Check adjacent positions within the same tile
                const adjacent = [
                    { row: row - 1, col: col },
                    { row: row + 1, col: col },
                    { row: row, col: col - 1 },
                    { row: row, col: col + 1 }
                ];

                for (const pos of adjacent) {
                    if (pos.row >= 0 && pos.row < tile.houses.length &&
                        pos.col >= 0 && pos.col < tile.houses[pos.row].length) {
                        stack.push({ tile: tile, row: pos.row, col: pos.col });
                    }
                }

                // Check cross-tile adjacency for placed tiles (lake board)
                if (isPlacedTile) {
                    // Compute the board coordinates of this house
                    const boardRow = tile.row + (row - (tile.anchor ? tile.anchor.tileRow : 0));
                    const boardCol = tile.col + (col - (tile.anchor ? tile.anchor.tileCol : 0));

                    // Check orthogonal neighbors on adjacent tiles
                    const crossTilePositions = [
                        { row: boardRow - 1, col: boardCol },
                        { row: boardRow + 1, col: boardCol },
                        { row: boardRow, col: boardCol - 1 },
                        { row: boardRow, col: boardCol + 1 }
                    ];

                    for (const pos of crossTilePositions) {
                        if (pos.row >= 0 && pos.row < this.boardSize &&
                            pos.col >= 0 && pos.col < this.boardSize) {
                            const adjacentTile = this.gameState.board[pos.row][pos.col];
                            if (adjacentTile && adjacentTile !== tile) {
                                // For the adjacent tile, recompute tile-local coordinates
                                if (!adjacentTile.anchor) {
                                    continue; // Skip if anchor data is missing
                                }
                                const anchor = adjacentTile.anchor;
                                const adjacentTileRow = anchor.tileRow + (pos.row - adjacentTile.row);
                                const adjacentTileCol = anchor.tileCol + (pos.col - adjacentTile.col);

                                if (adjacentTileRow >= 0 && adjacentTileRow < adjacentTile.houses.length &&
                                    adjacentTileCol >= 0 && adjacentTileCol < adjacentTile.houses[0].length &&
                                    adjacentTile.shape_grid[adjacentTileRow][adjacentTileCol] === 1 &&
                                    adjacentTile.houses[adjacentTileRow][adjacentTileCol] === player) {

                                    const adjKey = `placed-${adjacentTile.id}-${adjacentTileRow}-${adjacentTileCol}`;
                                    if (!visited.has(adjKey)) {
                                        stack.push({ tile: adjacentTile, row: adjacentTileRow, col: adjacentTileCol });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        return village;
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

    checkGameOver() {
        // Check if all houses are placed
        const totalHousesPlaced = (15 - this.gameState.players.red.houses) + (15 - this.gameState.players.blue.houses);

        if (totalHousesPlaced >= 30) {
            this.gameState.gameOver = true;

            // Calculate final village sizes
            const villages = this.calculateVillages();
            const redLargest = this.getLargestVillage(villages.red);
            const blueLargest = this.getLargestVillage(villages.blue);

            // Determine winner
            if (redLargest.size > blueLargest.size) {
                this.gameState.gameOverWinner = 'red';
            } else if (blueLargest.size > redLargest.size) {
                this.gameState.gameOverWinner = 'blue';
            } else if (redLargest.islands > blueLargest.islands) {
                this.gameState.gameOverWinner = 'red';
            } else if (blueLargest.islands > redLargest.islands) {
                this.gameState.gameOverWinner = 'blue';
            } else {
                this.gameState.gameOverWinner = 'tie';
            }

            this.gameState.gameOverRedLargest = redLargest;
            this.gameState.gameOverBlueLargest = blueLargest;
        }

        return this.gameState.gameOver;
    }

    nextTurn() {
        // Switch current player
        this.gameState.currentPlayer = this.gameState.currentPlayer === 'red' ? 'blue' : 'red';

        // Reset placement counters
        this.gameState.placementsThisTurn = 0;
        this.gameState.placementsRequired = 1;

        // Check if it's the first turn
        if (this.gameState.isFirstTurn) {
            this.gameState.isFirstTurn = false;
        }

        return this.gameState.currentPlayer;
    }

    isGameOver() {
        return this.gameState.gameOver;
    }

    getValidMoves() {
        const moves = [];
        const currentPlayer = this.gameState.currentPlayer;

        // Check if game is over
        if (this.gameState.gameOver) {
            return moves;
        }

        // Get valid tile placements (including all rotations)
        if (this.gameState.reedbed) {
            for (const tile of this.gameState.reedbed) {
                // Try all 4 rotations of the tile
                for (let rotation = 0; rotation < 4; rotation++) {
                    const rotatedTile = this.rotateTile(tile, rotation);
                    for (let row = 0; row < this.boardSize; row++) {
                        for (let col = 0; col < this.boardSize; col++) {
                            // Try different anchor positions
                            const grid = rotatedTile.shape_grid;
                            const rows = grid.length;
                            const cols = grid[0].length;
                            for (let anchorRow = 0; anchorRow < rows; anchorRow++) {
                                for (let anchorCol = 0; anchorCol < cols; anchorCol++) {
                                    if (grid[anchorRow][anchorCol] === 1 && this.canPlaceTile(rotatedTile, row, col, anchorRow, anchorCol)) {
                                        moves.push({
                                            type: 'tile-placement',
                                            tile: { ...rotatedTile },
                                            row: row,
                                            col: col,
                                            anchorTileRow: anchorRow,
                                            anchorTileCol: anchorCol
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Get valid house placements on placed tiles (lake board)
        if (this.gameState.players[currentPlayer].houses > 0) {
            // Check placed tiles on board
            for (const tile of this.gameState.placedTiles) {
                for (let r = 0; r < tile.houses.length; r++) {
                    for (let c = 0; c < tile.houses[r].length; c++) {
                        if (tile.shape_grid[r][c] === 1 && tile.houses[r][c] === null) {
                            moves.push({
                                type: 'house-placement',
                                tileId: tile.id,
                                tileRow: r,
                                tileCol: c,
                                player: currentPlayer,
                                isPlacedTile: true
                            });
                        }
                    }
                }
            }
            // Also check reedbed tiles for house placement
            if (this.gameState.reedbed) {
                for (const tile of this.gameState.reedbed) {
                    for (let r = 0; r < tile.houses.length; r++) {
                        for (let c = 0; c < tile.houses[r].length; c++) {
                            if (tile.shape_grid[r][c] === 1 && tile.houses[r][c] === null) {
                                moves.push({
                                    type: 'house-placement',
                                    tileId: tile.id,
                                    tileRow: r,
                                    tileCol: c,
                                    player: currentPlayer,
                                    isPlacedTile: false
                                });
                            }
                        }
                    }
                }
            }
        }
        return moves;
    }

    makeMove(move) {


        // Handle different move types
        if (move.type === 'tile-placement') {
            return this.placeTile(move.tile, move.row, move.col, move.anchorTileRow, move.anchorTileCol);
        } else if (move.type === 'house-placement') {
            // Resolve tile reference using tileId
            let tile = null;
            if (move.isPlacedTile) {
                tile = this.gameState.placedTiles.find(t => t.id === move.tileId);
            } else {
                tile = this.gameState.reedbed.find(t => t.id === move.tileId);
            }

            if (!tile) {
                console.error(`Cannot find tile with ID ${move.tileId} for house placement`);
                return false;
            }

            return this.placeHouse(tile, move.tileRow, move.tileCol, move.player);
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

        // Separate tile placements and house placements
        const tilePlacements = validMoves.filter(move => move.type === 'tile-placement');
        const housePlacements = validMoves.filter(move => move.type === 'house-placement');

        // If we have both types of moves, randomly choose between them
        if (tilePlacements.length > 0 && housePlacements.length > 0) {
            const chooseTile = this.getRandom() < 0.5; // 50% chance for each type
            const movesToChooseFrom = chooseTile ? tilePlacements : housePlacements;
            const randomIndex = Math.floor(this.getRandom() * movesToChooseFrom.length);
            console.assert(typeof this.thinkingTime === 'number' && this.thinkingTime >= 0, 'thinkingTime must be a non-negative number');
            return movesToChooseFrom[randomIndex];
        }

        // If we only have one type of move, choose randomly from all moves
        const randomIndex = Math.floor(this.getRandom() * validMoves.length);
        console.assert(typeof this.thinkingTime === 'number' && this.thinkingTime >= 0, 'thinkingTime must be a non-negative number');
        return validMoves[randomIndex];
    }
}

// Minimax player with alpha-beta pruning
class UrosMinimaxPlayer extends UrosPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        super(gameEngine, playerColor, config);

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

// MCTS Player for Uros
class UrosMCTSPlayer extends UrosPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        super(gameEngine, playerColor, config);

        this.minSimulationsPerMove = 20;     // Minimum simulations per move before checking convergence
        this.convergenceWindow = 15;         // Number of recent simulations to check for convergence
        this.convergenceThreshold = 0.02;    // Maximum allowed change in win rates
    }

    chooseMove() {
        const startTime = performance.now();
        const validMoves = this.gameEngine.getValidMoves();

        if (!validMoves || validMoves.length === 0) {
            return null;
        }

        // Track simulations and scores for each move
        const moveSimulations = validMoves.map(() => 0);
        const moveScores = validMoves.map(() => 0);
        const recentWinRates = validMoves.map(() => []);

        // Keep simulating until time limit is reached
        while (performance.now() - startTime < this.thinkingTime) {
            // Find move with least simulations (UCB1 exploration)
            const minSims = Math.min(...moveSimulations);
            const moveIndices = moveSimulations
                .map((sims, i) => sims === minSims ? i : -1)
                .filter(i => i !== -1);
            const moveIndex = moveIndices[Math.floor(this.getRandom() * moveIndices.length)];
            const move = validMoves[moveIndex];

            try {
                // Simulate the move
                const simGame = this.simulateGame(this.gameEngine.getGameState());
                simGame.makeMove(move);
                const score = this.playRandomGame(simGame);

                moveScores[moveIndex] += score;
                moveSimulations[moveIndex]++;

                // Track win rate for convergence check
                const currentWinRate = moveScores[moveIndex] / moveSimulations[moveIndex];
                recentWinRates[moveIndex].push(currentWinRate);
                if (recentWinRates[moveIndex].length > this.convergenceWindow) {
                    recentWinRates[moveIndex].shift();
                }

                // Early return conditions
                if (Math.min(...moveSimulations) >= this.minSimulationsPerMove) {
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
                console.warn('MCTS simulation error:', error);
                moveScores[moveIndex] -= 1000; // Penalty for failed simulation
                moveSimulations[moveIndex]++;
            }
        }

        // Return best move based on average score
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
        const maxMoves = 50; // Prevent infinite loops
        let moveCount = 0;

        while (!simGame.isGameOver() && moveCount < maxMoves && validMoves.length > 0) {
            const randomMove = validMoves[Math.floor(this.getRandom() * validMoves.length)];

            try {
                simGame.makeMove(randomMove);
                moveCount++;
                validMoves = simGame.getValidMoves();
            } catch (error) {
                break;
            }
        }

        // Evaluate final position
        const villages = simGame.calculateVillages();
        const myVillages = villages[this.playerColor];
        const opponentColor = this.playerColor === 'red' ? 'blue' : 'red';
        const opponentVillages = villages[opponentColor];

        const myLargest = this.getLargestVillage(myVillages);
        const opponentLargest = this.getLargestVillage(opponentVillages);

        // Simple win/loss evaluation
        if (myLargest.size > opponentLargest.size) {
            return 1; // Win
        } else if (myLargest.size < opponentLargest.size) {
            return -1; // Loss
        } else if (myLargest.islands > opponentLargest.islands) {
            return 0.5; // Tie-breaker win
        } else if (myLargest.islands < opponentLargest.islands) {
            return -0.5; // Tie-breaker loss
        } else {
            return 0; // Draw
        }
    }
}

// Heuristic-based player with 5 different strategies
class UrosHeuristicPlayer extends UrosPlayer {
    constructor(gameEngine, playerColor, config = {}) {
        super(gameEngine, playerColor, config);

        // Strategy configurations
        this.strategies = {
            'balanced': { A: 5, B: 3, C: 4, D: 0.2, E: 0.1 },
            'explore': { A: 5, B: 4, C: 3, D: 0.2, E: 0.1 },
            'expand': { A: 6, B: 3, C: 3.5, D: 0.2, E: 0.1 },
            'exterminate': { A: 4, B: 3.5, C: 5, D: 0.2, E: 0.1 },
            'exploit': { A: 5, B: 3, C: 4, D: 1, E: 0.5 }
        };

        if (!config.strategy) {
            throw new Error('UrosHeuristicPlayer: config.strategy is required');
        }
        this.strategy = config.strategy;
        this.weights = this.strategies[this.strategy];

        if (!this.weights) {
            throw new Error(`Unknown strategy: ${this.strategy}`);
        }

        // Enhanced debug data storage
        this.lastDebugData = null;
        this.moveHistory = []; // Store last 5 moves for historical context
        this.filteringStats = {
            totalMoves: 0,
            filteredMoves: 0,
            filteringReasons: {}
        };
    }

    chooseMove() {
        const validMoves = this.gameEngine.getValidMoves();
        if (!validMoves || validMoves.length === 0) {
            return null;
        }

        // Track filtering statistics
        this.filteringStats.totalMoves = validMoves.length;
        this.filteringStats.filteredMoves = 0;
        this.filteringStats.filteringReasons = {};

        // Filter out pointless house placements on Reedbed
        const filteredMoves = this.filterPointlessMoves(validMoves);

        if (filteredMoves.length === 0) {
            return null;
        }

        // Calculate current metrics for REAL GAME (this is our "before" state)
        const currentMetrics = this.calculateMetrics(this.gameEngine, true);

        // Evaluate each move with detailed logging
        const moveEvaluations = filteredMoves.map((move, index) => {
            const originalState = this.gameEngine.getGameState();
            const simGame = this.simulateGame(originalState);

            // Apply move to get the "after" state
            const moveResult = simGame.makeMove(move);
            const afterMetrics = this.calculateMetrics(simGame, false);

            // Calculate score using current (real) metrics as "before" and simulated metrics as "after"
            const scoreResult = this.calculateHeuristicScore(currentMetrics, afterMetrics, false);

            return {
                move,
                score: scoreResult.score,
                beforeMetrics: currentMetrics,
                afterMetrics,
                calculation: scoreResult.calculation,
                moveDescription: this.describeMove(move),
                fullCalculation: {
                    beforeMetrics: currentMetrics,
                    afterMetrics: afterMetrics,
                    deltas: {
                        deltaBVL: afterMetrics.myBVL - currentMetrics.myBVL,
                        deltaEFL: afterMetrics.myEFL - currentMetrics.myEFL,
                        deltaOpponentEFL: afterMetrics.opponentEFL - currentMetrics.opponentEFL,
                        deltaBVR: afterMetrics.myBVR - currentMetrics.myBVR,
                        deltaEFR: afterMetrics.myEFR - currentMetrics.myEFR
                    },
                    weightedScores: {
                        weightedBVL: this.weights.A * (afterMetrics.myBVL - currentMetrics.myBVL),
                        weightedEFL: this.weights.B * (afterMetrics.myEFL - currentMetrics.myEFL),
                        weightedOpponentEFL: -this.weights.C * (afterMetrics.opponentEFL - currentMetrics.opponentEFL),
                        weightedBVR: this.weights.D * (afterMetrics.myBVR - currentMetrics.myBVR),
                        weightedEFR: this.weights.E * (afterMetrics.myEFR - currentMetrics.myEFR)
                    },
                    weights: this.weights
                }
            };
        });

        // Sort by score (highest first)
        moveEvaluations.sort((a, b) => b.score - a.score);

        // Find all moves with the highest score
        if (moveEvaluations.length === 0) {
            throw new Error('UrosHeuristicPlayer: No move evaluations found. This should not happen. Check validMoves and filter logic.');
        }

        const bestScore = moveEvaluations[0].score;
        const bestMoves = moveEvaluations.filter(evaluation => evaluation.score === bestScore);

        // Choose randomly among best moves
        const randomIndex = Math.floor(this.getRandom() * bestMoves.length);
        const selectedMove = bestMoves[randomIndex].move;

        // Store debug data for UI display
        const selectedEvaluation = moveEvaluations.find(evaluation => evaluation.move === selectedMove);
        if (selectedEvaluation) {
            // Add to move history - include ALL evaluated moves, not just the selected one
            const historyEntry = {
                turn: this.gameEngine.gameState.currentPlayer === 'red' ? 'red' : 'blue',
                selectedMove: selectedMove,
                allEvaluations: moveEvaluations, // Store all evaluations for historical analysis
                strategy: this.strategy,
                weights: this.weights,
                beforeMetrics: selectedEvaluation.beforeMetrics,
                timestamp: Date.now()
            };

            this.moveHistory.push(historyEntry);
            if (this.moveHistory.length > 5) {
                this.moveHistory.shift(); // Keep only last 5 turns
            }

            this.lastDebugData = {
                strategy: this.strategy,
                weights: this.weights,
                move: selectedMove,
                beforeMetrics: selectedEvaluation.beforeMetrics,
                afterMetrics: selectedEvaluation.afterMetrics,
                score: selectedEvaluation.score,
                calculation: selectedEvaluation.calculation,
                moveDescription: selectedEvaluation.moveDescription,
                moveRankings: moveEvaluations.slice(0, 10), // Top 10 moves with full details
                filteringStats: this.filteringStats,
                moveHistory: this.moveHistory,
                selectedEvaluation: selectedEvaluation // Store the selected evaluation for detailed display
            };
        }

        return selectedMove;
    }

    describeMove(move) {
        if (move.type === 'tile-placement') {
            return `Place tile ${move.tile.id} at (${move.row}, ${move.col})`;
        } else {
            const location = move.isPlacedTile ? 'lake' : 'reedbed';
            return `Place house on ${location} tile ${move.tileId} at (${move.tileRow}, ${move.tileCol})`;
        }
    }

    filterPointlessMoves(moves) {
        return moves.filter(move => {
            // Keep all tile placements
            if (move.type === 'tile-placement') {
                return true;
            }

            // For house placements, check if the Reedbed tile can still fit on the lake
            if (move.type === 'house-placement' && !move.isPlacedTile) {
                const tile = this.gameEngine.gameState.reedbed.find(t => t.id === move.tileId);
                if (!tile) return true; // Keep if tile not found

                // Check if this tile can still be placed anywhere on the lake
                const canFit = this.canTileFitOnLake(tile);
                if (!canFit) {
                    this.filteringStats.filteredMoves++;
                    this.filteringStats.filteringReasons[`tile-${move.tileId}-no-fit`] =
                        (this.filteringStats.filteringReasons[`tile-${move.tileId}-no-fit`] || 0) + 1;
                }
                return canFit;
            }

            return true; // Keep all other moves
        });
    }

    canTileFitOnLake(tile) {
        // Try all rotations and positions
        for (let rotation = 0; rotation < 4; rotation++) {
            const rotatedTile = this.gameEngine.rotateTile(tile, rotation);
            for (let row = 0; row < this.gameEngine.boardSize; row++) {
                for (let col = 0; col < this.gameEngine.boardSize; col++) {
                    const grid = rotatedTile.shape_grid;
                    const rows = grid.length;
                    const cols = grid[0].length;
                    for (let anchorRow = 0; anchorRow < rows; anchorRow++) {
                        for (let anchorCol = 0; anchorCol < cols; anchorCol++) {
                            if (grid[anchorRow][anchorCol] === 1 &&
                                this.gameEngine.canPlaceTile(rotatedTile, row, col, anchorRow, anchorCol)) {
                                return true; // Tile can still fit
                            }
                        }
                    }
                }
            }
        }
        return false; // Tile cannot fit anywhere
    }

    calculateMetrics(game, isRealGame = false) {
        const villages = game.calculateVillages();

        const myColor = this.playerColor;
        const opponentColor = myColor === 'red' ? 'blue' : 'red';

        // Calculate Lake villages
        const myLakeVillages = this.getLakeVillages(villages[myColor], game);
        const opponentLakeVillages = this.getLakeVillages(villages[opponentColor], game);

        // Calculate Reedbed villages
        const myReedbedVillages = this.getReedbedVillages(villages[myColor], game);

        // Get biggest villages with expansion fronts
        const myBiggestLake = this.getBiggestVillageWithExpansion(myLakeVillages);
        const opponentBiggestLake = this.getBiggestVillageWithExpansion(opponentLakeVillages);
        const myBiggestReedbed = this.getBiggestVillageWithExpansion(myReedbedVillages);

        const metrics = {
            myBVL: myBiggestLake.size,
            myEFL: myBiggestLake.expansionFront,
            opponentEFL: opponentBiggestLake.expansionFront,
            myBVR: myBiggestReedbed.size,
            myEFR: myBiggestReedbed.expansionFront
        };

        // Log the metrics with clear marking for real vs simulated games
        const gameType = isRealGame ? 'REAL GAME' : 'SIMULATED';
        // console.log(`[UrosHeuristicPlayer-${this.strategy}] ${gameType} STATE: BVL=${metrics.myBVL}, EFL=${metrics.myEFL}, OppEFL=${metrics.opponentEFL}, BVR=${metrics.myBVR}, EFR=${metrics.myEFR} | W: A=${this.weights.A}, B=${this.weights.B}, C=${this.weights.C}, D=${this.weights.D}, E=${this.weights.E} | VILLAGES: myLake=${myLakeVillages.length}, oppLake=${opponentLakeVillages.length}, myReedbed=${myReedbedVillages.length}`);

        return metrics;
    }

    getLakeVillages(villages, game) {
        return villages.filter(village => {
            // Check if any house in the village is on a placed tile
            return village.some(house => {
                const tile = game.gameState.placedTiles.find(t => t.id === house.tile.id);
                return tile !== undefined;
            });
        });
    }

    getReedbedVillages(villages, game) {
        return villages.filter(village => {
            // Check if all houses in the village are on Reedbed tiles
            return village.every(house => {
                const tile = game.gameState.reedbed.find(t => t.id === house.tile.id);
                return tile !== undefined;
            });
        });
    }

    getBiggestVillageWithExpansion(villages) {
        if (villages.length === 0) {
            return { size: 0, expansionFront: 0 };
        }

        // Calculate expansion front for each village
        const villagesWithExpansion = villages.map(village => {
            const expansionFront = this.calculateExpansionFront(village);
            return { village, size: village.length, expansionFront };
        });

        // Sort by size first, then by expansion front
        villagesWithExpansion.sort((a, b) => {
            if (a.size !== b.size) {
                return b.size - a.size;
            }
            return b.expansionFront - a.expansionFront;
        });

        // If still tied, choose randomly
        const bestSize = villagesWithExpansion[0].size;
        const bestExpansion = villagesWithExpansion[0].expansionFront;
        const tiedVillages = villagesWithExpansion.filter(v =>
            v.size === bestSize && v.expansionFront === bestExpansion
        );

        const randomIndex = Math.floor(this.getRandom() * tiedVillages.length);
        return tiedVillages[randomIndex];
    }

    calculateExpansionFront(village) {
        const emptyAdjacentSquares = new Set();

        for (const house of village) {
            const tile = house.tile;
            const tileRow = house.tileRow;
            const tileCol = house.tileCol;

            // Check all adjacent positions within the same tile
            const adjacentPositions = [
                { row: tileRow - 1, col: tileCol },
                { row: tileRow + 1, col: tileCol },
                { row: tileRow, col: tileCol - 1 },
                { row: tileRow, col: tileCol + 1 }
            ];

            for (const pos of adjacentPositions) {
                if (pos.row >= 0 && pos.row < tile.houses.length &&
                    pos.col >= 0 && pos.col < tile.houses[0].length) {

                    const isIslandSquare = tile.shape_grid[pos.row][pos.col] === 1;
                    const isEmpty = tile.houses[pos.row][pos.col] === null;

                    if (isIslandSquare && isEmpty) {
                        // Create unique identifier for this empty square
                        const squareId = `${tile.id}-${pos.row}-${pos.col}`;
                        emptyAdjacentSquares.add(squareId);
                    }
                }
            }

            // Check cross-tile adjacency for placed tiles (lake board)
            // This matches the game's floodFill logic for cross-tile village detection
            if (this.gameEngine.gameState.placedTiles.find(t => t.id === tile.id)) {
                // Compute the board coordinates of this house
                const boardRow = tile.row + (tileRow - (tile.anchor ? tile.anchor.tileRow : 0));
                const boardCol = tile.col + (tileCol - (tile.anchor ? tile.anchor.tileCol : 0));

                // Check orthogonal neighbors on adjacent tiles
                const crossTilePositions = [
                    { row: boardRow - 1, col: boardCol },
                    { row: boardRow + 1, col: boardCol },
                    { row: boardRow, col: boardCol - 1 },
                    { row: boardRow, col: boardCol + 1 }
                ];

                for (const pos of crossTilePositions) {
                    if (pos.row >= 0 && pos.row < this.gameEngine.boardSize &&
                        pos.col >= 0 && pos.col < this.gameEngine.boardSize) {
                        const adjacentTile = this.gameEngine.gameState.board[pos.row][pos.col];
                        if (adjacentTile && adjacentTile !== tile) {
                            // For the adjacent tile, recompute tile-local coordinates
                            if (!adjacentTile.anchor) {
                                continue; // Skip if anchor data is missing
                            }
                            const anchor = adjacentTile.anchor;
                            const adjacentTileRow = anchor.tileRow + (pos.row - adjacentTile.row);
                            const adjacentTileCol = anchor.tileCol + (pos.col - adjacentTile.col);

                            if (adjacentTileRow >= 0 && adjacentTileRow < adjacentTile.houses.length &&
                                adjacentTileCol >= 0 && adjacentTileCol < adjacentTile.houses[0].length) {

                                const isAdjacentIslandSquare = adjacentTile.shape_grid[adjacentTileRow][adjacentTileCol] === 1;
                                const isAdjacentEmpty = adjacentTile.houses[adjacentTileRow][adjacentTileCol] === null;

                                if (isAdjacentIslandSquare && isAdjacentEmpty) {
                                    // Create unique identifier for this cross-tile empty square
                                    const crossTileSquareId = `${adjacentTile.id}-${adjacentTileRow}-${adjacentTileCol}`;
                                    emptyAdjacentSquares.add(crossTileSquareId);
                                }
                            }
                        }
                    }
                }
            }
        }

        return emptyAdjacentSquares.size;
    }

    calculateHeuristicScore(currentMetrics, newMetrics, isRealGame = false) {
        const deltaBVL = newMetrics.myBVL - currentMetrics.myBVL;
        const deltaEFL = newMetrics.myEFL - currentMetrics.myEFL;
        const deltaOpponentEFL = newMetrics.opponentEFL - currentMetrics.opponentEFL;
        const deltaBVR = newMetrics.myBVR - currentMetrics.myBVR;
        const deltaEFR = newMetrics.myEFR - currentMetrics.myEFR;

        const weightedBVL = this.weights.A * deltaBVL;
        const weightedEFL = this.weights.B * deltaEFL;
        const weightedOpponentEFL = -this.weights.C * deltaOpponentEFL;
        const weightedBVR = this.weights.D * deltaBVR;
        const weightedEFR = this.weights.E * deltaEFR;

        const score = weightedBVL + weightedEFL + weightedOpponentEFL + weightedBVR + weightedEFR;

        // Log the score calculation with clear marking and full breakdown
        const gameType = isRealGame ? 'REAL GAME' : 'SIMULATED';
        // console.log(`[UrosHeuristicPlayer-${this.strategy}] ${gameType} SCORE_CALC: dBVL=${deltaBVL}*${this.weights.A}=${weightedBVL}, dEFL=${deltaEFL}*${this.weights.B}=${weightedEFL}, dOppEFL=${deltaOpponentEFL}*-${this.weights.C}=${weightedOpponentEFL}, dBVR=${deltaBVR}*${this.weights.D}=${weightedBVR}, dEFR=${deltaEFR}*${this.weights.E}=${weightedEFR} | TOTAL=${score}`);

        return {
            score,
            calculation: {
                deltaBVL, deltaEFL, deltaOpponentEFL, deltaBVR, deltaEFR,
                weightedBVL, weightedEFL, weightedOpponentEFL, weightedBVR, weightedEFR
            }
        };
    }

    getDebugData() {
        return this.lastDebugData;
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
            randomize: false,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10
        }
    },
    'random': {
        id: 'random',
        name: 'Random',
        description: 'Makes random valid moves.',
        class: UrosRandomPlayer,
        config: {
            randomize: true,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10
        }
    },
    'minimax': {
        id: 'minimax',
        name: 'Minimax',
        description: 'Uses minimax algorithm with alpha-beta pruning.',
        class: UrosMinimaxPlayer,
        config: {
            randomize: false,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10
        }
    },
    'mcts': {
        id: 'mcts',
        name: 'Monte Carlo Tree Search',
        description: 'Uses Monte Carlo Tree Search for advanced play.',
        class: UrosMCTSPlayer,
        config: {
            randomize: true,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10
        }
    },
    'heuristic-balanced': {
        id: 'heuristic-balanced',
        name: 'Heuristic - Balanced',
        description: 'All-round approach with balanced priorities.',
        class: UrosHeuristicPlayer,
        config: {
            randomize: false,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10,
            strategy: 'balanced'
        }
    },
    'heuristic-explore': {
        id: 'heuristic-explore',
        name: 'Heuristic - Explore',
        description: 'Prioritizes extending potential territory.',
        class: UrosHeuristicPlayer,
        config: {
            randomize: false,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10,
            strategy: 'explore'
        }
    },
    'heuristic-expand': {
        id: 'heuristic-expand',
        name: 'Heuristic - Expand',
        description: 'Grabs territory whenever available.',
        class: UrosHeuristicPlayer,
        config: {
            randomize: false,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10,
            strategy: 'expand'
        }
    },
    'heuristic-exterminate': {
        id: 'heuristic-exterminate',
        name: 'Heuristic - Exterminate',
        description: 'Denies territory to opponent.',
        class: UrosHeuristicPlayer,
        config: {
            randomize: false,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10,
            strategy: 'exterminate'
        }
    },
    'heuristic-exploit': {
        id: 'heuristic-exploit',
        name: 'Heuristic - Exploit',
        description: 'Makes opponent place the islands.',
        class: UrosHeuristicPlayer,
        config: {
            randomize: false,
            randomThreshold: 0.1,
            useRandomSeed: false,
            randomSeed: null,
            thinkingTime: 10,
            strategy: 'exploit'
        }
    }
};

export function createUrosPlayer(strategyId, gameEngine, playerColor, config = {}) {

    const playerConfig = UROS_AI_PLAYERS[strategyId];
    if (!playerConfig) {
        throw new Error(`Unknown player strategy: ${strategyId}`);
    }

    // Validate that all required config values are provided
    const requiredConfig = {
        randomize: typeof config.randomize === 'boolean' ? config.randomize : playerConfig.config.randomize,
        randomThreshold: typeof config.randomThreshold === 'number' ? config.randomThreshold : playerConfig.config.randomThreshold,
        useRandomSeed: typeof config.useRandomSeed === 'boolean' ? config.useRandomSeed : playerConfig.config.useRandomSeed,
        randomSeed: config.randomSeed !== undefined ? config.randomSeed : playerConfig.config.randomSeed,
        thinkingTime: typeof config.thinkingTime === 'number' ? config.thinkingTime : playerConfig.config.thinkingTime
    };

    // Only add strategy for heuristic bots
    if (playerConfig.class === UrosHeuristicPlayer) {
        requiredConfig.strategy = config.strategy !== undefined ? config.strategy : playerConfig.config.strategy;
    }



    // Validate thinking time
    if (typeof requiredConfig.thinkingTime !== 'number' || requiredConfig.thinkingTime <= 0) {
        throw new Error(`createUrosPlayer: thinkingTime must be a positive number, got ${requiredConfig.thinkingTime}`);
    }

    // Validate randomize
    if (typeof requiredConfig.randomize !== 'boolean') {
        throw new Error(`createUrosPlayer: randomize must be a boolean, got ${typeof requiredConfig.randomize}`);
    }

    // Validate randomThreshold
    if (typeof requiredConfig.randomThreshold !== 'number' || requiredConfig.randomThreshold < 0 || requiredConfig.randomThreshold > 1) {
        throw new Error(`createUrosPlayer: randomThreshold must be a number between 0 and 1, got ${requiredConfig.randomThreshold}`);
    }

    // Validate useRandomSeed
    if (typeof requiredConfig.useRandomSeed !== 'boolean') {
        throw new Error(`createUrosPlayer: useRandomSeed must be a boolean, got ${typeof requiredConfig.useRandomSeed}`);
    }

    // Validate randomSeed when useRandomSeed is true
    if (requiredConfig.useRandomSeed && (typeof requiredConfig.randomSeed !== 'number' || requiredConfig.randomSeed === null)) {
        throw new Error(`createUrosPlayer: randomSeed must be a number when useRandomSeed is true, got ${requiredConfig.randomSeed}`);
    }

    return new playerConfig.class(gameEngine, playerColor, requiredConfig);
} 