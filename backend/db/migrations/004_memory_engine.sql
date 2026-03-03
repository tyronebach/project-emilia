CREATE TABLE IF NOT EXISTS memory_documents (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    user_id TEXT,
    path TEXT,
    content_hash TEXT,
    created_at REAL,
    updated_at REAL
);

CREATE TABLE IF NOT EXISTS memory_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES memory_documents(id) ON DELETE CASCADE,
    agent_id TEXT,
    user_id TEXT,
    chunk_index INTEGER DEFAULT 0,
    content TEXT,
    embedding BLOB,
    fts_tokens TEXT,
    created_at REAL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts
USING fts5(content, fts_tokens, content='memory_chunks', content_rowid='rowid');
