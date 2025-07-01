# Uros Board Game - Development Plan

## 1. **Architecture Overview**
- **Game State Management**: Single game state object with clear separation of concerns
- **UI Components**: Modular components for board, tiles, houses, and game controls
- **Logging Integration**: Preserve existing logging system and add game-specific logs
- **Input Handling**: Keyboard shortcuts + mouse interactions

## 2. **Core Game Logic**
- **Game State**: 
  - 6x6 lake board
  - 9 tiles in reedbed (from JSON)
  - Player houses (15 each: red/blue)
  - Current player, turn phase, selected tile/house
  - Village calculation and scoring
- **Move Validation**: 
  - House placement on any tile (lake or reedbed)
  - Island placement on lake (no overlaps)
  - Legal move detection
- **Game Flow**: 
  - First player: 1 placement
  - Subsequent turns: 2 placements each
  - Win condition detection
  - Village size calculation

## 3. **UI Layout Structure**
```
┌─────────────────────────────────────────────────────────────┐
│ Status Bar: Turn, Player, Phase, Village Sizes             │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│ Game Controls   │             6x6 Lake Board               │
│ - New Game      │                                           │
│ - Hotkeys       │                                           │
│ - Player Info   │                                           │
│                 │                                           │
├─────────────────┼───────────────────────────────────────────┤
│                 │                                           │
│ Player Houses   │            Reedbed (9 tiles)             │
│ Red: 15 left    │                                           │
│ Blue: 15 left   │                                           │
│                 │                                           │
└─────────────────┴───────────────────────────────────────────┘
```

## 4. **Implementation Phases**

### **Phase 1: Core Game Engine**
- Create `GameState` class with all game logic
- Implement tile rotation and placement validation
- Add village calculation algorithm
- Set up move validation and game flow

### **Phase 2: UI Foundation**
- Replace existing HTML with game layout
- Create CSS grid for responsive layout
- Implement basic tile and house rendering
- Add game status display

### **Phase 3: Interaction Layer**
- Mouse click handling for tile/house selection
- Keyboard shortcuts (Q/E for rotation, ESC for cancel)
- Drag and drop for tile placement
- Visual feedback for selected items

### **Phase 4: Game Flow Integration**
- Turn management and phase transitions
- Win condition detection and display
- New game functionality
- Complete game state logging

### **Phase 5: Polish & Testing**
- Visual improvements (colors, emojis, animations)
- Error handling and edge cases
- Performance optimization
- Comprehensive logging integration

## 5. **Key Technical Decisions**
- **State Management**: Single source of truth with immutable updates
- **Rendering**: Canvas-based for performance, or DOM-based for simplicity
- **Tile Representation**: 2D arrays with rotation functions
- **Village Calculation**: Flood-fill algorithm for connected components
- **Logging**: Extend existing logger with game-specific events

## 6. **File Structure**
```
app.js          → Game logic + existing logging
index.html      → Game UI + existing logging setup
tiles.json      → Tile definitions (existing)
server.js       → Logging server (existing)
```

## 7. **Asserts & Validation**
- Game state invariants (house counts, board bounds)
- Move legality validation
- Village calculation correctness
- Turn phase consistency

## 8. **Game Rules Summary**
- 2 players: Red vs Blue
- Each player has 15 houses
- 9 different island tiles in reedbed
- First player: 1 placement, then 2 placements per turn
- Place houses on any tile (lake or reedbed)
- Place islands on lake (no overlaps)
- Win: Largest connected village (orthogonal connection)
- Tiebreaker: Village spans more islands 