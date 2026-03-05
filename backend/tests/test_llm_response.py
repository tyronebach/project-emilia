from __future__ import annotations

import pytest

from services.llm_response import extract_content


def test_extract_content_returns_stripped_text() -> None:
    payload = {"choices": [{"message": {"content": "  hello  "}}]}
    assert extract_content(payload) == "hello"


@pytest.mark.parametrize(
    "payload,error_text",
    [
        ({}, "missing choices"),
        ({"choices": ["not-a-dict"]}, "malformed choice"),
        ({"choices": [{}]}, "missing message"),
        ({"choices": [{"message": {}}]}, "missing content"),
        ({"choices": [{"message": {"content": "   "}}]}, "content is empty"),
    ],
)
def test_extract_content_rejects_malformed_payloads(
    payload: dict,
    error_text: str,
) -> None:
    with pytest.raises(ValueError, match=error_text):
        extract_content(payload)
