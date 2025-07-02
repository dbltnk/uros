// Uros Board Game Implementation
// Combines game logic with existing logging system

class UrosGame {
    static CONFIG = {
        BOARD_SIZE: 6,
        HOUSES_PER_PLAYER: 15,
        ISLAND_STYLES: [
            { bg: '#22c55e', border: '#15803d' }, // Standard green
            { bg: '#16a34a', border: '#166534' }, // Darker green
            { bg: '#4ade80', border: '#22c55e' }, // Lighter green
            { bg: '#aad3bb', border: '#0891b2' }, // Teal
            { bg: '#34d399', border: '#059669' }, // Emerald
            { bg: '#10b981', border: '#047857' }, // Green
            { bg: '#84cc16', border: '#65a30d' }, // Lime
            { bg: '#a3e635', border: '#84cc16' }, // Light lime
            { bg: '#bef264', border: '#a3e635' }  // Very light lime
        ]
    };

    constructor() {
        this.boardSize = UrosGame.CONFIG.BOARD_SIZE;
        this.housesPerPlayer = UrosGame.CONFIG.HOUSES_PER_PLAYER;
        this.tiles = [];
        this.gameState = null;
        this.islandStyles = UrosGame.CONFIG.ISLAND_STYLES;

        // Centralized state management for all interactions
        this.interactionState = {
            mode: null, // 'tile-selection', 'tile-placement', 'house-placement', null
            selectedTile: null,
            selectedPlayer: null, // for house placement
            preview: null,
            hoveredTileId: null
        };

        // Event handler references for cleanup
        this.eventHandlers = {
            board: null,
            reedbed: null,
            global: null
        };

        // Bot management
        this.botPlayers = {
            red: null,
            blue: null
        };
        this.gameMode = 'bot-vs-bot'; // 'human-vs-human', 'human-vs-bot', 'bot-vs-bot'
        this.botThinkingTime = 10; // ms - default thinking time for all bots
        this.botMoveDelay = 10; // ms delay between bot moves for better UX

        // Random seed management
        this.useRandomSeed = true;
        this.randomSeed = null;
        this.seedGenerator = null;

        this.init();
    }

    init() {
        console.log('Initializing Uros game');
        this.loadTiles();
        this.setupClickHandling();
        this.setupButtonHandlers();

        console.log('Uros game and logging system initialized');
    }

    loadTiles() {
        // Load tiles from JSON file
        fetch('content/tiles.json')
            .then(response => response.json())
            .then(data => {
                this.tiles = data.tiles.map((tile, index) => ({
                    ...tile,
                    id: index,
                    rotation: 0
                }));
                console.log(`Loaded ${this.tiles.length} tiles`);
                // this.startNewGame(); // Removed: don't auto-start game on load
            })
            .catch(error => {
                console.error('Failed to load tiles:', error);
                // Fallback to hardcoded tiles if JSON fails
                this.createFallbackTiles();
                // this.startNewGame(); // Removed: don't auto-start game on fallback
            });
    }

    createFallbackTiles() {
        // Simple fallback tiles if JSON loading fails
        this.tiles = [
            { id: 0, name: "Domino", shape_grid: [[1, 1, 0], [0, 0, 0], [0, 0, 0]], rotation: 0 },
            { id: 1, name: "L-tromino", shape_grid: [[1, 1, 0], [1, 0, 0], [0, 0, 0]], rotation: 0 },
            { id: 2, name: "I-tromino", shape_grid: [[1, 1, 1], [0, 0, 0], [0, 0, 0]], rotation: 0 },
            { id: 3, name: "T-tetromino", shape_grid: [[1, 1, 1], [0, 1, 0], [0, 0, 0]], rotation: 0 },
            { id: 4, name: "S-tetromino", shape_grid: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], rotation: 0 },
            { id: 5, name: "L-tetromino", shape_grid: [[1, 0, 0], [1, 0, 0], [1, 1, 0]], rotation: 0 },
            { id: 6, name: "P-pentomino", shape_grid: [[1, 1, 0], [1, 1, 0], [1, 0, 0]], rotation: 0 },
            { id: 7, name: "F-pentomino", shape_grid: [[0, 1, 1], [1, 1, 0], [0, 1, 0]], rotation: 0 },
            { id: 8, name: "C-pentomino", shape_grid: [[1, 1, 0], [1, 0, 0], [1, 1, 0]], rotation: 0 }
        ];
        // this.startNewGame(); // Removed: don't auto-start game on fallback
    }



    rotateTile(tile, direction = 1) {
        if (!tile) return tile;

        const rotated = { ...tile };
        rotated.rotation = (rotated.rotation + direction) % 4;

        // Rotate both the shape grid and houses array
        const grid = rotated.shape_grid;
        const houses = rotated.houses;
        const rows = grid.length;
        const cols = grid[0].length;

        // Handle negative directions by converting to positive
        const absDirection = Math.abs(direction);
        const isClockwise = direction > 0;

        for (let i = 0; i < absDirection; i++) {
            // Rotate shape grid
            const newGrid = Array(cols).fill(null).map(() => Array(rows).fill(0));
            // Rotate houses array
            const newHouses = Array(cols).fill(null).map(() => Array(rows).fill(null));

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (isClockwise) {
                        // Clockwise rotation
                        newGrid[c][rows - 1 - r] = grid[r][c];
                        newHouses[c][rows - 1 - r] = houses[r][c];
                    } else {
                        // Counter-clockwise rotation
                        newGrid[cols - 1 - c][r] = grid[r][c];
                        newHouses[cols - 1 - c][r] = houses[r][c];
                    }
                }
            }
            rotated.shape_grid = newGrid;
            rotated.houses = newHouses;
        }

        return rotated;
    }

    /**
     * Checks if a tile can be placed at (row, col) with anchor (anchorTileRow, anchorTileCol)
     * Only green (island) cells matter for placement; brown cells can hang off the board.
     */
    canPlaceTile(tile, row, col, anchorTileRow = 0, anchorTileCol = 0) {
        if (!tile) return false;
        const grid = tile.shape_grid;
        const rows = grid.length;
        const cols = grid[0].length;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] !== 1) continue;
                const br = row + (r - anchorTileRow);
                const bc = col + (c - anchorTileCol);
                if (br < 0 || br >= this.boardSize || bc < 0 || bc >= this.boardSize) return false;
                if (this.gameState.board[br][bc]) return false;
            }
        }
        return true;
    }

    /**
     * Place the tile using the anchor logic
     */
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
        const visited = new Set();
        const villages = { red: [], blue: [] };

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
        const queue = [{ tile: startTile, row: startRow, col: startCol }];
        const prefix = isPlacedTile ? 'placed' : 'reedbed';

        while (queue.length > 0) {
            const { tile, row, col } = queue.shift();
            const key = `${prefix}-${tile.id}-${row}-${col}`;

            if (visited.has(key)) continue;
            visited.add(key);

            // Defensive: assert bounds
            console.assert(row >= 0 && row < tile.houses.length && col >= 0 && col < tile.houses[0].length, 'floodFill: row/col out of bounds');

            if (tile.houses[row][col] === player && tile.shape_grid[row][col] === 1) {
                village.push({ tile, row, col });

                // Check orthogonal neighbors within the same tile
                const neighbors = [
                    { row: row - 1, col },
                    { row: row + 1, col },
                    { row, col: col - 1 },
                    { row, col: col + 1 }
                ];

                for (const neighbor of neighbors) {
                    if (neighbor.row >= 0 && neighbor.row < tile.houses.length &&
                        neighbor.col >= 0 && neighbor.col < tile.houses[0].length &&
                        tile.shape_grid[neighbor.row][neighbor.col] === 1 &&
                        tile.houses[neighbor.row][neighbor.col] === player) {
                        queue.push({ tile, row: neighbor.row, col: neighbor.col });
                    }
                }

                // Only check adjacent tiles if this is a placed tile
                if (isPlacedTile) {
                    // Compute the board coordinates of this house
                    const boardRow = tile.row + (row - (tile.anchor ? tile.anchor.tileRow : 0));
                    const boardCol = tile.col + (col - (tile.anchor ? tile.anchor.tileCol : 0));

                    // Check orthogonal neighbors on adjacent tiles
                    const adjacentPositions = [
                        { row: boardRow - 1, col: boardCol },
                        { row: boardRow + 1, col: boardCol },
                        { row: boardRow, col: boardCol - 1 },
                        { row: boardRow, col: boardCol + 1 }
                    ];

                    for (const pos of adjacentPositions) {
                        if (pos.row >= 0 && pos.row < this.boardSize &&
                            pos.col >= 0 && pos.col < this.boardSize) {
                            const adjacentTile = this.gameState.board[pos.row][pos.col];
                            if (adjacentTile && adjacentTile !== tile) {
                                // For the adjacent tile, recompute tile-local coordinates
                                const anchor = adjacentTile.anchor || { tileRow: 0, tileCol: 0 };
                                const tileRow = anchor.tileRow + (pos.row - adjacentTile.row);
                                const tileCol = anchor.tileCol + (pos.col - adjacentTile.col);
                                // Defensive: assert bounds
                                console.assert(tileRow >= 0 && tileRow < adjacentTile.houses.length && tileCol >= 0 && tileCol < adjacentTile.houses[0].length, 'adjacentTile tileRow/tileCol out of bounds');
                                if (tileRow >= 0 && tileRow < adjacentTile.houses.length &&
                                    tileCol >= 0 && tileCol < adjacentTile.houses[0].length &&
                                    adjacentTile.shape_grid[tileRow][tileCol] === 1 &&
                                    adjacentTile.houses[tileRow][tileCol] === player) {
                                    const adjKey = `placed-${adjacentTile.id}-${tileRow}-${tileCol}`;
                                    if (!visited.has(adjKey)) {
                                        queue.push({ tile: adjacentTile, row: tileRow, col: tileCol });
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
        const currentPlayer = this.gameState.currentPlayer;
        const hasHouses = this.gameState.players[currentPlayer].houses > 0;
        const hasPlaceableTiles = this.gameState.reedbed.some(tile => {
            for (let row = 0; row < this.boardSize; row++) {
                for (let col = 0; col < this.boardSize; col++) {
                    if (this.canPlaceTile(tile, row, col)) return true;
                }
            }
            return false;
        });

        // Check if current player has any valid moves (including house placements)
        const validMoves = this.getValidMoves();
        const hasValidMoves = validMoves.length > 0;

        console.log(`checkGameOver: ${currentPlayer} has ${validMoves.length} valid moves, ${hasValidMoves ? 'can continue' : 'no moves available'}`);

        // Game ends if current player has no valid moves
        if (!hasValidMoves) {
            console.log(`Game over: ${currentPlayer} has no valid moves available`);
            this.endGame();
            return true;
        }

        // Also check the original condition (no houses and no placeable tiles)
        if (!hasHouses && !hasPlaceableTiles) {
            console.log(`Game over: ${currentPlayer} has no houses and no placeable tiles`);
            this.endGame();
            return true;
        }

        return false;
    }

    endGame() {
        console.log('Game over!');
        this.gameState.gameOver = true;

        const villages = this.calculateVillages();
        const redLargest = this.getLargestVillage(villages.red);
        const blueLargest = this.getLargestVillage(villages.blue);

        let winner = null;
        if (redLargest.size > blueLargest.size) {
            winner = 'red';
        } else if (blueLargest.size > redLargest.size) {
            winner = 'blue';
        } else if (redLargest.islands > blueLargest.islands) {
            winner = 'red';
        } else if (blueLargest.islands > redLargest.islands) {
            winner = 'blue';
        }

        this.showGameOverInStatusBar(winner, redLargest, blueLargest);
    }

    showGameOverInStatusBar(winner, redLargest, blueLargest) {
        // Store game over state for status bar updates
        this.gameState.gameOverWinner = winner;
        this.gameState.gameOverRedLargest = redLargest;
        this.gameState.gameOverBlueLargest = blueLargest;

        // Update status bar immediately
        this.updateStatus();
    }

    nextTurn() {
        // Call original nextTurn logic
        this.gameState.placementsThisTurn = (this.gameState.placementsThisTurn || 0) + 1;
        if (this.gameState.isFirstTurn) {
            // First turn: only 1 placement
            if (this.gameState.placementsThisTurn >= 1) {
                this.gameState.isFirstTurn = false;
                this.gameState.currentPlayer = 'blue';
                this.gameState.placementsThisTurn = 0;
                this.gameState.placementsRequired = 2;
            }
        } else {
            // All subsequent turns: 2 placements per turn
            if (this.gameState.placementsThisTurn >= 2) {
                this.gameState.currentPlayer = this.gameState.currentPlayer === 'red' ? 'blue' : 'red';
                this.gameState.placementsThisTurn = 0;
                this.gameState.placementsRequired = 2;
            }
        }

        this.updateStatus();
        if (this.checkGameOver()) {
            return;
        }
        this.render();

        // Check if current player is a bot and execute bot turn with delay
        if (this.isCurrentPlayerBot() && !this.gameState.gameOver) {
            // Always use the bot's thinking time for delay between turns
            const currentBot = this.botPlayers[this.gameState.currentPlayer];
            const thinkingTime = currentBot ? (currentBot.thinkingTime || this.botThinkingTime) : this.botThinkingTime;
            setTimeout(() => this.executeBotTurn(), thinkingTime);
        }
    }

    updateStatus() {
        const status = document.getElementById('game-status');
        // const redHouses = document.getElementById('red-houses-left');
        // const blueHouses = document.getElementById('blue-houses-left');
        const scores = document.getElementById('village-scores');
        const statusBar = document.querySelector('.status-bar');

        // Check if game is over
        if (this.gameState.gameOver) {
            const winner = this.gameState.gameOverWinner;
            const redLargest = this.gameState.gameOverRedLargest;
            const blueLargest = this.gameState.gameOverBlueLargest;

            // Change status bar background color based on winner
            if (winner === 'red') {
                statusBar.style.backgroundColor = '#dc2626';
                statusBar.style.color = 'white';
            } else if (winner === 'blue') {
                statusBar.style.backgroundColor = '#2563eb';
                statusBar.style.color = 'white';
            } else {
                statusBar.style.backgroundColor = '#6b7280';
                statusBar.style.color = 'white';
            }

            // Show game over message
            if (winner) {
                status.textContent = `🏆 ${winner === 'red' ? '🔴 Red' : '🔵 Blue'} Wins!`;
            } else {
                status.textContent = "🤝 It's a Tie!";
            }

            // Show final scores
            scores.innerHTML = `
                <span class="text-red-300">Red: ${redLargest.size} houses on ${redLargest.islands} islands</span> | 
                <span class="text-blue-300">Blue: ${blueLargest.size} houses on ${blueLargest.islands} islands</span>
            `;

            // No more house counters to update
        } else {
            // Normal game state
            statusBar.style.backgroundColor = '#1f2937';
            statusBar.style.color = 'white';

            const currentPlayer = this.gameState.currentPlayer;
            const placementsLeft = (this.gameState.placementsRequired || 2) - (this.gameState.placementsThisTurn || 0);
            const playerName = currentPlayer === 'red' ? '🔴 Red' : '🔵 Blue';

            // Add bot indicator if current player is a bot
            const isBot = this.isCurrentPlayerBot();
            const botIndicator = isBot ? ' 🤖' : '';
            const playerType = isBot ? 'Bot' : 'Human';

            status.textContent = `${playerName} ${playerType}${botIndicator}'s turn (${placementsLeft} placement${placementsLeft > 1 ? 's' : ''} left)`;
            // No more house counters to update

            // Calculate current village sizes
            const villages = this.calculateVillages();
            const redLargest = this.getLargestVillage(villages.red);
            const blueLargest = this.getLargestVillage(villages.blue);

            // Add bot type indicators
            const redBotType = this.botPlayers.red ? ` (${this.getBotTypeName(this.botPlayers.red)})` : '';
            const blueBotType = this.botPlayers.blue ? ` (${this.getBotTypeName(this.botPlayers.blue)})` : '';

            scores.innerHTML = `
                <span class="text-red-500">Red${redBotType}: ${redLargest.size}</span> | 
                <span class="text-blue-500">Blue${blueBotType}: ${blueLargest.size}</span>
            `;
        }
    }

    render() {
        this.renderBoard();
        this.renderReedbed();
        this.renderHousePools();
    }

    renderBoard() {
        const board = document.getElementById('lake-board');
        board.innerHTML = '';
        console.log('Rendering board with size:', this.boardSize);

        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const cell = document.createElement('div');
                cell.className = 'lake-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;

                // Preview overlay
                if (this.interactionState.preview && this.interactionState.mode === 'tile-placement') {
                    const { row: prow, col: pcol, anchor, tile } = this.interactionState.preview;
                    const grid = tile.shape_grid;
                    for (let tr = 0; tr < grid.length; tr++) {
                        for (let tc = 0; tc < grid[tr].length; tc++) {
                            if (grid[tr][tc] === 1) {
                                const boardR = prow + (tr - anchor.tileRow);
                                const boardC = pcol + (tc - anchor.tileCol);
                                if (row === boardR && col === boardC) {
                                    cell.classList.add('preview');
                                    // Preview house overlay
                                    if (tile.houses && tile.houses[tr][tc]) {
                                        const houseElement = document.createElement('div');
                                        houseElement.className = `house ${tile.houses[tr][tc]} preview`;
                                        houseElement.textContent = tile.houses[tr][tc] === 'red' ? '🏠' : '🏘️';
                                        houseElement.style.position = 'absolute';
                                        houseElement.style.top = '50%';
                                        houseElement.style.left = '50%';
                                        houseElement.style.transform = 'translate(-50%, -50%)';
                                        houseElement.style.fontSize = '1.5em';
                                        houseElement.style.zIndex = '10';
                                        cell.style.position = 'relative';
                                        cell.appendChild(houseElement);
                                    }
                                }
                            }
                        }
                    }
                }

                // Normal rendering
                const tile = this.gameState.board[row][col];
                if (tile) {
                    // Use anchor if present, else fallback to old logic
                    const anchor = tile.anchor || { tileRow: 0, tileCol: 0 };
                    const tileRow = anchor.tileRow + (row - tile.row);
                    const tileCol = anchor.tileCol + (col - tile.col);

                    if (tile.shape_grid[tileRow] && tile.shape_grid[tileRow][tileCol] === 1) {
                        cell.classList.add('island');
                        cell.style.cursor = 'pointer';

                        // Apply unique styling based on tile ID (no borders)
                        const styleIndex = tile.id % this.islandStyles.length;
                        const style = this.islandStyles[styleIndex];
                        cell.style.backgroundColor = style.bg;

                        const house = tile.houses[tileRow][tileCol];
                        if (house) {
                            const houseElement = document.createElement('div');
                            houseElement.className = `house ${house}`;
                            houseElement.textContent = house === 'red' ? '🏠' : '🏘️';
                            houseElement.style.position = 'absolute';
                            houseElement.style.top = '50%';
                            houseElement.style.left = '50%';
                            houseElement.style.transform = 'translate(-50%, -50%)';
                            houseElement.style.fontSize = '1.5em';
                            houseElement.style.zIndex = '10';
                            cell.style.position = 'relative';
                            cell.appendChild(houseElement);
                        }
                    } else {
                        cell.style.backgroundColor = '#0ea5e9';
                    }
                } else {
                    cell.style.backgroundColor = '#0ea5e9';
                    cell.style.cursor = 'pointer';
                }

                board.appendChild(cell);
            }
        }

        // === ISLAND OUTLINES (PER-CELL CONTOUR) ===
        // For each placed tile, add a high-contrast outline around its green cells
        // Remove any previous .island-outline elements
        document.querySelectorAll('.island-outline').forEach(el => el.remove());
        for (const tile of this.gameState.placedTiles) {
            const anchor = tile.anchor || { tileRow: 0, tileCol: 0 };
            const grid = tile.shape_grid;
            const rows = grid.length;
            const cols = grid[0].length;
            for (let tr = 0; tr < rows; tr++) {
                for (let tc = 0; tc < cols; tc++) {
                    if (grid[tr][tc] !== 1) continue;
                    const boardRow = tile.row + (tr - anchor.tileRow);
                    const boardCol = tile.col + (tc - anchor.tileCol);
                    if (boardRow < 0 || boardRow >= this.boardSize || boardCol < 0 || boardCol >= this.boardSize) continue;
                    // Find the corresponding cell
                    const idx = boardRow * this.boardSize + boardCol;
                    const cell = document.getElementsByClassName('lake-cell')[idx];
                    if (!cell) continue;
                    // For each side, if neighbor is not a green cell of the same tile, add a thick border
                    const directions = [
                        { dr: -1, dc: 0, style: 'borderTop' },
                        { dr: 1, dc: 0, style: 'borderBottom' },
                        { dr: 0, dc: -1, style: 'borderLeft' },
                        { dr: 0, dc: 1, style: 'borderRight' }
                    ];
                    for (const dir of directions) {
                        const ntr = tr + dir.dr;
                        const ntc = tc + dir.dc;
                        let isSameIslandNeighbor = false;
                        if (ntr >= 0 && ntr < rows && ntc >= 0 && ntc < cols) {
                            if (grid[ntr][ntc] === 1) isSameIslandNeighbor = true;
                        }
                        if (!isSameIslandNeighbor) {
                            cell.style[dir.style] = '4px solid #000'; // High-contrast black
                        }
                    }
                }
            }
        }
    }

    renderReedbed() {
        const reedbed = document.getElementById('reedbed');
        if (!reedbed) {
            console.error('Reedbed element not found!');
            return;
        }
        if (!this.gameState.reedbed) {
            reedbed.innerHTML = '';
            return;
        }
        reedbed.innerHTML = '';
        for (const tile of this.gameState.reedbed) {
            const tileElement = document.createElement('div');
            tileElement.className = 'tile-preview';
            tileElement.dataset.tileId = tile.id;

            // Apply hover and selection states
            if (this.interactionState.hoveredTileId === tile.id) {
                tileElement.classList.add('hovered');
            }
            if (this.interactionState.selectedTile && this.interactionState.selectedTile.id === tile.id &&
                this.interactionState.mode === 'tile-placement') {
                tileElement.classList.add('selected');
            }

            // Create tile grid
            const tileGrid = document.createElement('div');
            tileGrid.className = 'tile-grid';
            const grid = tile.shape_grid;

            for (let row = 0; row < grid.length; row++) {
                for (let col = 0; col < grid[row].length; col++) {
                    const cell = document.createElement('div');
                    cell.className = 'tile-cell';

                    if (grid[row][col] === 1) {
                        cell.classList.add('island');
                        cell.style.cursor = 'pointer';

                        // Apply unique styling based on tile ID (same as lake board, no borders)
                        const styleIndex = tile.id % this.islandStyles.length;
                        const style = this.islandStyles[styleIndex];
                        cell.style.backgroundColor = style.bg;

                        // Render house if present
                        const house = tile.houses[row][col];
                        if (house) {
                            const houseElement = document.createElement('div');
                            houseElement.className = `house ${house}`;
                            houseElement.textContent = house === 'red' ? '🏠' : '🏘️';
                            houseElement.style.width = '60%';
                            houseElement.style.height = '60%';
                            houseElement.style.fontSize = '0.6em';
                            cell.appendChild(houseElement);
                        }
                    } else {
                        cell.classList.add('not-island');
                    }

                    tileGrid.appendChild(cell);
                }
            }

            tileElement.appendChild(tileGrid);
            reedbed.appendChild(tileElement);
        }
    }

    renderHousePools() {
        // Render visual house displays
        this.renderHouseDisplay('red');
        this.renderHouseDisplay('blue');
    }

    renderHouseDisplay(player) {
        const displayElement = document.getElementById(`${player}-houses-display`);
        if (!displayElement) return;

        const totalHouses = this.housesPerPlayer;
        const remainingHouses = this.gameState.players[player].houses;
        const usedHouses = totalHouses - remainingHouses;
        const isCurrentHuman = this.gameState.currentPlayer === player && !this.botPlayers[player];

        displayElement.innerHTML = '';

        // Add remaining houses (bright, clickable only if human's turn)
        for (let i = 0; i < remainingHouses; i++) {
            const houseEmoji = document.createElement('span');
            houseEmoji.className = 'house-emoji' + (isCurrentHuman ? ' clickable' : '');
            houseEmoji.textContent = player === 'red' ? '🏠' : '🏘️';
            houseEmoji.title = `Place a house for ${player === 'red' ? 'Red' : 'Blue'} Player`;
            houseEmoji.tabIndex = isCurrentHuman ? 0 : -1;
            if (isCurrentHuman) {
                houseEmoji.addEventListener('click', (e) => {
                    if (this.gameState.currentPlayer === player && this.gameState.players[player].houses > 0) {
                        this.enterHousePlacementMode(player);
                    }
                });
            }
            displayElement.appendChild(houseEmoji);
        }

        // Add used houses (dimmed, not clickable)
        for (let i = 0; i < usedHouses; i++) {
            const houseEmoji = document.createElement('span');
            houseEmoji.className = 'house-emoji used';
            houseEmoji.textContent = player === 'red' ? '🏠' : '🏘️';
            displayElement.appendChild(houseEmoji);
        }
    }

    /**
     * Set up button event handlers (separate from click handling for clarity)
     */
    setupButtonHandlers() {
        // New game button
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.applyBotConfiguration();
        });

        // Bot configuration handlers
        this.setupBotConfigurationHandlers();
    }

    /**
     * Set up bot configuration event handlers
     */
    setupBotConfigurationHandlers() {
        // Thinking time slider
        const thinkingTimeSlider = document.getElementById('bot-thinking-time');
        const thinkingTimeDisplay = document.getElementById('thinking-time-display');

        if (thinkingTimeSlider && thinkingTimeDisplay) {
            thinkingTimeSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                thinkingTimeDisplay.textContent = `${value}ms`;
                this.botThinkingTime = parseInt(value);
            });
        }



        // Random seed controls
        const useRandomSeedCheckbox = document.getElementById('use-random-seed');
        const randomSeedInput = document.getElementById('random-seed');

        if (useRandomSeedCheckbox) {
            useRandomSeedCheckbox.addEventListener('change', (e) => {
                this.useRandomSeed = e.target.checked;
                if (!this.useRandomSeed) {
                    this.randomSeed = null;
                    if (randomSeedInput) randomSeedInput.value = '';
                }
                this.initializeRandomSeed();
            });
        }

        if (randomSeedInput) {
            randomSeedInput.addEventListener('input', (e) => {
                const value = e.target.value;
                this.randomSeed = value ? parseInt(value) : null;
                this.initializeRandomSeed();
            });
        }




    }

    /**
     * Apply bot configuration from UI and start new game
     */
    applyBotConfiguration() {
        const redPlayerSelect = document.getElementById('red-player-select');
        const bluePlayerSelect = document.getElementById('blue-player-select');

        if (!redPlayerSelect || !bluePlayerSelect) {
            console.error('Bot configuration elements not found');
            return;
        }

        const redPlayerType = redPlayerSelect.value;
        const bluePlayerType = bluePlayerSelect.value;

        // Clear existing bots
        this.botPlayers.red = null;
        this.botPlayers.blue = null;

        // Set up pending bot configuration
        this.pendingBotConfig = {};

        // Set up bots based on configuration
        if (redPlayerType !== 'human') {
            this.pendingBotConfig.red = { botType: redPlayerType, config: {} };
        }

        if (bluePlayerType !== 'human') {
            this.pendingBotConfig.blue = { botType: bluePlayerType, config: {} };
        }

        // Update game mode automatically based on player types
        this.updateGameMode();

        // Reinitialize random seed for new game
        this.initializeRandomSeed();

        console.log(`Applied bot configuration: Red=${redPlayerType}, Blue=${bluePlayerType}`);
        console.log('Pending bot config:', this.pendingBotConfig);

        // Start new game first, then initialize bot system
        this.startNewGame();

        // Initialize bot system with new configuration (will start bot turns after initialization)
        this.initializeBotSystem();
    }



    /**
     * Centralized click handling system using event delegation
     * All clicks go through this single entry point for consistent behavior
     */
    setupClickHandling() {
        // Remove any existing handlers to prevent duplicates
        this.cleanupEventHandlers();

        // Board click handling (event delegation)
        const board = document.getElementById('lake-board');
        if (!board) {
            console.error('Lake board element must exist');
            return;
        }

        this.eventHandlers.board = (e) => {
            // Only allow if current player is human
            if (this.botPlayers[this.gameState.currentPlayer]) return;
            const cell = e.target.closest('.lake-cell');
            if (!cell) return;
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            if (isNaN(row) || isNaN(col)) {
                console.error('Cell must have valid row/col data attributes');
                return;
            }
            this.handleBoardCellClick(row, col, e);
        };
        board.addEventListener('click', this.eventHandlers.board);

        // Reedbed click handling (event delegation)
        const reedbed = document.getElementById('reedbed');
        if (!reedbed) {
            console.error('Reedbed element must exist');
            return;
        }
        this.eventHandlers.reedbed = (e) => {
            // Only allow if current player is human
            if (this.botPlayers[this.gameState.currentPlayer]) return;
            // Handle tile selection clicks
            const tileElement = e.target.closest('.tile-preview');
            if (tileElement && this.interactionState.mode !== 'house-placement') {
                const tileId = parseInt(tileElement.dataset.tileId);
                console.log('Looking for tile with ID:', tileId, 'Available tiles:', this.gameState.reedbed.map(t => t.id));
                const tile = this.gameState.reedbed.find(t => t.id === tileId);
                if (!tile) {
                    console.error('Tile must exist in reedbed');
                    return;
                }
                this.handleTileSelection(tile);
                return;
            }

            // Handle reedbed cell clicks (for house placement)
            const cell = e.target.closest('.tile-cell');
            if (cell && this.interactionState.mode === 'house-placement') {
                const tileElement = cell.closest('.tile-preview');
                const tileId = parseInt(tileElement.dataset.tileId);
                const tile = this.gameState.reedbed.find(t => t.id === tileId);
                if (!tile) {
                    console.error('Tile must exist in reedbed');
                    return;
                }

                const tileGrid = cell.closest('.tile-grid');
                const cellIndex = Array.from(tileGrid.children).indexOf(cell);
                const row = Math.floor(cellIndex / 3);
                const col = cellIndex % 3;

                this.handleReedbedHousePlacement(tile, row, col);
                return;
            }
        };

        reedbed.addEventListener('click', this.eventHandlers.reedbed);

        // Hover handling for reedbed
        reedbed.addEventListener('mouseenter', (e) => {
            const tileElement = e.target.closest('.tile-preview');
            if (tileElement && this.interactionState.mode !== 'house-placement') {
                this.interactionState.hoveredTileId = parseInt(tileElement.dataset.tileId);
                this.renderReedbed();
            }
        });

        reedbed.addEventListener('mouseleave', (e) => {
            if (this.interactionState.mode !== 'house-placement') {
                this.interactionState.hoveredTileId = null;
                this.renderReedbed();
            }
        });

        // House preview hover handling for lake board
        board.addEventListener('mouseover', (e) => {
            if (this.interactionState.mode === 'house-placement') {
                const cell = e.target.closest('.lake-cell');
                if (cell) {
                    const row = parseInt(cell.dataset.row);
                    const col = parseInt(cell.dataset.col);
                    this.showHousePreviewOnBoard(row, col);
                }
            }
        });

        board.addEventListener('mouseout', (e) => {
            if (this.interactionState.mode === 'house-placement') {
                // Only clear if we're actually leaving the board area
                const relatedTarget = e.relatedTarget;
                if (!relatedTarget || !board.contains(relatedTarget)) {
                    this.clearHousePreviewOnBoard();
                }
            }
        });

        // Use mousemove for more reliable preview updates
        board.addEventListener('mousemove', (e) => {
            if (this.interactionState.mode === 'house-placement') {
                const cell = e.target.closest('.lake-cell');
                if (cell) {
                    const row = parseInt(cell.dataset.row);
                    const col = parseInt(cell.dataset.col);
                    this.showHousePreviewOnBoard(row, col);
                }
            }
        });

        // House preview hover handling for reedbed
        reedbed.addEventListener('mouseover', (e) => {
            if (this.interactionState.mode === 'house-placement') {
                const cell = e.target.closest('.tile-cell');
                if (cell) {
                    const tileElement = cell.closest('.tile-preview');
                    const tileId = parseInt(tileElement.dataset.tileId);
                    const tile = this.gameState.reedbed.find(t => t.id === tileId);
                    if (tile) {
                        const tileGrid = cell.closest('.tile-grid');
                        const cellIndex = Array.from(tileGrid.children).indexOf(cell);
                        const row = Math.floor(cellIndex / 3);
                        const col = cellIndex % 3;
                        this.showHousePreviewOnReedbed(tile, row, col);
                    }
                }
            }
        });

        reedbed.addEventListener('mouseout', (e) => {
            if (this.interactionState.mode === 'house-placement') {
                // Only clear if we're actually leaving the reedbed area
                const relatedTarget = e.relatedTarget;
                if (!relatedTarget || !reedbed.contains(relatedTarget)) {
                    this.clearHousePreviewOnReedbed();
                }
            }
        });

        // Use mousemove for more reliable preview updates
        reedbed.addEventListener('mousemove', (e) => {
            if (this.interactionState.mode === 'house-placement') {
                const cell = e.target.closest('.tile-cell');
                if (cell) {
                    const tileElement = cell.closest('.tile-preview');
                    const tileId = parseInt(tileElement.dataset.tileId);
                    const tile = this.gameState.reedbed.find(t => t.id === tileId);
                    if (tile) {
                        const tileGrid = cell.closest('.tile-grid');
                        const cellIndex = Array.from(tileGrid.children).indexOf(cell);
                        const row = Math.floor(cellIndex / 3);
                        const col = cellIndex % 3;
                        this.showHousePreviewOnReedbed(tile, row, col);
                    }
                }
            }
        });

        // Global keyboard handling
        this.setupKeyboardHandling();

        // Global click handling for canceling interactions
        this.eventHandlers.global = (e) => {
            // Cancel house placement if clicking outside valid cells
            if (this.interactionState.mode === 'house-placement' &&
                !e.target.classList.contains('highlight-house-cell')) {
                this.cancelInteraction();
            }
        };

        document.addEventListener('mousedown', this.eventHandlers.global);
    }

    /**
     * Clean up all event handlers to prevent memory leaks
     */
    cleanupEventHandlers() {
        const board = document.getElementById('lake-board');
        const reedbed = document.getElementById('reedbed');

        if (board && this.eventHandlers.board) {
            board.removeEventListener('click', this.eventHandlers.board);
        }

        if (reedbed && this.eventHandlers.reedbed) {
            reedbed.removeEventListener('click', this.eventHandlers.reedbed);
        }

        if (this.eventHandlers.global) {
            document.removeEventListener('mousedown', this.eventHandlers.global);
        }

        // Clear handler references
        this.eventHandlers = {
            board: null,
            reedbed: null,
            global: null
        };
    }

    /**
     * Handle clicks on board cells (lake board)
     */
    handleBoardCellClick(row, col, event) {
        if (row < 0 || row >= this.boardSize || col < 0 || col >= this.boardSize) {
            console.error('Row and col must be within board bounds');
            return;
        }

        console.log('Board cell clicked:', { row, col, mode: this.interactionState.mode });

        if (this.interactionState.mode === 'house-placement') {
            this.handleBoardHousePlacement(row, col);
        } else if (this.interactionState.mode === 'tile-placement') {
            this.handleBoardTilePlacement(row, col);
        } else {
            console.warn('Board cell clicked but no active placement mode');
        }
    }

    /**
     * Handle house placement on the main board
     */
    handleBoardHousePlacement(row, col) {
        if (!this.interactionState.selectedPlayer) {
            console.error('Player must be selected for house placement');
            return;
        }
        if (this.interactionState.mode !== 'house-placement') {
            console.error('Must be in house placement mode');
            return;
        }

        const tile = this.gameState.board[row][col];
        if (!tile) {
            console.warn('No tile at board position', row, col);
            return;
        }

        // Use anchor system to convert board coordinates to tile coordinates
        const anchor = tile.anchor || { tileRow: 0, tileCol: 0 };
        const tileRow = anchor.tileRow + (row - tile.row);
        const tileCol = anchor.tileCol + (col - tile.col);

        if (this.placeHouse(tile, tileRow, tileCol, this.interactionState.selectedPlayer)) {
            this.completeInteraction();
            this.nextTurn();
        } else {
            console.warn('Cannot place house at', row, col);
        }
    }

    /**
     * Handle tile placement on the main board with snapping
     */
    handleBoardTilePlacement(row, col) {
        if (!this.interactionState.selectedTile) {
            console.error('Tile must be selected for placement');
            return;
        }
        if (this.interactionState.mode !== 'tile-placement') {
            console.error('Must be in tile placement mode');
            return;
        }
        // Use the same snapping logic as preview to find the best placement position
        const bestPosition = this.findBestTilePlacement(row, col);
        if (bestPosition) {
            const placed = this.placeTile(this.interactionState.selectedTile, bestPosition.row, bestPosition.col, bestPosition.anchor.tileRow, bestPosition.anchor.tileCol);
            if (placed) {
                this.completeInteraction();
                this.nextTurn();
            } else {
                console.error('Failed to place tile despite validation');
            }
        } else {
            console.warn('No valid placement found near', row, col);
        }
    }

    /**
     * Handle house placement on reedbed tiles
     */
    handleReedbedHousePlacement(tile, tileRow, tileCol) {
        if (!this.interactionState.selectedPlayer) {
            console.error('Player must be selected for house placement');
            return;
        }
        if (this.interactionState.mode !== 'house-placement') {
            console.error('Must be in house placement mode');
            return;
        }
        if (!tile) {
            console.error('Tile must exist');
            return;
        }

        if (this.placeHouse(tile, tileRow, tileCol, this.interactionState.selectedPlayer)) {
            this.completeInteraction();
            this.nextTurn();
        } else {
            console.warn('Cannot place house on reedbed tile');
        }
    }

    /**
     * Handle tile selection from reedbed
     */
    handleTileSelection(tile) {
        if (!tile) {
            console.error('Tile must exist');
            return;
        }
        if (this.interactionState.mode === 'house-placement') {
            console.error('Cannot select tile during house placement');
            return;
        }

        console.log('Tile selected:', tile.name);
        this.interactionState.selectedTile = { ...tile };
        this.interactionState.mode = 'tile-placement';
        this.interactionState.preview = null;

        this.render();
        this.setupTilePreviewHandling();
    }

    /**
     * Set up tile preview handling for the board with snapping
     */
    setupTilePreviewHandling() {
        const board = document.getElementById('lake-board');
        if (!board) {
            console.error('Lake board must exist');
            return;
        }
        // Remove existing preview handlers
        if (this.tilePreviewHandler) {
            board.removeEventListener('mousemove', this.tilePreviewHandler);
            board.removeEventListener('mouseleave', this.tilePreviewHandler);
            this.tilePreviewHandler = null;
        }
        this.tilePreviewHandler = (e) => {
            if (this.interactionState.mode !== 'tile-placement') return;
            const rect = board.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const cellSize = rect.width / this.boardSize;
            const col = Math.floor(x / cellSize);
            const row = Math.floor(y / cellSize);
            if (row < 0 || row >= this.boardSize || col < 0 || col >= this.boardSize) {
                this.interactionState.preview = null;
                this.renderBoard();
                return;
            }
            if (e.type === 'mousemove') {
                // Try to find the best placement position near the mouse
                const bestPosition = this.findBestTilePlacement(row, col);
                if (bestPosition) {
                    this.interactionState.preview = {
                        row: bestPosition.row,
                        col: bestPosition.col,
                        anchor: bestPosition.anchor,
                        tile: this.interactionState.selectedTile
                    };
                } else {
                    this.interactionState.preview = null;
                }
                this.renderBoard();
            } else if (e.type === 'mouseleave') {
                this.interactionState.preview = null;
                this.renderBoard();
            }
        };
        board.addEventListener('mousemove', this.tilePreviewHandler);
        board.addEventListener('mouseleave', this.tilePreviewHandler);
    }

    /**
     * Find the best placement position for a tile near the given coordinates
     * Clamp anchor cell to the board edge, never offset up/left. Only green cells matter.
     */
    findBestTilePlacement(centerRow, centerCol) {
        if (!this.interactionState.selectedTile) return null;
        const tile = this.interactionState.selectedTile;
        const grid = tile.shape_grid;
        const rows = grid.length;
        const cols = grid[0].length;

        // Try to anchor any green cell at the mouse position, clamped to the board
        let best = null;
        let bestDist = Infinity;
        for (let tr = 0; tr < rows; tr++) {
            for (let tc = 0; tc < cols; tc++) {
                if (grid[tr][tc] !== 1) continue;
                // Clamp anchor so all green cells stay on the board
                let minRow = centerRow, minCol = centerCol;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (grid[r][c] !== 1) continue;
                        const br = centerRow + (r - tr);
                        const bc = centerCol + (c - tc);
                        if (br < 0) minRow = Math.max(minRow, tr - r);
                        if (br >= this.boardSize) minRow = Math.min(minRow, this.boardSize - 1 - (r - tr));
                        if (bc < 0) minCol = Math.max(minCol, tc - c);
                        if (bc >= this.boardSize) minCol = Math.min(minCol, this.boardSize - 1 - (c - tc));
                    }
                }
                // Now try this clamped anchor
                const anchorRow = minRow;
                const anchorCol = minCol;
                if (this.canPlaceTile(tile, anchorRow, anchorCol, tr, tc)) {
                    const dist = Math.abs(anchorRow - centerRow) + Math.abs(anchorCol - centerCol);
                    if (dist < bestDist) {
                        best = { row: anchorRow, col: anchorCol, anchor: { tileRow: tr, tileCol: tc }, tile };
                        bestDist = dist;
                    }
                }
            }
        }
        return best;
    }

    /**
     * Set up keyboard handling for tile rotation and cancellation
     */
    setupKeyboardHandling() {
        // Remove existing keyboard handler
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
        }

        this.keyboardHandler = (e) => {
            // Only allow if current player is human
            if (this.botPlayers[this.gameState.currentPlayer]) return;
            // --- Rotation hotkeys ---
            if (e.key === 'q' || e.key === 'Q') {
                this.rotateSelectedTile(-1);
                return;
            } else if (e.key === 'e' || e.key === 'E') {
                this.rotateSelectedTile(1);
                return;
            } else if (e.key === 'Escape') {
                this.cancelInteraction();
                return;
            }

            // --- Place House hotkey (W) ---
            if ((e.key === 'w' || e.key === 'W') && this.interactionState.mode !== 'house-placement') {
                // Only allow if current player has houses left
                const player = this.gameState.currentPlayer;
                const housesLeft = this.gameState.players[player].houses;
                if (housesLeft > 0) {
                    this.enterHousePlacementMode(player);
                }
                return;
            }

            // --- Reedbed tile selection hotkeys (1-9) ---
            if (this.interactionState.mode !== 'house-placement') {
                const keyNum = parseInt(e.key, 10);
                if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
                    const idx = keyNum - 1;
                    const reedbed = this.gameState.reedbed;
                    if (reedbed && idx < reedbed.length) {
                        const tile = reedbed[idx];
                        this.handleTileSelection(tile);
                    }
                }
            }
        };

        document.addEventListener('keydown', this.keyboardHandler);
    }

    /**
     * Rotate the currently selected tile
     */
    rotateSelectedTile(direction) {
        if (!this.interactionState.selectedTile) return;

        // Store current preview position to maintain it after rotation
        const currentPreview = this.interactionState.preview;

        // Rotate the selected tile
        const rotated = this.rotateTile(this.interactionState.selectedTile, direction);
        this.interactionState.selectedTile = rotated;

        // Also rotate the corresponding tile in the reedbed (if it exists)
        const reedbedTile = this.gameState.reedbed.find(t => t.id === rotated.id);
        if (reedbedTile) {
            // Defensive: assert shape_grid and rotation are in sync
            if (!reedbedTile.shape_grid || typeof reedbedTile.rotation !== 'number') {
                throw new Error('Reedbed tile must have shape_grid and rotation');
            }
            reedbedTile.shape_grid = rotated.shape_grid.map(row => [...row]);
            reedbedTile.houses = rotated.houses.map(row => [...row]);
            reedbedTile.rotation = rotated.rotation;
        }

        // Recalculate preview at the same position if it existed
        if (currentPreview) {
            const bestPosition = this.findBestTilePlacement(currentPreview.row, currentPreview.col);
            if (bestPosition) {
                this.interactionState.preview = {
                    row: bestPosition.row,
                    col: bestPosition.col,
                    anchor: bestPosition.anchor,
                    tile: this.interactionState.selectedTile
                };
            } else {
                this.interactionState.preview = null;
            }
        }

        this.render();
    }

    /**
     * Start house placement mode for a player
     */
    enterHousePlacementMode(player) {
        if (player !== 'red' && player !== 'blue') {
            console.error('Player must be red or blue');
            return;
        }
        if (this.gameState.players[player].houses <= 0) {
            console.error('Player must have houses available');
            return;
        }
        if (this.gameState.currentPlayer !== player) {
            console.error('Must be player\'s turn');
            return;
        }

        this.interactionState.mode = 'house-placement';
        this.interactionState.selectedPlayer = player;
        this.interactionState.selectedTile = null;
        this.interactionState.preview = null;

        this.render();
        this.highlightValidHouseCells(player);
    }

    /**
     * Highlight all valid cells for house placement
     */
    highlightValidHouseCells(player) {
        // Clear existing highlights
        document.querySelectorAll('.highlight-house-cell').forEach(el =>
            el.classList.remove('highlight-house-cell')
        );

        // Highlight board cells
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const tile = this.gameState.board[row][col];
                if (tile) {
                    // Use anchor system to convert board coordinates to tile coordinates
                    const anchor = tile.anchor || { tileRow: 0, tileCol: 0 };
                    const tileRow = anchor.tileRow + (row - tile.row);
                    const tileCol = anchor.tileCol + (col - tile.col);

                    // Check bounds and validity
                    if (tileRow >= 0 && tileRow < tile.shape_grid.length &&
                        tileCol >= 0 && tileCol < tile.shape_grid[0].length &&
                        tile.shape_grid[tileRow][tileCol] === 1 &&
                        tile.houses[tileRow][tileCol] === null) {
                        const idx = row * this.boardSize + col;
                        const cell = document.getElementsByClassName('lake-cell')[idx];
                        if (cell) cell.classList.add('highlight-house-cell');
                    }
                }
            }
        }

        // Highlight reedbed cells
        const reedbed = document.getElementById('reedbed');
        if (reedbed) {
            const tilePreviews = reedbed.getElementsByClassName('tile-preview');
            for (let t = 0; t < this.gameState.reedbed.length; t++) {
                const tile = this.gameState.reedbed[t];
                const grid = tile.shape_grid;
                for (let r = 0; r < grid.length; r++) {
                    for (let c = 0; c < grid[r].length; c++) {
                        if (grid[r][c] === 1 && tile.houses[r][c] === null) {
                            const tileGrid = tilePreviews[t].getElementsByClassName('tile-grid')[0];
                            const cellIdx = r * 3 + c;
                            const cell = tileGrid.children[cellIdx];
                            if (cell) cell.classList.add('highlight-house-cell');
                        }
                    }
                }
            }
        }
    }

    /**
     * Complete the current interaction and reset state
     */
    completeInteraction() {
        this.interactionState = {
            mode: null,
            selectedTile: null,
            selectedPlayer: null,
            preview: null,
            hoveredTileId: null
        };

        // Clear highlights
        document.querySelectorAll('.highlight-house-cell').forEach(el =>
            el.classList.remove('highlight-house-cell')
        );

        // Clear house previews
        this.clearHousePreviewOnBoard();
        this.clearHousePreviewOnReedbed();

        this.render();
    }

    /**
     * Show house preview on lake board cell
     */
    showHousePreviewOnBoard(row, col) {
        if (this.interactionState.mode !== 'house-placement' || !this.interactionState.selectedPlayer) {
            return;
        }

        const tile = this.gameState.board[row][col];
        if (!tile) return;

        // Use anchor system to convert board coordinates to tile coordinates
        const anchor = tile.anchor || { tileRow: 0, tileCol: 0 };
        const tileRow = anchor.tileRow + (row - tile.row);
        const tileCol = anchor.tileCol + (col - tile.col);

        // Check if this is a valid house placement location
        if (tileRow >= 0 && tileRow < tile.shape_grid.length &&
            tileCol >= 0 && tileCol < tile.shape_grid[0].length &&
            tile.shape_grid[tileRow][tileCol] === 1 &&
            tile.houses[tileRow][tileCol] === null) {

            const idx = row * this.boardSize + col;
            const cell = document.getElementsByClassName('lake-cell')[idx];
            if (cell) {
                // Clear any existing preview
                this.clearHousePreviewOnBoard();

                // Create preview house element
                const previewHouse = document.createElement('div');
                previewHouse.className = `house ${this.interactionState.selectedPlayer} preview`;
                previewHouse.textContent = this.interactionState.selectedPlayer === 'red' ? '🏠' : '🏘️';
                previewHouse.style.position = 'absolute';
                previewHouse.style.top = '50%';
                previewHouse.style.left = '50%';
                previewHouse.style.transform = 'translate(-50%, -50%)';
                previewHouse.style.fontSize = '1.5em';
                previewHouse.style.zIndex = '10';
                previewHouse.style.opacity = '0.7';
                previewHouse.style.filter = 'brightness(1.2)';
                previewHouse.style.pointerEvents = 'none';

                cell.style.position = 'relative';
                cell.appendChild(previewHouse);
            }
        }
    }

    /**
     * Clear house preview on lake board
     */
    clearHousePreviewOnBoard() {
        document.querySelectorAll('.lake-cell .house.preview').forEach(preview => {
            preview.remove();
        });
    }

    /**
     * Show house preview on reedbed cell
     */
    showHousePreviewOnReedbed(tile, tileRow, tileCol) {
        if (this.interactionState.mode !== 'house-placement' || !this.interactionState.selectedPlayer) {
            return;
        }

        // Check if this is a valid house placement location
        if (tileRow >= 0 && tileRow < tile.shape_grid.length &&
            tileCol >= 0 && tileCol < tile.shape_grid[0].length &&
            tile.shape_grid[tileRow][tileCol] === 1 &&
            tile.houses[tileRow][tileCol] === null) {

            const reedbed = document.getElementById('reedbed');
            const tileElement = reedbed.querySelector(`[data-tile-id="${tile.id}"]`);
            if (tileElement) {
                const tileGrid = tileElement.querySelector('.tile-grid');
                const cellIdx = tileRow * 3 + tileCol;
                const cell = tileGrid.children[cellIdx];

                if (cell) {
                    // Clear any existing preview
                    this.clearHousePreviewOnReedbed();

                    // Create preview house element
                    const previewHouse = document.createElement('div');
                    previewHouse.className = `house ${this.interactionState.selectedPlayer} preview`;
                    previewHouse.textContent = this.interactionState.selectedPlayer === 'red' ? '🏠' : '🏘️';
                    previewHouse.style.width = '60%';
                    previewHouse.style.height = '60%';
                    previewHouse.style.fontSize = '0.6em';
                    previewHouse.style.opacity = '0.7';
                    previewHouse.style.filter = 'brightness(1.2)';
                    previewHouse.style.pointerEvents = 'none';

                    cell.appendChild(previewHouse);
                }
            }
        }
    }

    /**
     * Clear house preview on reedbed
     */
    clearHousePreviewOnReedbed() {
        document.querySelectorAll('.tile-cell .house.preview').forEach(preview => {
            preview.remove();
        });
    }

    /**
     * Cancel the current interaction and reset state
     */
    cancelInteraction() {
        this.completeInteraction();
    }

    // ===== BOT MANAGEMENT METHODS =====

    /**
 * Set a bot player for the specified color
 */
    setPlayerBot(player, botType, config = {}) {
        if (player !== 'red' && player !== 'blue') {
            console.error('Player must be red or blue');
            return;
        }

        // This will be set up after the bot system is loaded
        this.pendingBotConfig = this.pendingBotConfig || {};
        this.pendingBotConfig[player] = { botType, config };
        console.log(`Queued ${player} player to ${botType} bot`);
    }

    /**
 * Initialize bot system after it's loaded
 */
    initializeBotSystem() {
        if (!this.pendingBotConfig || typeof this.pendingBotConfig !== 'object' || Object.keys(this.pendingBotConfig).length === 0) return;

        console.log('Initializing bot system with config:', this.pendingBotConfig);

        // Import bot system
        import('./uros-bots.js').then(module => {
            console.log('Bot system loaded successfully:', module);

            for (const [player, config] of Object.entries(this.pendingBotConfig)) {
                const finalConfig = {
                    ...config.config,
                    thinkingTime: this.botThinkingTime, // Use the UI slider value
                    randomSeed: this.randomSeed,
                    useRandomSeed: this.useRandomSeed
                };
                this.botPlayers[player] = module.createUrosPlayer(config.botType, this, player, finalConfig);
                console.log(`Set ${player} player to ${config.botType} bot with thinking time ${this.botThinkingTime}ms`);
            }

            this.pendingBotConfig = null;
            this.updateGameMode();
            this.render();

            // Start bot turn if current player is a bot (after initialization is complete)
            if (this.isCurrentPlayerBot() && !this.gameState.gameOver) {
                console.log('Starting bot turn after initialization');
                setTimeout(() => this.executeBotTurn(), this.botMoveDelay);
            }
        }).catch(error => {
            console.error('Failed to load bot system:', error);
            console.error('Error details:', error.message, error.stack);
        });
    }

    /**
     * Update game mode based on current bot configuration
     */
    updateGameMode() {
        const redIsBot = this.botPlayers.red !== null;
        const blueIsBot = this.botPlayers.blue !== null;

        if (redIsBot && blueIsBot) {
            this.gameMode = 'bot-vs-bot';
        } else if (redIsBot || blueIsBot) {
            this.gameMode = 'human-vs-bot';
        } else {
            this.gameMode = 'human-vs-human';
        }

        console.log(`Game mode updated to: ${this.gameMode}`);
    }

    /**
     * Check if current player is a bot
     */
    isCurrentPlayerBot() {
        const currentPlayer = this.gameState.currentPlayer;
        const isBot = this.botPlayers[currentPlayer] !== null;
        console.log(`isCurrentPlayerBot: ${currentPlayer} -> ${isBot} (bot: ${this.botPlayers[currentPlayer]})`);
        return isBot;
    }

    /**
     * Get all valid moves for the current player (for bot use)
     */
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
                                tile: tile,
                                tileRow: r,
                                tileCol: c,
                                player: currentPlayer
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
                                    tile: tile,
                                    tileRow: r,
                                    tileCol: c,
                                    player: currentPlayer
                                });
                            }
                        }
                    }
                }
            }
        }
        return moves;
    }

    /**
     * Get current game state for bot evaluation
     */
    getGameState() {
        return {
            board: this.gameState.board.map(row => row.map(cell => cell)),
            placedTiles: this.gameState.placedTiles.map(tile => ({
                ...tile,
                houses: tile.houses.map(row => [...row])
            })),
            reedbed: this.gameState.reedbed.map(tile => ({
                ...tile,
                houses: tile.houses.map(row => [...row])
            })),
            players: {
                red: { ...this.gameState.players.red },
                blue: { ...this.gameState.players.blue }
            },
            currentPlayer: this.gameState.currentPlayer,
            isFirstTurn: this.gameState.isFirstTurn,
            placementsThisTurn: this.gameState.placementsThisTurn,
            placementsRequired: this.gameState.placementsRequired,
            gameOver: this.gameState.gameOver,
            gameOverWinner: this.gameState.gameOverWinner,
            gameOverRedLargest: this.gameState.gameOverRedLargest,
            gameOverBlueLargest: this.gameState.gameOverBlueLargest
        };
    }

    /**
     * Execute a bot move
     */
    makeBotMove(move) {
        if (move.type === 'tile-placement') {
            return this.placeTile(move.tile, move.row, move.col, move.anchorTileRow, move.anchorTileCol);
        } else if (move.type === 'house-placement') {
            return this.placeHouse(move.tile, move.tileRow, move.tileCol, move.player);
        }
        return false;
    }

    /**
 * Execute bot turn with delay for better UX
 */
    executeBotTurn() {
        console.log('executeBotTurn called');
        console.log('isCurrentPlayerBot():', this.isCurrentPlayerBot());
        console.log('gameState.gameOver:', this.gameState.gameOver);
        console.log('currentPlayer:', this.gameState.currentPlayer);
        console.log('botPlayers:', this.botPlayers);

        // Check if game is over or current player is not a bot
        if (!this.isCurrentPlayerBot() || this.gameState.gameOver) {
            console.log('executeBotTurn: early return - not a bot or game over');
            return;
        }

        const currentPlayer = this.gameState.currentPlayer;
        const bot = this.botPlayers[currentPlayer];

        if (!bot) {
            console.error('Bot not found for current player');
            return;
        }

        // Show thinking indicator
        this.showBotThinking(currentPlayer);

        // Execute bot move after the bot's thinking time
        const thinkingTime = bot.thinkingTime || this.botThinkingTime;
        setTimeout(() => {
            try {
                // Double-check game state before making move
                if (this.gameState.gameOver) {
                    console.log('Game is over, stopping bot execution');
                    return;
                }

                const move = bot.chooseMove();
                if (move) {
                    console.log(`${currentPlayer} bot chose move:`, move);
                    const success = this.makeBotMove(move);
                    if (success) {
                        this.completeInteraction();

                        // Add delay before continuing to next action (use thinkingTime, not hardcoded)
                        setTimeout(() => {
                            this.nextTurn();
                        }, thinkingTime); // Use bot's thinking time for all delays
                    } else {
                        console.error('Bot move failed');
                        this.hideBotThinking();
                    }
                } else {
                    // Bot returned null move - this is normal when no valid moves exist
                    console.log(`${currentPlayer} bot has no valid moves available`);
                    // Switch to next player and check if game should end
                    this.nextTurn();
                }
            } catch (error) {
                console.error('Bot move execution failed:', error);
                this.hideBotThinking();
            }
        }, thinkingTime);
    }

    /**
     * Show bot thinking indicator
     */
    showBotThinking(player) {
        const status = document.getElementById('game-status');
        if (status) {
            const playerName = player === 'red' ? '🔴 Red' : '🔵 Blue';
            const botType = this.getBotTypeName(this.botPlayers[player]);
            status.textContent = `${playerName} ${botType} bot is thinking...`;

            // Add visual indicator
            status.style.fontStyle = 'italic';
            status.style.opacity = '0.8';
        }
    }

    /**
     * Hide bot thinking indicator
     */
    hideBotThinking() {
        const status = document.getElementById('game-status');
        if (status) {
            // Remove visual indicators
            status.style.fontStyle = 'normal';
            status.style.opacity = '1';
        }
        // Status will be updated by updateStatus() call
    }

    /**
     * Override nextTurn to handle bot turns
     */
    nextTurn() {
        // Call original nextTurn logic
        this.gameState.placementsThisTurn = (this.gameState.placementsThisTurn || 0) + 1;
        if (this.gameState.isFirstTurn) {
            // First turn: only 1 placement
            if (this.gameState.placementsThisTurn >= 1) {
                this.gameState.isFirstTurn = false;
                this.gameState.currentPlayer = 'blue';
                this.gameState.placementsThisTurn = 0;
                this.gameState.placementsRequired = 2;
            }
        } else {
            // All subsequent turns: 2 placements per turn
            if (this.gameState.placementsThisTurn >= 2) {
                this.gameState.currentPlayer = this.gameState.currentPlayer === 'red' ? 'blue' : 'red';
                this.gameState.placementsThisTurn = 0;
                this.gameState.placementsRequired = 2;
            }
        }

        this.updateStatus();
        if (this.checkGameOver()) {
            return;
        }
        this.render();

        // Check if current player is a bot and execute bot turn with delay
        if (this.isCurrentPlayerBot() && !this.gameState.gameOver) {
            // Always use the bot's thinking time for delay between turns
            const currentBot = this.botPlayers[this.gameState.currentPlayer];
            const thinkingTime = currentBot ? (currentBot.thinkingTime || this.botThinkingTime) : this.botThinkingTime;
            setTimeout(() => this.executeBotTurn(), thinkingTime);
        }
    }

    /**
     * Override startNewGame to set up default bot configuration
     */
    startNewGame() {
        console.log('Starting new game');

        this.gameState = {
            board: Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null)),
            placedTiles: [], // tiles placed on the board
            reedbed: this.tiles.map(tile => ({
                ...tile,
                houses: Array(tile.shape_grid.length).fill(null).map(() => Array(tile.shape_grid[0].length).fill(null))
            })), // available tiles with house tracking
            players: {
                red: { houses: this.housesPerPlayer, color: 'red' },
                blue: { houses: this.housesPerPlayer, color: 'blue' }
            },
            currentPlayer: 'red',
            isFirstTurn: true,
            placementsThisTurn: 0,
            placementsRequired: 1, // 1 for first turn, 2 for all others
            gameOver: false,
            gameOverWinner: null,
            gameOverRedLargest: null,
            gameOverBlueLargest: null
        };

        // Reset interaction state
        this.interactionState = {
            mode: null,
            selectedTile: null,
            selectedPlayer: null,
            preview: null,
            hoveredTileId: null
        };

        // Only set up default bots if no bots are configured yet AND no pending config
        if (!this.botPlayers.red && !this.botPlayers.blue && !this.pendingBotConfig) {
            this.setupDefaultBots();
            // Initialize bot system only for default bots
            this.initializeBotSystem();
        }

        this.updateStatus();
        this.render();

        // Start bot turn if current player is a bot
        if (this.isCurrentPlayerBot() && !this.gameState.gameOver) {
            console.log('Starting bot turn for current player');
            const currentBot = this.botPlayers[this.gameState.currentPlayer];
            const thinkingTime = currentBot ? (currentBot.thinkingTime || this.botThinkingTime) : this.botThinkingTime;
            setTimeout(() => this.executeBotTurn(), thinkingTime);
        }
    }

    /**
     * Initialize random seed system
     */
    initializeRandomSeed() {
        if (this.useRandomSeed && this.randomSeed !== null) {
            // Use a simple seeded random number generator
            this.seedGenerator = this.createSeededRandom(this.randomSeed);
            console.log(`Using seeded random generator with seed: ${this.randomSeed}`);
        } else {
            this.seedGenerator = null;
            console.log('Using system random generator');
        }
    }

    /**
     * Create a seeded random number generator
     */
    createSeededRandom(seed) {
        let state = seed;
        return function () {
            state = (state * 9301 + 49297) % 233280;
            return state / 233280;
        };
    }

    /**
     * Get a random number (either seeded or system)
     */
    getRandom() {
        if (this.seedGenerator) {
            return this.seedGenerator();
        }
        return Math.random();
    }

    /**
     * Set up default bot configuration
     */
    setupDefaultBots() {
        // Default to deterministic vs deterministic for testing
        this.pendingBotConfig = {
            red: { botType: 'deterministic', config: {} },
            blue: { botType: 'deterministic', config: {} }
        };
    }

    /**
     * Get bot type name for display
     */
    getBotTypeName(bot) {
        if (!bot) return '';

        const botTypeMap = {
            'UrosDeterministicPlayer': 'Deterministic',
            'UrosRandomPlayer': 'Random',
            'UrosMinimaxPlayer': 'Minimax',
            'UrosMCTSPlayer': 'MCTS'
        };

        return botTypeMap[bot.constructor.name] || 'Bot';
    }
}

