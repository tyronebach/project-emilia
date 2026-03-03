"""
Unified chat runtime pipeline for Emilia standalone core.

Replaces the current split between routers/chat.py and routers/rooms.py
with a single execution path that both DM and room chat go through.

Sub-modules:
  pipeline — process_message() entry point
  context  — build_context() assembles the full prompt context

Phase A: module skeleton only.
"""
