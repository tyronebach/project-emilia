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
    """Test extracting MOOD tag with intensity."""
    text = "[MOOD:happy:0.8] Hello there!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hello there!"
    assert behavior["mood"] == "happy"
    assert behavior["mood_intensity"] == 0.8


def test_extract_avatar_commands_mood_no_intensity():
    """Test extracting MOOD tag without intensity (defaults to 1.0)."""
    text = "[MOOD:excited] Wow!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Wow!"
    assert behavior["mood"] == "excited"
    assert behavior["mood_intensity"] == 1.0


def test_extract_avatar_commands_intent():
    """Test extracting INTENT tag."""
    text = "[INTENT:greeting] [MOOD:happy:0.8] Hello!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hello!"
    assert behavior["intent"] == "greeting"
    assert behavior["mood"] == "happy"
    assert behavior["mood_intensity"] == 0.8


def test_extract_avatar_commands_energy():
    """Test extracting ENERGY tag."""
    text = "[ENERGY:high] Let's go!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Let's go!"
    assert behavior["energy"] == "high"


def test_extract_avatar_commands_all_tags():
    """Test extracting all behavior tags together."""
    text = "[INTENT:greeting] [MOOD:happy] [ENERGY:high] Hello there!"
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hello there!"
    assert behavior["intent"] == "greeting"
    assert behavior["mood"] == "happy"
    assert behavior["energy"] == "high"


def test_extract_avatar_commands_case_insensitive():
    """Test that tags are case-insensitive."""
    text = "[intent:Thinking] [energy:Low] [mood:SAD] Hmm..."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Hmm..."
    assert behavior["intent"] == "thinking"
    assert behavior["energy"] == "low"
    assert behavior["mood"] == "sad"


def test_extract_avatar_commands_no_tags():
    """Test text without any tags."""
    text = "Just regular text here."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Just regular text here."
    assert behavior["intent"] is None
    assert behavior["mood"] is None
    assert behavior["energy"] is None


def test_extract_avatar_commands_empty():
    """Test empty text."""
    clean, behavior = extract_avatar_commands("")
    assert clean == ""
    assert behavior["intent"] is None
    assert behavior["mood"] is None


def test_extract_avatar_commands_mood_only():
    """Test mood without intent."""
    text = "[MOOD:happy] Just mood."
    clean, behavior = extract_avatar_commands(text)
    assert clean == "Just mood."
    assert behavior["mood"] == "happy"
    assert behavior["intent"] is None


def test_parse_chat_completion_with_behavior_tags():
    """Test that parse_chat_completion extracts behavior data."""
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
    """Test that parse_chat_completion works with just a mood tag."""
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
    """Test parse_chat_completion with no tags at all."""
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
