import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parse_chat import parse_chat_completion, extract_avatar_commands
from routers.sessions import _extract_text_content


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
# Tests for text content extraction
# ========================================

def test_extract_text_content_string():
    assert _extract_text_content("Hello world") == "Hello world"


def test_extract_text_content_empty():
    assert _extract_text_content("") == ""
    assert _extract_text_content(None) == ""
    assert _extract_text_content([]) == ""


def test_extract_text_content_array():
    content = [
        {"type": "text", "text": "Hello"},
        {"type": "text", "text": ", world!"},
    ]
    assert _extract_text_content(content) == "Hello , world!"


def test_extract_text_content_array_with_thinking():
    content = [
        {"type": "thinking", "thinking": "I should say hello"},
        {"type": "text", "text": "Hello!"},
    ]
    result = _extract_text_content(content)
    assert "Hello!" in result


def test_extract_text_content_array_only_thinking():
    content = [
        {"type": "thinking", "thinking": "Just thinking..."},
    ]
    assert _extract_text_content(content) == ""


def test_extract_text_content_mixed_types():
    content = [
        {"type": "unknown", "data": "ignored"},
        {"type": "text", "text": "Valid text"},
        {"type": "reasoning", "reasoning": "ignored"},
        123,
        {"type": "text", "text": " more"},
    ]
    result = _extract_text_content(content)
    assert "Valid text" in result
    assert "more" in result


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
