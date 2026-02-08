import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parse_chat import parse_chat_completion, extract_avatar_commands


def test_parse_string_content():
    result = {
        "choices": [
            {
                "message": {
                    "content": "hello world",
                    "thinking": "secret",
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "hello world"
    assert parsed["thinking"] == "secret"


def test_parse_array_content_with_thinking_part():
    result = {
        "choices": [
            {
                "message": {
                    "content": [
                        {"type": "thinking", "thinking": "internal"},
                        {"type": "text", "text": "Hello"},
                        {"type": "text", "text": ", world"},
                    ]
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "Hello, world"
    assert parsed["thinking"] == "internal"


# ========================================
# Tests for avatar command extraction
# ========================================

def test_extract_avatar_commands_mood():
    text = "[MOOD:happy:0.8] Hello there!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hello there!"
    assert behavior["mood"] == "happy"
    assert behavior["mood_intensity"] == 0.8


def test_extract_avatar_commands_mood_no_intensity():
    text = "[MOOD:excited] Wow!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Wow!"
    assert behavior["mood"] == "excited"
    assert behavior["mood_intensity"] == 1.0


def test_extract_avatar_commands_intent():
    text = "[INTENT:greeting] [MOOD:happy:0.8] Hello!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hello!"
    assert behavior["intent"] == "greeting"
    assert behavior["mood"] == "happy"
    assert behavior["mood_intensity"] == 0.8


def test_extract_avatar_commands_energy():
    text = "[ENERGY:high] Let's go!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Let's go!"
    assert behavior["energy"] == "high"


def test_extract_avatar_commands_all_tags():
    text = "[INTENT:greeting] [MOOD:happy] [ENERGY:high] Hello there!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hello there!"
    assert behavior["intent"] == "greeting"
    assert behavior["mood"] == "happy"
    assert behavior["energy"] == "high"


def test_extract_avatar_commands_case_insensitive():
    text = "[intent:Thinking] [energy:Low] [mood:SAD] Hmm..."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hmm..."
    assert behavior["intent"] == "thinking"
    assert behavior["energy"] == "low"
    assert behavior["mood"] == "sad"


def test_extract_avatar_commands_no_tags():
    text = "Just regular text here."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Just regular text here."
    assert behavior["intent"] is None
    assert behavior["mood"] is None
    assert behavior["energy"] is None


def test_extract_avatar_commands_empty():
    clean, behavior = extract_avatar_commands("")
    assert clean == ""
    assert behavior["intent"] is None
    assert behavior["mood"] is None


def test_extract_avatar_commands_mood_only():
    text = "[MOOD:happy] Just mood."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Just mood."
    assert behavior["mood"] == "happy"
    assert behavior["intent"] is None


def test_parse_chat_completion_with_behavior_tags():
    result = {
        "choices": [
            {
                "message": {
                    "content": "[INTENT:greeting] [MOOD:happy:0.9] [ENERGY:high] Hello!"
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "Hello!"
    assert parsed["behavior"]["intent"] == "greeting"
    assert parsed["behavior"]["mood"] == "happy"
    assert parsed["behavior"]["mood_intensity"] == 0.9
    assert parsed["behavior"]["energy"] == "high"


def test_parse_chat_completion_with_mood_only():
    result = {
        "choices": [
            {
                "message": {
                    "content": "[MOOD:happy:0.9] Hello, how are you?"
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "Hello, how are you?"
    assert parsed["behavior"]["mood"] == "happy"
    assert parsed["behavior"]["mood_intensity"] == 0.9
    assert parsed["behavior"]["intent"] is None


def test_parse_chat_completion_no_tags():
    result = {
        "choices": [
            {
                "message": {
                    "content": "Just a plain response."
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "Just a plain response."
    assert parsed["behavior"]["intent"] is None
    assert parsed["behavior"]["mood"] is None


# ========================================
# Tests for game tag extraction ([move:x], [game:x])
# ========================================

def test_extract_move_tag():
    text = "[move:5] I'll take the center!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "I'll take the center!"
    assert behavior["move"] == "5"


def test_extract_move_tag_case_insensitive():
    text = "[MOVE:e4] A classic opening."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "A classic opening."
    assert behavior["move"] == "e4"


def test_extract_move_tag_with_spaces():
    text = "[move: top-left ] Going for the corner."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Going for the corner."
    assert behavior["move"] == "top-left"


def test_extract_game_action_tag():
    text = "[game:resign] I give up!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "I give up!"
    assert behavior["game_action"] == "resign"


def test_extract_game_action_new_game():
    text = "[game:new_game] Let's play again!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Let's play again!"
    assert behavior["game_action"] == "new_game"


def test_extract_game_action_case_insensitive():
    text = "[GAME:Resign] No more."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "No more."
    assert behavior["game_action"] == "resign"


def test_extract_all_tags_with_move():
    text = "[intent:playful] [mood:thinking:0.7] [energy:medium] [move:7] Let me block that diagonal!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Let me block that diagonal!"
    assert behavior["intent"] == "playful"
    assert behavior["mood"] == "thinking"
    assert behavior["mood_intensity"] == 0.7
    assert behavior["energy"] == "medium"
    assert behavior["move"] == "7"
    assert behavior["game_action"] is None


def test_extract_move_and_game_action():
    text = "[move:e4] [game:offer_draw] How about a draw?"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "How about a draw?"
    assert behavior["move"] == "e4"
    assert behavior["game_action"] == "offer_draw"


def test_no_move_tag_present():
    text = "Just a regular message with no game tags."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Just a regular message with no game tags."
    assert behavior["move"] is None
    assert behavior["game_action"] is None


def test_move_tag_chess_notation():
    text = "[move:Nf3] Developing my knight."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Developing my knight."
    assert behavior["move"] == "Nf3"


def test_parse_chat_completion_with_move():
    result = {
        "choices": [
            {
                "message": {
                    "content": "[intent:playful] [mood:confident:0.8] [move:5] I'll take the center!"
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "I'll take the center!"
    assert parsed["behavior"]["intent"] == "playful"
    assert parsed["behavior"]["mood"] == "confident"
    assert parsed["behavior"]["move"] == "5"
    assert parsed["behavior"]["game_action"] is None


def test_parse_chat_completion_with_game_action():
    result = {
        "choices": [
            {
                "message": {
                    "content": "[mood:sad] [game:resign] I can't win this one."
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "I can't win this one."
    assert parsed["behavior"]["mood"] == "sad"
    assert parsed["behavior"]["game_action"] == "resign"
