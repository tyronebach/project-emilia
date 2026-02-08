"""Game statistics repository."""
import uuid
import time
from db.connection import get_db


class GameStatsRepository:

    @staticmethod
    def record_game(
        session_id: str,
        user_id: str,
        agent_id: str,
        game_id: str,
        result: str,
        moves: int | None = None,
        duration_seconds: int | None = None,
    ) -> dict:
        """Record a completed game."""
        row_id = str(uuid.uuid4())
        now = time.time()

        with get_db() as conn:
            conn.execute(
                """INSERT INTO game_stats
                   (id, session_id, user_id, agent_id, game_id, result,
                    moves, duration_seconds, played_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (row_id, session_id, user_id, agent_id, game_id, result,
                 moves, duration_seconds, now)
            )
            return {
                "id": row_id,
                "session_id": session_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "game_id": game_id,
                "result": result,
                "moves": moves,
                "duration_seconds": duration_seconds,
                "played_at": now,
            }

    @staticmethod
    def get_user_stats(user_id: str, agent_id: str, game_id: str | None = None) -> dict:
        """Get aggregate stats for a user-agent pair, optionally filtered by game."""
        with get_db() as conn:
            if game_id:
                rows = conn.execute(
                    """SELECT result, COUNT(*) as count FROM game_stats
                       WHERE user_id = ? AND agent_id = ? AND game_id = ?
                       GROUP BY result""",
                    (user_id, agent_id, game_id)
                ).fetchall()
                total = conn.execute(
                    "SELECT COUNT(*) as total FROM game_stats WHERE user_id = ? AND agent_id = ? AND game_id = ?",
                    (user_id, agent_id, game_id)
                ).fetchone()
            else:
                rows = conn.execute(
                    """SELECT result, COUNT(*) as count FROM game_stats
                       WHERE user_id = ? AND agent_id = ?
                       GROUP BY result""",
                    (user_id, agent_id)
                ).fetchall()
                total = conn.execute(
                    "SELECT COUNT(*) as total FROM game_stats WHERE user_id = ? AND agent_id = ?",
                    (user_id, agent_id)
                ).fetchone()

            by_result = {r["result"]: r["count"] for r in rows}
            return {
                "total": total["total"] if total else 0,
                "wins": by_result.get("win", 0),
                "losses": by_result.get("lose", 0),
                "draws": by_result.get("draw", 0),
                "abandoned": by_result.get("abandoned", 0),
            }

    @staticmethod
    def get_win_rate(user_id: str, agent_id: str, game_id: str | None = None) -> float | None:
        """Get user win rate as float 0-1. Returns None if no games played."""
        stats = GameStatsRepository.get_user_stats(user_id, agent_id, game_id)
        if stats["total"] == 0:
            return None
        return stats["wins"] / stats["total"]
