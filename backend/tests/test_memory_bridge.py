"""Tests for memory bridge service."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from services.memory_bridge import (
    _fts_search,
    _hybrid_merge,
    _validate_memory_path,
    _vector_search,
    read,
    search,
    write,
)

pytestmark = pytest.mark.anyio


# ── Path validation ─────────────────────────────────────────────────

class TestPathValidation:

    def test_valid_memory_md(self):
        assert _validate_memory_path("MEMORY.md") is True

    def test_valid_memory_subfile(self):
        assert _validate_memory_path("memory/notes.md") is True

    def test_valid_memory_subfile_with_spaces(self):
        assert _validate_memory_path("memory/my notes.md") is True

    def test_valid_memory_subfile_with_dots(self):
        assert _validate_memory_path("memory/v2.0.md") is True

    def test_rejects_traversal(self):
        assert _validate_memory_path("../../../etc/passwd") is False

    def test_rejects_non_memory_path(self):
        assert _validate_memory_path("src/main.py") is False

    def test_rejects_nested_traversal(self):
        assert _validate_memory_path("memory/../../../etc/passwd") is False

    def test_rejects_absolute_path(self):
        assert _validate_memory_path("/etc/passwd") is False

    def test_rejects_empty(self):
        assert _validate_memory_path("") is False

    def test_rejects_non_md_in_memory(self):
        assert _validate_memory_path("memory/script.py") is False


# ── File read ───────────────────────────────────────────────────────

class TestRead:

    def test_read_success(self, tmp_path: Path):
        workspace = str(tmp_path)
        (tmp_path / "MEMORY.md").write_text("line1\nline2\nline3\n")
        result = read(workspace, "MEMORY.md")
        assert "line1" in result
        assert "line3" in result

    def test_read_with_line_range(self, tmp_path: Path):
        workspace = str(tmp_path)
        (tmp_path / "MEMORY.md").write_text("a\nb\nc\nd\ne\n")
        result = read(workspace, "MEMORY.md", start_line=2, num_lines=2)
        assert result.strip() == "b\nc"

    def test_read_truncation(self, tmp_path: Path):
        workspace = str(tmp_path)
        (tmp_path / "MEMORY.md").write_text("x" * 2000)
        result = read(workspace, "MEMORY.md")
        assert "truncated" in result
        assert len(result) < 2000

    def test_read_not_found(self, tmp_path: Path):
        result = read(str(tmp_path), "MEMORY.md")
        assert result.startswith("Error:")

    def test_read_invalid_path(self, tmp_path: Path):
        result = read(str(tmp_path), "../secret.md")
        assert result.startswith("Error:")

    def test_read_no_workspace(self):
        result = read(None, "MEMORY.md")
        assert result.startswith("Error:")

    def test_read_memory_subdir(self, tmp_path: Path):
        workspace = str(tmp_path)
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        (mem_dir / "notes.md").write_text("hello notes")
        result = read(workspace, "memory/notes.md")
        assert "hello notes" in result


# ── File write ──────────────────────────────────────────────────────

class TestWrite:

    def test_write_append(self, tmp_path: Path):
        workspace = str(tmp_path)
        (tmp_path / "MEMORY.md").write_text("existing\n")
        result = write(workspace, "MEMORY.md", "new content\n", mode="append")
        assert result.startswith("OK:")
        content = (tmp_path / "MEMORY.md").read_text()
        assert "existing" in content
        assert "new content" in content

    def test_write_overwrite(self, tmp_path: Path):
        workspace = str(tmp_path)
        (tmp_path / "MEMORY.md").write_text("old\n")
        result = write(workspace, "MEMORY.md", "replaced\n", mode="overwrite")
        assert result.startswith("OK:")
        content = (tmp_path / "MEMORY.md").read_text()
        assert content == "replaced\n"

    def test_write_creates_memory_subdir(self, tmp_path: Path):
        workspace = str(tmp_path)
        result = write(workspace, "memory/new-file.md", "hello\n")
        assert result.startswith("OK:")
        assert (tmp_path / "memory" / "new-file.md").read_text() == "hello\n"

    def test_write_invalid_path(self, tmp_path: Path):
        result = write(str(tmp_path), "src/evil.py", "bad")
        assert result.startswith("Error:")

    def test_write_no_workspace(self):
        result = write(None, "MEMORY.md", "test")
        assert result.startswith("Error:")


# ── Hybrid merge ────────────────────────────────────────────────────

class TestHybridMerge:

    def test_merge_combines_scores(self):
        vec = [{"id": "a", "path": "p", "start_line": 1, "end_line": 5, "text": "txt", "source": "memory", "score": 0.9}]
        fts = [{"id": "a", "path": "p", "start_line": 1, "end_line": 5, "text": "txt", "source": "memory", "score": 0.8}]
        result = _hybrid_merge(vec, fts, limit=5, min_score=0.3)
        assert len(result) == 1
        # 0.7*0.9 + 0.3*0.8 = 0.63 + 0.24 = 0.87
        assert result[0]["score"] == pytest.approx(0.87, abs=0.01)

    def test_merge_filters_low_scores(self):
        vec = [{"id": "a", "path": "p", "start_line": 1, "end_line": 5, "text": "t", "source": "m", "score": 0.1}]
        result = _hybrid_merge(vec, [], limit=5, min_score=0.3)
        assert len(result) == 0

    def test_merge_respects_limit(self):
        vec = [
            {"id": f"id{i}", "path": "p", "start_line": 1, "end_line": 5, "text": "t", "source": "m", "score": 0.8}
            for i in range(10)
        ]
        result = _hybrid_merge(vec, [], limit=3, min_score=0.3)
        assert len(result) == 3


# ── Search (integration with mocks) ────────────────────────────────

class TestSearch:

    @patch("services.memory_bridge._open_memory_db")
    async def test_search_returns_empty_for_missing_db(self, mock_open):
        mock_open.return_value = None
        result = await search("nonexistent-agent", "test query")
        assert result == []

    @patch("services.memory_bridge._embed_query", new_callable=AsyncMock)
    @patch("services.memory_bridge._open_memory_db")
    async def test_search_fts_only_fallback(self, mock_open, mock_embed):
        mock_embed.return_value = None  # Vector unavailable

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            {"id": "c1", "path": "MEMORY.md", "source": "memory", "start_line": 1,
             "end_line": 5, "text": "test content", "rank": 0.5}
        ]
        mock_open.return_value = mock_conn

        result = await search("test-agent", "test query")
        assert len(result) == 1
        assert result[0]["path"] == "MEMORY.md"
        mock_conn.close.assert_called_once()
