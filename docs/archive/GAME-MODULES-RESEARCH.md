# Game Modules Research - Emilia Project

**Date:** 2026-02-01  
**Status:** Future planning (post-MVP)  
**Researcher:** Beatrice 💗

---

## The Vision

Interactive games where Emilia can "see" the game state and play with the user:
- Chess, checkers, tic-tac-toe
- Drawing games (Pictionary, Drawful-style)
- Word games (hangman, 20 questions)
- Maybe even simple card games

---

## Reference Architecture: Voyager (Minecraft AI)

**Source:** [MineDojo/Voyager](https://github.com/MineDojo/Voyager)

Voyager is an LLM-powered agent that plays Minecraft autonomously. Key architecture insights:

### Three Components
1. **Automatic Curriculum** — agent proposes tasks based on current state
2. **Skill Library** — reusable code snippets stored/retrieved by embedding
3. **Iterative Prompting** — environment feedback + self-verification loop

### What We Can Learn
- **State → LLM → Action loop**: Game state is serialized, sent to LLM, LLM returns action
- **Code as action space**: Voyager writes JavaScript to control Minecraft (via Mineflayer)
- **Composable skills**: Simple skills combine into complex behaviors
- **Feedback loop**: Execution errors feed back to LLM for correction

---

## Reference: LLM Chess Arena

**Source:** [llm-chess-arena](https://github.com/llm-chess-arena/llm-chess-arena)

Browser-based chess where LLMs play. Runs entirely client-side.

### Architecture
```
User → Chess UI (chessboard.js) → Game State (FEN) → LLM API → Move → Validate → Update Board
```

### Key Libraries
- **chess.js** — game logic, move validation, FEN parsing
- **chessboard.js** — visual board rendering
- LLM receives: current position (FEN), move history, asks for next move

---

## Proposed Architecture for Emilia

### Where It Fits

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Browser)                       │
├─────────────────────────────────────────────────────────────┤
│  Emilia Avatar (VRM)  │  Game Canvas  │  Chat Interface     │
│                       │  ┌─────────┐  │                     │
│  [MOOD] [ANIM]        │  │ Chess   │  │  User messages      │
│                       │  │ Board   │  │  Emilia responses   │
│                       │  └─────────┘  │                     │
├─────────────────────────────────────────────────────────────┤
│                    Game Module Layer                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Chess   │ │ Checkers │ │ Drawing  │ │  Words   │       │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                      ↓                                       │
│              Unified Game State API                          │
│  - getState(): serialized state for LLM                     │
│  - applyAction(action): validate & execute                  │
│  - getValidActions(): list legal moves                      │
│  - render(): update visual display                          │
└─────────────────────────────────────────────────────────────┘
                          ↓ API
┌─────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                        │
│  - Receives: user message + game state                      │
│  - Adds game context to LLM prompt                          │
│  - Parses game actions from LLM response                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   Clawdbot (Emilia Agent)                    │
│  - Sees game state in context                               │
│  - Responds with [MOOD] [ANIM] + game action + dialogue     │
│  - Example: "[MOOD:thinking:0.6] Hmm... I'll move my        │
│             knight to f3. [MOVE:Nf3] Your turn!"            │
└─────────────────────────────────────────────────────────────┘
```

### Game Module Interface (TypeScript)

```typescript
interface GameModule {
  id: string;                        // "chess", "checkers", etc.
  name: string;                      // Display name
  
  // State management
  newGame(): GameState;
  getState(): GameState;
  setState(state: GameState): void;
  
  // For LLM context
  serializeForLLM(): string;         // Human-readable state description
  getValidActions(): string[];       // Legal moves/actions
  
  // Action handling
  parseAction(llmOutput: string): Action | null;  // Extract action from LLM text
  applyAction(action: Action): ActionResult;      // Execute and validate
  
  // Rendering
  render(container: HTMLElement): void;
  
  // Game flow
  isGameOver(): boolean;
  getWinner(): 'player' | 'emilia' | 'draw' | null;
}
```

### Example: Chess Module

```typescript
const chessModule: GameModule = {
  id: 'chess',
  name: 'Chess',
  
  serializeForLLM() {
    // Returns something like:
    // "Current position (FEN): rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3
    //  You are playing Black. White just played e4.
    //  Your legal moves: e5, e6, d5, d6, Nf6, Nc6, ..."
  },
  
  parseAction(llmOutput: string) {
    // Look for [MOVE:e5] or "I play e5" patterns
    const match = llmOutput.match(/\[MOVE:(\w+)\]/);
    return match ? { type: 'move', value: match[1] } : null;
  }
};
```

### Backend Integration

```python
# backend/game_context.py

class GameContextManager:
    """Injects game state into Emilia's context."""
    
    def build_system_context(self, game_state: dict | None) -> str:
        if not game_state:
            return ""
        
        game_type = game_state.get("type")
        module = GAME_MODULES.get(game_type)
        
        return f"""
## Active Game: {module.name}

{module.serialize_for_llm(game_state)}

When making a move, include it in your response like: [MOVE:your_move]
React naturally to the game - show excitement, think out loud, tease the player!
"""
```

### Agent Prompt Addition (SOUL.md)

```markdown
## Games

When playing games with the user:
- Include your move as [MOVE:action] in your response
- React emotionally - celebrate good moves, pout when losing
- Think out loud sometimes: "Hmm, if I go here, then you might..."
- Keep it fun and playful, not competitive-robot mode
```

---

## Implementation Phases

### Phase 1: Proof of Concept (Simple)
- **Tic-tac-toe** — trivial state, easy to serialize
- Frontend: 3x3 grid component
- LLM context: "Board: X|O|_ / _|X|_ / _|_|O. Your turn (O). Valid: 1,4,7,8,9"
- Action parsing: [MOVE:5] → place O at position 5

### Phase 2: Turn-Based Games
- **Chess** — use chess.js + chessboard.js
- **Checkers** — simpler variant
- Well-established game state formats (FEN, PDN)

### Phase 3: Creative Games
- **Pictionary/Drawing** — Emilia describes, user draws (or vice versa)
- **20 Questions** — pure conversation, minimal UI
- **Word games** — hangman, word association

### Phase 4: Advanced
- **Card games** — hidden information handling
- **Collaborative games** — building something together

---

## Technical Considerations

### Token Efficiency
- Game state should be compact but readable
- Chess FEN is ~60 chars; legal moves list can be long
- Consider: only include top N "interesting" moves with LLM-friendly hints

### Action Parsing
- Structured tags like [MOVE:e4] are reliable
- Fallback: regex patterns for natural language ("I'll play e4")
- Validation: always check legality before applying

### State Persistence
- Game state stored in frontend (sessionStorage or React state)
- Sent with each message to backend
- Backend doesn't need to track game logic — just passes context

### Error Handling
- Invalid moves: "Oops, that's not legal! Try again?"
- LLM confusion: re-prompt with clearer state
- Graceful degradation: if parsing fails, ask Emilia to clarify

---

## Existing Libraries to Leverage

| Game | Library | Notes |
|------|---------|-------|
| Chess | chess.js + chessboard.js | Industry standard |
| Checkers | checkers.js | Less mature, may need custom |
| Go | wgo.js | For future expansion |
| Drawing | Excalidraw / tldraw | Could embed for Pictionary |
| Cards | deck-of-cards | Visual card rendering |

---

## Architecture Decision: Where Does Logic Live?

**Option A: Frontend-heavy** (Recommended for MVP)
- Game logic in browser (JS libraries)
- Backend just passes state to LLM
- Simple, fast, fewer moving parts

**Option B: Backend game engine**
- Python game logic
- More control, easier testing
- But: adds latency, complexity

**Option C: Hybrid**
- Frontend for rendering + basic validation
- Backend for complex AI (e.g., Stockfish integration)
- Best for games where Emilia needs "real" skill

**Recommendation:** Start with Option A. The LLM doesn't need to be "good" at chess — it needs to be fun and in-character. If we want challenge modes later, add Option C selectively.

---

## Next Steps (When Ready)

1. [ ] Define `GameModule` interface in TypeScript
2. [ ] Implement tic-tac-toe as proof of concept
3. [ ] Add game state to backend → Clawdbot context flow
4. [ ] Update Emilia's SOUL.md with game interaction guidelines
5. [ ] Test with chess.js integration
6. [ ] Design UI for game selection / embedding

---

## References

- [Voyager (Minecraft AI)](https://voyager.minedojo.org/)
- [LLM Chess Arena](https://github.com/llm-chess-arena/llm-chess-arena)
- [chess.js](https://github.com/jhlywa/chess.js)
- [chessboard.js](https://chessboardjs.com/)
- [js-chess-engine](https://github.com/josefjadrny/js-chess-engine)

---

## Expanded Architecture & Implementation Docs

This research has been expanded into a full architecture design and implementation guide:

- **[game-modules/README.md](./game-modules/README.md)** -- Overview, key decisions, step-by-step roadmap
- **[game-modules/ARCHITECTURE.md](./game-modules/ARCHITECTURE.md)** -- System architecture, data flow, integration points
- **[game-modules/GAME-INTERFACE-SPEC.md](./game-modules/GAME-INTERFACE-SPEC.md)** -- TypeScript interface spec with full examples
- **[game-modules/LLM-INTEGRATION.md](./game-modules/LLM-INTEGRATION.md)** -- LLM prompt design, tag system, move providers
- **[game-modules/FRONTEND-DESIGN.md](./game-modules/FRONTEND-DESIGN.md)** -- UI/UX layout, components, game renderers
- **[game-modules/IMPLEMENTATION-GUIDE.md](./game-modules/IMPLEMENTATION-GUIDE.md)** -- Phased build plan with acceptance criteria

---

*This is future work. Current priority: MVP with core conversation + avatar.*
