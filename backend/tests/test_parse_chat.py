import sys
from pathlib import Path

# Ensure backend/ is on sys.path when pytest rootdir differs
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parse_chat import parse_chat_completion


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
