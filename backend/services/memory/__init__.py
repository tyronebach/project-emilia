"""
Internal memory engine for Emilia standalone core.

Provides agent-scoped document storage, chunking, and hybrid
semantic+FTS retrieval without depending on OpenClaw or any external service.

Sub-modules:
  storage  — read/write memory_documents and memory_chunks rows
  indexer  — chunk documents and store them
  search   — hybrid semantic+FTS search
  embedder — embedder abstraction (local default, Gemini optional)

Phase A: module skeleton only.
"""
