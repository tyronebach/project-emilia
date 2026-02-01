import sys
from pathlib import Path

# Ensure backend/ is on sys.path when pytest rootdir differs
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parse_chat import parse_chat_completion, extract_avatar_commands
from main import _extract_text_from_delta


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
# Tests for streaming delta extraction
# ========================================

def test_extract_text_from_delta_string_content():
    """Test extracting text from a simple string content delta."""
    delta = {"content": "Hello world"}
    assert _extract_text_from_delta(delta) == "Hello world"


def test_extract_text_from_delta_empty():
    """Test extracting text from an empty delta."""
    assert _extract_text_from_delta({}) == ""
    assert _extract_text_from_delta({"content": ""}) == ""
    assert _extract_text_from_delta({"content": None}) == ""


def test_extract_text_from_delta_array_content():
    """Test extracting text from array content with multiple text parts."""
    delta = {
        "content": [
            {"type": "text", "text": "Hello"},
            {"type": "text", "text": ", world!"},
        ]
    }
    assert _extract_text_from_delta(delta) == "Hello, world!"


def test_extract_text_from_delta_array_with_thinking():
    """Test that thinking content is skipped when extracting text."""
    delta = {
        "content": [
            {"type": "thinking", "thinking": "I should say hello"},
            {"type": "text", "text": "Hello!"},
        ]
    }
    # Should only return text, not thinking
    assert _extract_text_from_delta(delta) == "Hello!"


def test_extract_text_from_delta_array_only_thinking():
    """Test that pure thinking deltas return empty string."""
    delta = {
        "content": [
            {"type": "thinking", "thinking": "Just thinking..."},
        ]
    }
    assert _extract_text_from_delta(delta) == ""


def test_extract_text_from_delta_mixed_types():
    """Test handling of mixed content types including unknown types."""
    delta = {
        "content": [
            {"type": "unknown", "data": "ignored"},
            {"type": "text", "text": "Valid text"},
            {"type": "reasoning", "reasoning": "ignored"},
            123,  # Invalid part, should be skipped
            {"type": "text", "text": " more"},
        ]
    }
    assert _extract_text_from_delta(delta) == "Valid text more"


# ========================================
# Tests for avatar command extraction
# ========================================

def test_extract_avatar_commands_mood():
    """Test extracting MOOD tags with intensity."""
    text = "[MOOD:happy:0.8] Hello there!"
    clean, moods, anims = extract_avatar_commands(text)
    assert clean == "Hello there!"
    assert len(moods) == 1
    assert moods[0]["mood"] == "happy"
    assert moods[0]["intensity"] == 0.8
    assert len(anims) == 0


def test_extract_avatar_commands_mood_no_intensity():
    """Test extracting MOOD tags without intensity (defaults to 1.0)."""
    text = "[MOOD:excited] Wow!"
    clean, moods, anims = extract_avatar_commands(text)
    assert clean == "Wow!"
    assert len(moods) == 1
    assert moods[0]["mood"] == "excited"
    assert moods[0]["intensity"] == 1.0


def test_extract_avatar_commands_anim():
    """Test extracting ANIM tags."""
    text = "[ANIM:wave] Hi!"
    clean, moods, anims = extract_avatar_commands(text)
    assert clean == "Hi!"
    assert len(anims) == 1
    assert anims[0] == "wave"
    assert len(moods) == 0


def test_extract_avatar_commands_multiple():
    """Test extracting multiple MOOD and ANIM tags."""
    text = "[MOOD:thinking:0.6] [ANIM:thinking_pose] I tried to understand the problem."
    clean, moods, anims = extract_avatar_commands(text)
    assert clean == "I tried to understand the problem."
    assert len(moods) == 1
    assert moods[0]["mood"] == "thinking"
    assert moods[0]["intensity"] == 0.6
    assert len(anims) == 1
    assert anims[0] == "thinking_pose"


def test_extract_avatar_commands_no_tags():
    """Test text without any avatar tags."""
    text = "Just regular text here."
    clean, moods, anims = extract_avatar_commands(text)
    assert clean == "Just regular text here."
    assert len(moods) == 0
    assert len(anims) == 0


def test_extract_avatar_commands_empty():
    """Test empty text."""
    clean, moods, anims = extract_avatar_commands("")
    assert clean == ""
    assert len(moods) == 0
    assert len(anims) == 0


def test_parse_chat_completion_with_avatar_tags():
    """Test that parse_chat_completion extracts avatar commands."""
    result = {
        "choices": [
            {
                "message": {
                    "content": "[MOOD:happy:0.9] [ANIM:dance] Hello, how are you?"
                }
            }
        ]
    }
    parsed = parse_chat_completion(result)
    assert parsed["response_text"] == "Hello, how are you?"
    assert len(parsed["moods"]) == 1
    assert parsed["moods"][0]["mood"] == "happy"
    assert len(parsed["animations"]) == 1
    assert parsed["animations"][0] == "dance"
