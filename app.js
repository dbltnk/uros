// Uros Board Game Implementation
// Combines game logic with existing logging system

class UrosGame {
    constructor() {
        this.boardSize = 6;
        this.housesPerPlayer = 15;
        this.tiles = [];
        this.gameState = null;
        this.selectedTile = null;
        this.selectedHouse = null;
        this.placementMode = null; // 'tile' or 'house'

        this.init();
    }

    init() {
        console.log('Initializing Uros game');
        this.loadTiles();
        this.setupEventListeners();
    }

    loadTiles() {
        // Load tiles from JSON file
        fetch('tiles.json')
            .then(response => response.json())
            .then(data => {
                this.tiles = data.tiles.map((tile, index) => ({
                    ...tile,
                    id: index,
                    rotation: 0
                }));
                console.log(`Loaded ${this.tiles.length} tiles`);
                this.startNewGame(); // Only start game after tiles are loaded
            })
            .catch(error => {
                console.error('Failed to load tiles:', error);
                // Fallback to hardcoded tiles if JSON fails
                this.createFallbackTiles();
                this.startNewGame();
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
    }

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
            gameOver: false
        };

        this.selectedTile = null;
        this.selectedHouse = null;
        this.placementMode = null;

        this.updateStatus();
        this.render();
    }

    rotateTile(tile, direction = 1) {
        if (!tile) return tile;

        const rotated = { ...tile };
        rotated.rotation = (rotated.rotation + direction) % 4;

        // Rotate the shape grid
        const grid = rotated.shape_grid;
        const rows = grid.length;
        const cols = grid[0].length;

        for (let i = 0; i < direction; i++) {
            const newGrid = Array(cols).fill(null).map(() => Array(rows).fill(0));
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    newGrid[c][rows - 1 - r] = grid[r][c];
                }
            }
            rotated.shape_grid = newGrid;
        }

        return rotated;
    }

    canPlaceTile(tile, row, col) {
        if (!tile) return false;

        const grid = tile.shape_grid;
        const rows = grid.length;
        const cols = grid[0].length;

        // Check if tile fits within board bounds
        if (row < 0 || col < 0 || row + rows > this.boardSize || col + cols > this.boardSize) {
            return false;
        }

        // Check if all squares are unoccupied
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === 1) {
                    if (this.gameState.board[row + r][col + c] !== null) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    placeTile(tile, row, col) {
        if (!this.canPlaceTile(tile, row, col)) {
            console.warn('Cannot place tile at', row, col);
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
            houses: tile.houses ? [...tile.houses.map(row => [...row])] : Array(rows).fill(null).map(() => Array(cols).fill(null))
        };

        this.gameState.placedTiles.push(placedTile);

        // Mark board squares as occupied
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === 1) {
                    this.gameState.board[row + r][col + c] = placedTile;
                }
            }
        }

        // Remove from reedbed
        const reedbedIndex = this.gameState.reedbed.findIndex(t => t.id === tile.id);
        if (reedbedIndex !== -1) {
            this.gameState.reedbed.splice(reedbedIndex, 1);
        }

        console.log(`Placed tile ${tile.name} at (${row}, ${col})`);
        return true;
    }

    canPlaceHouse(tile, tileRow, tileCol, player) {
        if (!tile || this.gameState.players[player].houses <= 0) return false;

        // Check if the tile square is empty
        return tile.houses[tileRow][tileCol] === null;
    }

    placeHouse(tile, tileRow, tileCol, player) {
        if (!this.canPlaceHouse(tile, tileRow, tileCol, player)) {
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

        // Find all villages for each player on placed tiles
        for (const tile of this.gameState.placedTiles) {
            for (let r = 0; r < tile.houses.length; r++) {
                for (let c = 0; c < tile.houses[r].length; c++) {
                    const player = tile.houses[r][c];
                    if (player && !visited.has(`placed-${tile.id}-${r}-${c}`)) {
                        const village = this.floodFill(tile, r, c, player, visited, true);
                        if (village.length > 0) {
                            villages[player].push(village);
                        }
                    }
                }
            }
        }

        // Find all villages for each player on reedbed tiles
        for (const tile of this.gameState.reedbed) {
            for (let r = 0; r < tile.houses.length; r++) {
                for (let c = 0; c < tile.houses[r].length; c++) {
                    const player = tile.houses[r][c];
                    if (player && !visited.has(`reedbed-${tile.id}-${r}-${c}`)) {
                        const village = this.floodFill(tile, r, c, player, visited, false);
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

            if (tile.houses[row][col] === player) {
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
                        tile.houses[neighbor.row][neighbor.col] === player) {
                        queue.push({ tile, row: neighbor.row, col: neighbor.col });
                    }
                }

                // Only check adjacent tiles if this is a placed tile
                if (isPlacedTile) {
                    // Check orthogonal neighbors on adjacent tiles
                    const boardRow = tile.row + row;
                    const boardCol = tile.col + col;
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
                                // Find the relative position in the adjacent tile
                                const adjTileRow = pos.row - adjacentTile.row;
                                const adjTileCol = pos.col - adjacentTile.col;

                                if (adjTileRow >= 0 && adjTileRow < adjacentTile.houses.length &&
                                    adjTileCol >= 0 && adjTileCol < adjacentTile.houses[0].length &&
                                    adjacentTile.houses[adjTileRow][adjTileCol] === player) {
                                    const adjKey = `placed-${adjacentTile.id}-${adjTileRow}-${adjTileCol}`;
                                    if (!visited.has(adjKey)) {
                                        queue.push({ tile: adjacentTile, row: adjTileRow, col: adjTileCol });
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

        if (!hasHouses && !hasPlaceableTiles) {
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

        this.showGameOverModal(winner, redLargest, blueLargest);
    }

    showGameOverModal(winner, redLargest, blueLargest) {
        const modal = document.getElementById('game-over-modal');
        const title = document.getElementById('game-over-title');
        const result = document.getElementById('game-over-result');

        if (winner) {
            title.textContent = `🏆 ${winner.toUpperCase()} Wins!`;
            result.innerHTML = `
                <div class="mb-4">
                    <div class="text-red-500">🔴 Red: ${redLargest.size} houses on ${redLargest.islands} islands</div>
                    <div class="text-blue-500">🔵 Blue: ${blueLargest.size} houses on ${blueLargest.islands} islands</div>
                </div>
                <div class="text-lg font-semibold text-${winner === 'red' ? 'red' : 'blue'}-600">
                    ${winner === 'red' ? '🔴 Red' : '🔵 Blue'} has the largest village!
                </div>
            `;
        } else {
            title.textContent = "🤝 It's a Tie!";
            result.innerHTML = `
                <div class="mb-4">
                    <div class="text-red-500">🔴 Red: ${redLargest.size} houses on ${redLargest.islands} islands</div>
                    <div class="text-blue-500">🔵 Blue: ${blueLargest.size} houses on ${blueLargest.islands} islands</div>
                </div>
                <div class="text-lg font-semibold text-gray-600">Both players have equal villages!</div>
            `;
        }

        modal.classList.remove('hidden');
    }

    nextTurn() {
        // Increment placements this turn
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
    }

    updateStatus() {
        const status = document.getElementById('game-status');
        const redHouses = document.getElementById('red-houses-left');
        const blueHouses = document.getElementById('blue-houses-left');
        const scores = document.getElementById('village-scores');

        const currentPlayer = this.gameState.currentPlayer;
        const placementsLeft = (this.gameState.placementsRequired || 2) - (this.gameState.placementsThisTurn || 0);
        const playerName = currentPlayer === 'red' ? '🔴 Red' : '🔵 Blue';

        status.textContent = `${playerName}'s turn (${placementsLeft} placement${placementsLeft > 1 ? 's' : ''} left)`;
        redHouses.textContent = this.gameState.players.red.houses;
        blueHouses.textContent = this.gameState.players.blue.houses;

        // Calculate current village sizes
        const villages = this.calculateVillages();
        const redLargest = this.getLargestVillage(villages.red);
        const blueLargest = this.getLargestVillage(villages.blue);

        scores.innerHTML = `
            <span class="text-red-500">Red: ${redLargest.size}</span> | 
            <span class="text-blue-500">Blue: ${blueLargest.size}</span>
        `;
    }

    render() {
        this.renderBoard();
        this.renderReedbed();
        this.renderHousePools();
    }

    renderBoard() {
        const board = document.getElementById('lake-board');
        board.innerHTML = '';

        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const cell = document.createElement('div');
                cell.className = 'lake-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;

                const tile = this.gameState.board[row][col];
                if (tile) {
                    // Find the relative position within the tile
                    const tileRow = row - tile.row;
                    const tileCol = col - tile.col;
                    const house = tile.houses[tileRow][tileCol];

                    if (house) {
                        const houseElement = document.createElement('div');
                        houseElement.className = `house ${house}`;
                        houseElement.textContent = house === 'red' ? '🏠' : '🏘️';
                        cell.appendChild(houseElement);
                    } else {
                        // Empty tile cell - can be clicked to place houses
                        cell.addEventListener('click', () => this.handleTileClick(tile, tileRow, tileCol));
                        cell.style.cursor = 'pointer';
                        cell.style.border = '2px dashed #ffffff';
                    }
                } else {
                    // Empty cell - can be clicked to place tiles
                    cell.addEventListener('click', () => this.handleBoardClick(row, col));
                    cell.style.cursor = 'pointer';
                }

                board.appendChild(cell);
            }
        }
    }

    renderReedbed() {
        const reedbed = document.getElementById('reedbed');
        reedbed.innerHTML = '';

        for (const tile of this.gameState.reedbed) {
            const tileElement = document.createElement('div');
            tileElement.className = 'tile-preview';
            tileElement.dataset.tileId = tile.id;

            if (this.selectedTile && this.selectedTile.id === tile.id) {
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
                        // Make tile cells clickable for house placement
                        cell.style.cursor = 'pointer';
                        cell.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.handleReedbedTileClick(tile, row, col);
                        });
                        // Show houses if any
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
            tileElement.addEventListener('click', () => this.selectTile(tile));
            reedbed.appendChild(tileElement);
        }
    }

    renderHousePools() {
        // Show/hide and style the Place House buttons
        const redBtn = document.getElementById('red-place-house-btn');
        const blueBtn = document.getElementById('blue-place-house-btn');
        const current = this.gameState.currentPlayer;
        const redHouses = this.gameState.players.red.houses;
        const blueHouses = this.gameState.players.blue.houses;

        // Hide both by default
        redBtn.classList.add('hidden');
        blueBtn.classList.add('hidden');
        redBtn.classList.remove('place-house-active');
        blueBtn.classList.remove('place-house-active');

        if (current === 'red' && redHouses > 0) {
            redBtn.classList.remove('hidden');
            if (this.placementMode === 'house') redBtn.classList.add('place-house-active');
        }
        if (current === 'blue' && blueHouses > 0) {
            blueBtn.classList.remove('hidden');
            if (this.placementMode === 'house') blueBtn.classList.add('place-house-active');
        }
    }

    selectTile(tile) {
        console.log('Selected tile:', tile.name);
        this.selectedTile = { ...tile };
        this.selectedHouse = null;
        this.placementMode = 'tile';

        // Update visual selection
        document.querySelectorAll('.tile-preview').forEach(el => el.classList.remove('selected'));
        document.querySelector(`[data-tile-id="${tile.id}"]`).classList.add('selected');

        this.render();
    }

    selectHouse(player, index) {
        if (this.gameState.currentPlayer !== player) {
            console.warn('Not your turn');
            return;
        }

        console.log('Selected house for', player);
        this.selectedHouse = { player, index };
        this.selectedTile = null;
        this.placementMode = 'house';

        this.render();
    }

    handleBoardClick(row, col) {
        if (this.placementMode === 'house' && this.selectedHouse) {
            const tile = this.gameState.board[row][col];
            if (tile) {
                const tileRow = row - tile.row;
                const tileCol = col - tile.col;
                if (this.placeHouse(tile, tileRow, tileCol, this.selectedHouse.player)) {
                    this.selectedHouse = null;
                    this.placementMode = null;
                    this.clearHouseHighlights();
                    this.nextTurn();
                }
            }
        } else if (this.placementMode === 'tile' && this.selectedTile) {
            if (this.placeTile(this.selectedTile, row, col)) {
                this.selectedTile = null;
                this.placementMode = null;
                this.nextTurn();
            }
        }
    }

    handleTileClick(tile, tileRow, tileCol) {
        if (this.placementMode === 'house' && this.selectedHouse) {
            if (this.placeHouse(tile, tileRow, tileCol, this.selectedHouse.player)) {
                this.selectedHouse = null;
                this.placementMode = null;
                this.clearHouseHighlights();
                this.nextTurn();
            }
        }
    }

    handleReedbedTileClick(tile, tileRow, tileCol) {
        if (this.placementMode === 'house' && this.selectedHouse) {
            if (this.placeHouseOnReedbed(tile, tileRow, tileCol, this.selectedHouse.player)) {
                this.selectedHouse = null;
                this.placementMode = null;
                this.clearHouseHighlights();
                this.nextTurn();
            }
        }
    }

    placeHouseOnReedbed(tile, tileRow, tileCol, player) {
        if (!tile || this.gameState.players[player].houses <= 0) return false;

        // Check if the tile square is empty
        if (tile.houses[tileRow][tileCol] !== null) return false;

        tile.houses[tileRow][tileCol] = player;
        this.gameState.players[player].houses--;

        console.log(`${player} placed house on reedbed tile at (${tileRow}, ${tileCol})`);
        return true;
    }

    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'q' || e.key === 'Q') {
                if (this.selectedTile) {
                    this.selectedTile = this.rotateTile(this.selectedTile, 1);
                    this.render();
                }
            } else if (e.key === 'e' || e.key === 'E') {
                if (this.selectedTile) {
                    this.selectedTile = this.rotateTile(this.selectedTile, 3);
                    this.render();
                }
            } else if (e.key === 'Escape') {
                this.selectedTile = null;
                this.selectedHouse = null;
                this.placementMode = null;
                this.clearHouseHighlights();
                this.render();
            }
        });

        // Place House button listeners
        document.getElementById('red-place-house-btn').addEventListener('click', () => {
            if (this.gameState.currentPlayer === 'red' && this.gameState.players.red.houses > 0) {
                this.enterHousePlacementMode('red');
            }
        });
        document.getElementById('blue-place-house-btn').addEventListener('click', () => {
            if (this.gameState.currentPlayer === 'blue' && this.gameState.players.blue.houses > 0) {
                this.enterHousePlacementMode('blue');
            }
        });

        // New game button
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.startNewGame();
        });
        // Play again button
        document.getElementById('play-again-btn').addEventListener('click', () => {
            document.getElementById('game-over-modal').classList.add('hidden');
            this.startNewGame();
        });
    }

    enterHousePlacementMode(player) {
        this.selectedHouse = { player };
        this.selectedTile = null;
        this.placementMode = 'house';
        this.render();
        this.highlightAllValidHouseCells(player);
        // Add global click listener
        this.housePlacementGlobalClick = (e) => {
            if (!e.target.classList.contains('highlight-house-cell')) {
                this.selectedHouse = null;
                this.placementMode = null;
                this.clearHouseHighlights();
                this.render();
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', this.housePlacementGlobalClick);
        }, 0);
    }

    highlightAllValidHouseCells(player) {
        // Lake board
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const tile = this.gameState.board[row][col];
                if (tile) {
                    const tileRow = row - tile.row;
                    const tileCol = col - tile.col;
                    if (tile.shape_grid[tileRow][tileCol] === 1 && tile.houses[tileRow][tileCol] === null) {
                        const idx = row * this.boardSize + col;
                        const cell = document.getElementsByClassName('lake-cell')[idx];
                        if (cell) cell.classList.add('highlight-house-cell');
                    }
                }
            }
        }
        // Reedbed
        const reedbed = document.getElementById('reedbed');
        if (reedbed) {
            const tilePreviews = reedbed.getElementsByClassName('tile-preview');
            for (let t = 0; t < this.gameState.reedbed.length; t++) {
                const tile = this.gameState.reedbed[t];
                const grid = tile.shape_grid;
                for (let r = 0; r < grid.length; r++) {
                    for (let c = 0; c < grid[r].length; c++) {
                        if (grid[r][c] === 1 && tile.houses[r][c] === null) {
                            // Find the tile-grid and cell
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

    clearHouseHighlights() {
        document.querySelectorAll('.highlight-house-cell').forEach(el => el.classList.remove('highlight-house-cell'));
        // Remove global click listener if present
        if (this.housePlacementGlobalClick) {
            document.removeEventListener('mousedown', this.housePlacementGlobalClick);
            this.housePlacementGlobalClick = null;
        }
    }
}

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
            '#red-house-pool',
            '#blue-house-pool',
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

    getDataAttributes(element) {
        const data = {};
        for (let attr of element.attributes) {
            if (attr.name.startsWith('data-')) {
                data[attr.name] = attr.value;
            }
        }
        return data;
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
        // Update debug info if panel exists
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            debugPanel.innerHTML = `
                <div>Logs sent: ${this.logCount}</div>
                <div>DOM updates: ${this.domUpdateCount}</div>
            `;
        }
    }

    setupEventListeners() {
        // Add any additional event listeners for debugging
        window.addEventListener('beforeunload', () => {
            this.sendLogs();
            this.sendDomSnapshot();
        });
    }
}

// Initialize both systems when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize logging system
    window.browserLogger = new BrowserLogger();

    // Initialize game
    window.urosGame = new UrosGame();
    // (No need to call startNewGame here)

    console.log('Uros game and logging system initialized');
}); 