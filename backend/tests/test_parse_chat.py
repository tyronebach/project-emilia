import sys
from pathlib import Path

# Ensure backend/ is on sys.path when pytest rootdir differs
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
# Tests for streaming delta extraction
# ========================================

def test_extract_text_content_string():
    """Test extracting text from a simple string content."""
    content = "Hello world"
    assert _extract_text_content(content) == "Hello world"


def test_extract_text_content_empty():
    """Test extracting text from empty content."""
    assert _extract_text_content("") == ""
    assert _extract_text_content(None) == "None"
    assert _extract_text_content([]) == ""


def test_extract_text_content_array():
    """Test extracting text from array content with multiple text parts."""
    content = [
        {"type": "text", "text": "Hello"},
        {"type": "text", "text": ", world!"},
    ]
    assert _extract_text_content(content) == "Hello , world!"


def test_extract_text_content_array_with_thinking():
    """Test that thinking content is included in extraction (not filtered here)."""
    content = [
        {"type": "thinking", "thinking": "I should say hello"},
        {"type": "text", "text": "Hello!"},
    ]
    # _extract_text_content doesn't filter by type, just extracts 'text' keys
    result = _extract_text_content(content)
    assert "Hello!" in result


def test_extract_text_content_array_only_thinking():
    """Test that pure thinking content returns empty string (no 'text' keys)."""
    content = [
        {"type": "thinking", "thinking": "Just thinking..."},
    ]
    # No 'text' keys, so returns empty
    assert _extract_text_content(content) == ""


def test_extract_text_content_mixed_types():
    """Test handling of mixed content types including unknown types."""
    content = [
        {"type": "unknown", "data": "ignored"},
        {"type": "text", "text": "Valid text"},
        {"type": "reasoning", "reasoning": "ignored"},
        123,  # Invalid part, converted to string
        {"type": "text", "text": " more"},
    ]
    result = _extract_text_content(content)
    assert "Valid text" in result
    assert "more" in result


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
