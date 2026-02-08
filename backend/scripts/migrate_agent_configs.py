#!/usr/bin/env python3
"""
Migrate agent configs from JSON files to SQLite database.

Reads configs/agents/*.json and updates the emotional_profile column
in the agents table.

Usage:
    python -m scripts.migrate_agent_configs
"""
import json
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.connection import get_db

CONFIGS_DIR = Path(__file__).parent.parent.parent / "configs"
AGENTS_DIR = CONFIGS_DIR / "agents"


def migrate():
    """Migrate JSON configs to database."""
    if not AGENTS_DIR.exists():
        print(f"No agents directory found at {AGENTS_DIR}")
        return
    
    json_files = list(AGENTS_DIR.glob("*.json"))
    print(f"Found {len(json_files)} agent config files")
    
    with get_db() as conn:
        for path in json_files:
            agent_id = path.stem
            
            try:
                with open(path) as f:
                    config = json.load(f)
            except json.JSONDecodeError as e:
                print(f"  ❌ {agent_id}: Invalid JSON - {e}")
                continue
            
            # Check if agent exists
            row = conn.execute(
                "SELECT id, emotional_profile FROM agents WHERE id = ?",
                (agent_id,)
            ).fetchone()
            
            if not row:
                print(f"  ⚠️  {agent_id}: Not in database, skipping")
                continue
            
            # Parse existing profile
            existing = {}
            if row["emotional_profile"]:
                try:
                    existing = json.loads(row["emotional_profile"])
                except json.JSONDecodeError:
                    pass
            
            # Merge JSON config into profile
            # JSON file takes precedence
            merged = {**existing, **config}
            
            # Update database
            conn.execute(
                "UPDATE agents SET emotional_profile = ?, display_name = ? WHERE id = ?",
                (json.dumps(merged), config.get("name", agent_id.capitalize()), agent_id)
            )
            
            print(f"  ✓ {agent_id}: Updated emotional_profile")
            print(f"      mood_baseline: {merged.get('mood_baseline', {})}")
        
        conn.commit()
    
    print("\nMigration complete!")
    print("JSON files can be kept for reference or deleted.")


if __name__ == "__main__":
    migrate()
