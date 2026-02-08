import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.chat import inject_game_context


def test_no_game_context():
    result = inject_game_context("Hello!", None)
    assert result == "Hello!"


def test_no_game_context_empty_dict():
    """Empty dict with no state still produces a context block."""
    result = inject_game_context("Hello!", {})
    # Empty dict has falsy state/validMoves, but still wraps in block
    assert "[game: unknown]" in result or result == "Hello!"


def test_llm_turn_with_valid_moves():
    ctx = {
        "gameId": "tic-tac-toe",
        "promptInstructions": "## Tic-Tac-Toe\n- Keep it casual",
        "state": "You are O.\nX | 2 | O\n---------\n4 | X | 6",
        "lastUserMove": "5",
        "avatarMove": None,
        "validMoves": ["2", "4", "6"],
        "status": "in_progress",
        "moveCount": 1,
    }
    result = inject_game_context("Your turn!", ctx)

    # Layer 2: prompt instructions present
    assert "## Tic-Tac-Toe" in result
    assert "Keep it casual" in result

    # Layer 3: game state present
    assert "You are O." in result
    assert "X | 2 | O" in result

    # Turn instructions
    assert "The user just played: 5" in result
    assert "Legal moves: 2, 4, 6" in result
    assert "[move:your_move]" in result

    # Should NOT have avatar move or game over text
    assert "You played:" not in result
    assert "game is over" not in result.lower()


def test_engine_turn_with_avatar_move():
    ctx = {
        "gameId": "chess",
        "promptInstructions": "## Chess\n- Narrate as if YOU decided",
        "state": "Chess - You are Black\nFEN: rnbq...",
        "lastUserMove": "e4",
        "avatarMove": "e5",
        "validMoves": None,
        "status": "in_progress",
        "moveCount": 2,
    }
    result = inject_game_context("I play e4", ctx)

    # Layer 2
    assert "## Chess" in result
    assert "Narrate as if YOU decided" in result

    # Layer 3
    assert "Chess - You are Black" in result

    # Engine move path
    assert "The user just played: e4" in result
    assert "You played: e5" in result
    assert "React to this game state naturally" in result

    # Should NOT have valid moves list
    assert "Legal moves:" not in result


def test_game_over():
    ctx = {
        "gameId": "tic-tac-toe",
        "promptInstructions": "## TTT",
        "state": "Game over. You win!",
        "lastUserMove": "9",
        "avatarMove": None,
        "validMoves": [],
        "status": "game_over",
        "moveCount": 5,
    }
    result = inject_game_context("Good game!", ctx)

    assert "The game is over" in result
    assert "React to the outcome" in result


def test_valid_moves_limited_to_30():
    moves = [str(i) for i in range(50)]
    ctx = {
        "gameId": "test-game",
        "promptInstructions": "",
        "state": "test state",
        "lastUserMove": None,
        "avatarMove": None,
        "validMoves": moves,
        "status": "in_progress",
        "moveCount": 0,
    }
    result = inject_game_context("go", ctx)

    # Count how many moves appear in the legal moves line
    for line in result.split("\n"):
        if "Legal moves:" in line:
            listed = line.split("Legal moves:")[1].strip()
            listed_moves = [m.strip() for m in listed.split(",")]
            assert len(listed_moves) == 30
            break
    else:
        assert False, "No 'Legal moves:' line found"


def test_no_prompt_instructions():
    """When promptInstructions is empty, no Layer 2 block appears."""
    ctx = {
        "gameId": "tic-tac-toe",
        "promptInstructions": "",
        "state": "board state here",
        "lastUserMove": None,
        "avatarMove": None,
        "validMoves": ["1", "2"],
        "status": "in_progress",
        "moveCount": 0,
    }
    result = inject_game_context("go", ctx)

    assert "[game: tic-tac-toe]" in result
    assert "board state here" in result
    # No double newlines from empty instructions
    assert "## " not in result


def test_context_block_delimiters():
    ctx = {
        "gameId": "tic-tac-toe",
        "promptInstructions": "instructions",
        "state": "state",
        "lastUserMove": None,
        "avatarMove": None,
        "validMoves": [],
        "status": "in_progress",
        "moveCount": 0,
    }
    result = inject_game_context("msg", ctx)

    # Context block wrapped in --- delimiters
    assert "---\n[game: tic-tac-toe]" in result
    assert result.rstrip().endswith("---")
