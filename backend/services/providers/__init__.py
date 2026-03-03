"""
Provider plugin layer for Emilia standalone core.

Abstracts LLM backends behind a common interface so routers and the
chat runtime never branch on backend mode directly.

Phase A: module skeleton only.  Logic is added in Phase B.
"""
