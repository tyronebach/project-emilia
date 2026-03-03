CREATE TABLE IF NOT EXISTS character_lived_experience (
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    lived_experience TEXT NOT NULL DEFAULT '',
    last_dream_at TEXT,
    dream_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, user_id)
);

CREATE TABLE IF NOT EXISTS dream_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    dreamed_at TEXT NOT NULL,
    triggered_by TEXT NOT NULL DEFAULT 'scheduler',
    conversation_summary TEXT,
    lived_experience_before TEXT,
    lived_experience_after TEXT,
    relationship_before TEXT,
    relationship_after TEXT,
    internal_monologue TEXT,
    model_used TEXT
);
