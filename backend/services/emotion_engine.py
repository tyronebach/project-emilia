"""
Emotional Engine — Core logic for persistent emotional state.

Processes triggers, applies decay, and computes behavior levers for LLM injection.
"""
from dataclasses import dataclass, field
from typing import Optional
import json
import logging
import re

# Lazy import httpx - only needed for LLM trigger detection
try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

logger = logging.getLogger(__name__)

def _load_moods_from_db() -> tuple[list[str], dict[str, tuple[float, float]]]:
    """Load mood list and valence/arousal map from the moods DB table."""
    from db.repositories import MoodRepository
    rows = MoodRepository.get_all()
    moods = []
    va_map = {}
    for row in rows:
        mood_id = row["id"]
        moods.append(mood_id)
        va_map[mood_id] = (row["valence"], row["arousal"])
    return moods, va_map


# Populated on first access (lazy) so DB is ready before we query
_moods_cache: tuple[list[str], dict[str, tuple[float, float]]] | None = None


def _get_moods() -> tuple[list[str], dict[str, tuple[float, float]]]:
    global _moods_cache
    if _moods_cache is None:
        _moods_cache = _load_moods_from_db()
    return _moods_cache


def get_mood_list() -> list[str]:
    """Get the list of all mood IDs."""
    return _get_moods()[0]


def get_mood_valence_arousal() -> dict[str, tuple[float, float]]:
    """Get mood -> (valence, arousal) mapping."""
    return _get_moods()[1]


# Backwards-compatible module-level aliases (read via property-like access)
# Code that does `for mood in MOODS` or `MOOD_VALENCE_AROUSAL[x]` still works.
# These are loaded lazily on first use.
class _LazyList(list):
    _loaded = False
    def _ensure(self):
        if not self._loaded:
            self.extend(get_mood_list())
            self._loaded = True
    def __iter__(self): self._ensure(); return super().__iter__()
    def __len__(self): self._ensure(); return super().__len__()
    def __contains__(self, item): self._ensure(); return super().__contains__(item)
    def __getitem__(self, idx): self._ensure(); return super().__getitem__(idx)

class _LazyDict(dict):
    _loaded = False
    def _ensure(self):
        if not self._loaded:
            self.update(get_mood_valence_arousal())
            self._loaded = True
    def __iter__(self): self._ensure(); return super().__iter__()
    def __len__(self): self._ensure(); return super().__len__()
    def __contains__(self, item): self._ensure(); return super().__contains__(item)
    def __getitem__(self, key): self._ensure(); return super().__getitem__(key)
    def get(self, key, default=None): self._ensure(); return super().get(key, default)
    def items(self): self._ensure(); return super().items()
    def values(self): self._ensure(); return super().values()
    def keys(self): self._ensure(); return super().keys()

MOODS = _LazyList()
MOOD_VALENCE_AROUSAL = _LazyDict()


@dataclass
class EmotionalState:
    """Snapshot of emotional state."""
    valence: float = 0.0      # -1 (negative) to +1 (positive)
    arousal: float = 0.0      # -1 (calm) to +1 (activated)
    dominance: float = 0.0    # -1 (submissive) to +1 (dominant)
    trust: float = 0.5        # 0 to 1
    attachment: float = 0.3   # 0 to 1
    familiarity: float = 0.0  # 0 to 1
    mood_weights: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            'valence': self.valence,
            'arousal': self.arousal,
            'dominance': self.dominance,
            'trust': self.trust,
            'attachment': self.attachment,
            'familiarity': self.familiarity,
            'mood_weights': self.mood_weights,
        }

    @classmethod
    def from_dict(cls, d: dict) -> 'EmotionalState':
        return cls(
            valence=d.get('valence', 0.0),
            arousal=d.get('arousal', 0.0),
            dominance=d.get('dominance', 0.0),
            trust=d.get('trust', 0.5),
            attachment=d.get('attachment', 0.3),
            familiarity=d.get('familiarity', 0.0),
            mood_weights=d.get('mood_weights', {}),
        )


@dataclass
class AgentProfile:
    """Agent's emotional personality configuration."""
    # Baseline axes (from agents table columns)
    baseline_valence: float = 0.2
    baseline_arousal: float = 0.0
    baseline_dominance: float = 0.0
    emotional_volatility: float = 0.5   # Multiplier on incoming deltas
    emotional_recovery: float = 0.1     # Decay speed toward baseline
    
    # Extended config (from emotional_profile JSON)
    decay_rates: dict = field(default_factory=lambda: {
        'valence': 0.1, 'arousal': 0.12, 'trust': 0.02, 'attachment': 0.01
    })
    trust_gain_multiplier: float = 1.0
    trust_loss_multiplier: float = 1.0
    attachment_ceiling: float = 1.0
    trigger_multipliers: dict = field(default_factory=dict)
    play_trust_threshold: float = 0.7
    mood_baseline: dict = field(default_factory=dict)
    mood_decay_rate: float = 0.3
    
    @classmethod
    def from_db(cls, agent_row: dict, profile_json: dict) -> 'AgentProfile':
        """Build profile from agents table row + parsed JSON profile."""
        return cls(
            baseline_valence=agent_row.get('baseline_valence') or 0.2,
            baseline_arousal=agent_row.get('baseline_arousal') or 0.0,
            baseline_dominance=agent_row.get('baseline_dominance') or 0.0,
            emotional_volatility=agent_row.get('emotional_volatility') or 0.5,
            emotional_recovery=agent_row.get('emotional_recovery') or 0.1,
            decay_rates=profile_json.get('decay_rates', {
                'valence': 0.1, 'arousal': 0.12, 'trust': 0.02, 'attachment': 0.01
            }),
            trust_gain_multiplier=profile_json.get('trust_gain_multiplier', 1.0),
            trust_loss_multiplier=profile_json.get('trust_loss_multiplier', 1.0),
            attachment_ceiling=profile_json.get('attachment_ceiling', 1.0),
            trigger_multipliers=profile_json.get('trigger_multipliers', {}),
            play_trust_threshold=profile_json.get('play_trust_threshold', 0.7),
            mood_baseline=profile_json.get('mood_baseline', {}),
            mood_decay_rate=profile_json.get('mood_decay_rate', 0.3),
        )


class EmotionEngine:
    """
    Core emotional processing engine.
    
    Handles trigger detection, delta application, decay, and behavior lever computation.
    """
    
    # Default trigger -> delta mappings
    DEFAULT_TRIGGER_DELTAS: dict[str, dict[str, float]] = {
        'compliment': {'valence': 0.15, 'arousal': 0.05, 'trust': 0.02},
        'affirmation': {'valence': 0.10, 'arousal': 0.03, 'trust': 0.03},
        'rejection': {'valence': -0.20, 'arousal': 0.10, 'trust': -0.05},
        'teasing': {'valence': 0.05, 'arousal': 0.10, 'trust': 0.01},
        'conflict': {'valence': -0.25, 'arousal': 0.30, 'trust': -0.10},
        'criticism': {'valence': -0.12, 'arousal': 0.08, 'trust': -0.03},
        'comfort': {'valence': 0.20, 'arousal': -0.10, 'trust': 0.05},
        'gratitude': {'valence': 0.12, 'arousal': 0.05, 'trust': 0.02},
        'apology': {'valence': 0.08, 'arousal': -0.05, 'trust': 0.03},
        'repair': {'valence': 0.10, 'arousal': -0.05, 'trust': 0.02},
        'dismissal': {'valence': -0.10, 'arousal': -0.05, 'trust': -0.02},
        'curiosity': {'valence': 0.05, 'arousal': 0.08, 'trust': 0.01},
        'shared_joy': {'valence': 0.18, 'arousal': 0.15, 'trust': 0.02, 'attachment': 0.02},
        'vulnerability': {'valence': 0.05, 'arousal': 0.05, 'trust': 0.05, 'attachment': 0.03},
        'greeting': {'valence': 0.08, 'arousal': 0.05, 'trust': 0.01},
        'farewell': {'valence': 0.02, 'arousal': -0.05, 'attachment': 0.01},
    }
    
    # Pattern-based trigger detection
    TRIGGER_PATTERNS: dict[str, list[str]] = {
        'compliment': [
            r'\b(amazing|wonderful|great|awesome|incredible|fantastic)\b',
            r'\b(love you|adore you|proud of you)\b',
            r'\b(you.re|you are) (so |really )?(smart|kind|sweet|beautiful|cute|talented)\b',
            r'\b(best|favorite)\b.{0,20}\b(ever|always)\b',
        ],
        'gratitude': [
            r'\b(thank you|thanks|thx|ty|appreciate)\b',
            r'\b(grateful|thankful)\b',
        ],
        'teasing': [
            r'\b(haha|hehe|lol|lmao|rofl)\b',
            r'\b(just kidding|jk|joking)\b',
            r'\b(silly|dummy|dork|nerd)\b',
        ],
        'comfort': [
            r'\b(it.s okay|it.s ok|it.s alright|don.t worry)\b',
            r'\b(i.m here|here for you|got you)\b',
            r'\b(there there|it.ll be)\b',
        ],
        'conflict': [
            r'\b(angry|furious|upset|mad) (at|with) (you|me)\b',
            r'\b(hate|can.t stand)\b',
            r'\b(how could you|why did you|what.s wrong with you)\b',
        ],
        'criticism': [
            r'\b(not what i asked|wrong|incorrect|mistake)\b',
            r'\b(you (always|never)|that.s not|that wasn.t)\b',
            r'\b(disappointed|let me down|could.ve been better)\b',
            r'\b(useless|unhelpful|pointless)\b',
        ],
        'dismissal': [
            r'\b(don.t need you|don.t need your|don.t want your)\b',
            r'\b(i.m fine|i.ll handle it|i.ll do it myself)\b',
            r'\b(not now|maybe later|another time)\b',
        ],
        'repair': [
            r'\b(come back|wait|hold on|sorry i)\b',
            r'\b(didn.t mean|that came out wrong|let me explain)\b',
            r'\b(can we talk|let.s talk|work this out)\b',
        ],
        'rejection': [
            r'\b(don.t care|go away|leave me alone|shut up)\b',
            r'\b(whatever|who cares|doesn.t matter)\b',
        ],
        'apology': [
            r'\b(i.m sorry|my bad|my fault|forgive me)\b',
            r'\b(apologize|apologies)\b',
        ],
        'greeting': [
            r'^(hi|hey|hello|yo|sup|hiya|good morning|good evening)\b',
        ],
        'farewell': [
            r'\b(bye|goodbye|good night|see you|later|gotta go)\b',
        ],
        'curiosity': [
            r'\b(tell me about|what.s your|how do you feel|what do you think)\b',
            r'\b(curious|wondering|interested)\b',
        ],
        'vulnerability': [
            r'\b(i trust you|only you|between us|secret)\b',
            r'\b(never told anyone|first time telling)\b',
        ],
    }
    
    # Compile patterns for efficiency
    _compiled_patterns: dict[str, list[re.Pattern]] = {}
    
    def __init__(self, profile: AgentProfile):
        self.profile = profile
        self._compile_patterns()
    
    def _compile_patterns(self) -> None:
        """Compile regex patterns once."""
        if not EmotionEngine._compiled_patterns:
            for trigger, patterns in self.TRIGGER_PATTERNS.items():
                EmotionEngine._compiled_patterns[trigger] = [
                    re.compile(p, re.IGNORECASE) for p in patterns
                ]
    
    def apply_decay(self, state: EmotionalState, elapsed_seconds: float) -> EmotionalState:
        """
        Apply temporal decay toward baseline.
        
        Decay formula: new = current - (current - baseline) * rate * (elapsed/3600)
        """
        if elapsed_seconds <= 0:
            return state
        
        hours = elapsed_seconds / 3600.0
        
        # Get per-axis decay rates
        rates = self.profile.decay_rates
        recovery = self.profile.emotional_recovery
        
        # Decay each axis
        def decay_axis(current: float, baseline: float, rate: float) -> float:
            decay_amount = (current - baseline) * rate * recovery * hours
            return current - decay_amount
        
        state.valence = self._clamp(
            decay_axis(state.valence, self.profile.baseline_valence, rates.get('valence', 0.1)),
            -1.0, 1.0
        )
        state.arousal = self._clamp(
            decay_axis(state.arousal, self.profile.baseline_arousal, rates.get('arousal', 0.12)),
            -1.0, 1.0
        )
        state.dominance = self._clamp(
            decay_axis(state.dominance, self.profile.baseline_dominance, rates.get('dominance', 0.1)),
            -1.0, 1.0
        )
        
        # Trust/attachment decay very slowly (toward baseline 0.5/0.3)
        # But we don't decay trust below 0.3 or attachment below 0.2
        trust_decay = (state.trust - 0.5) * rates.get('trust', 0.02) * recovery * hours
        state.trust = self._clamp(state.trust - trust_decay, 0.0, 1.0)
        
        attachment_decay = (state.attachment - 0.3) * rates.get('attachment', 0.01) * recovery * hours
        state.attachment = self._clamp(state.attachment - attachment_decay, 0.0, self.profile.attachment_ceiling)
        
        return state
    
    def detect_triggers(self, text: str) -> list[tuple[str, float]]:
        """
        Detect emotional triggers from text.
        
        Returns list of (trigger_name, intensity) tuples.
        """
        if not text:
            return []
        
        triggers = []
        text_lower = text.lower()
        
        for trigger, patterns in EmotionEngine._compiled_patterns.items():
            for pattern in patterns:
                match = pattern.search(text_lower)
                if match:
                    # Base intensity 0.7, could be refined later
                    intensity = 0.7
                    triggers.append((trigger, intensity))
                    break  # One match per trigger type
        
        return triggers

    async def detect_triggers_llm(self, text: str) -> list[tuple[str, float]]:
        """
        Detect emotional triggers using LLM classification.

        Sends the user message to the LLM with a structured prompt asking it
        to identify emotional triggers and their intensities. Falls back to
        regex-based detection on any failure.

        Returns list of (trigger_name, intensity) tuples.
        """
        if not text or not text.strip():
            return []

        from config import settings

        valid_triggers = list(self.DEFAULT_TRIGGER_DELTAS.keys())

        prompt = (
            "Classify the emotional triggers in this user message. "
            f"Valid triggers: {', '.join(valid_triggers)}. "
            "Return a JSON array of objects with 'trigger' (string) and "
            "'intensity' (float 0.0-1.0). Return [] if no triggers found. "
            "Only return the JSON array, nothing else."
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{settings.clawdbot_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.clawdbot_token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.compact_model,
                        "messages": [
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": text},
                        ],
                        "temperature": 0.0,
                        "max_tokens": 256,
                    },
                )
                response.raise_for_status()

            result = response.json()
            content = result["choices"][0]["message"]["content"].strip()

            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            parsed = json.loads(content)

            if not isinstance(parsed, list):
                logger.warning("[EmotionLLM] Expected list, got %s", type(parsed).__name__)
                return self.detect_triggers(text)

            triggers = []
            for item in parsed:
                trigger = item.get("trigger", "")
                intensity = float(item.get("intensity", 0.7))
                if trigger in self.DEFAULT_TRIGGER_DELTAS:
                    intensity = max(0.0, min(1.0, intensity))
                    triggers.append((trigger, intensity))
                else:
                    logger.debug("[EmotionLLM] Ignoring unknown trigger: %s", trigger)

            logger.info("[EmotionLLM] Detected triggers: %s", triggers)
            return triggers

        except Exception:
            logger.exception("[EmotionLLM] LLM trigger detection failed, falling back to regex")
            return self.detect_triggers(text)

    async def detect_triggers_llm_batch(self, messages: list[str]) -> list[tuple[str, float]]:
        """
        Detect emotional triggers from multiple messages in a single LLM call.
        
        More efficient than calling detect_triggers_llm for each message.
        Returns combined list of (trigger_name, intensity) tuples.
        """
        if not messages:
            return []

        # Filter empty messages
        messages = [m for m in messages if m and m.strip()]
        if not messages:
            return []

        from config import settings

        valid_triggers = list(self.DEFAULT_TRIGGER_DELTAS.keys())
        
        # Format messages with numbers for clarity
        numbered_messages = "\n".join(f"{i+1}. {m}" for i, m in enumerate(messages))

        prompt = (
            "Classify the emotional triggers in these user messages. "
            f"Valid triggers: {', '.join(valid_triggers)}. "
            "Return a JSON array of objects with 'trigger' (string) and "
            "'intensity' (float 0.0-1.0). Combine triggers across all messages. "
            "If the same trigger appears multiple times, average the intensities. "
            "Return [] if no triggers found. Only return the JSON array."
        )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{settings.clawdbot_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.clawdbot_token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.compact_model,
                        "messages": [
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": numbered_messages},
                        ],
                        "temperature": 0.0,
                        "max_tokens": 512,
                    },
                )
                response.raise_for_status()

            result = response.json()
            content = result["choices"][0]["message"]["content"].strip()

            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            parsed = json.loads(content)

            if not isinstance(parsed, list):
                logger.warning("[EmotionLLM-Batch] Expected list, got %s", type(parsed).__name__)
                return []

            triggers = []
            for item in parsed:
                trigger = item.get("trigger", "")
                intensity = float(item.get("intensity", 0.7))
                if trigger in self.DEFAULT_TRIGGER_DELTAS:
                    intensity = max(0.0, min(1.0, intensity))
                    triggers.append((trigger, intensity))

            logger.info("[EmotionLLM-Batch] Detected triggers from %d messages: %s", 
                       len(messages), triggers)
            return triggers

        except Exception:
            logger.exception("[EmotionLLM-Batch] Batch trigger detection failed")
            return []

    def apply_trigger(self, state: EmotionalState, trigger: str, intensity: float = 0.7) -> dict[str, float]:
        """
        Apply a trigger's emotional deltas to state.
        
        Returns dict of deltas that were applied.
        """
        # Get base deltas for this trigger
        base_deltas = self.DEFAULT_TRIGGER_DELTAS.get(trigger, {})
        if not base_deltas:
            return {}
        
        # Get trigger-specific multiplier from profile
        trigger_mult = self.profile.trigger_multipliers.get(trigger, 1.0)
        
        # Check play context (teasing at high trust is positive)
        if trigger == 'teasing':
            intensity = self._check_play_context(trigger, state.trust, intensity)
        
        # Calculate effective deltas
        volatility = self.profile.emotional_volatility
        applied_deltas = {}
        
        for axis, raw_delta in base_deltas.items():
            effective_delta = raw_delta * intensity * volatility * trigger_mult
            
            # Special handling for trust (asymmetric)
            if axis == 'trust':
                effective_delta = self._apply_trust_delta_modifier(effective_delta)
            
            applied_deltas[axis] = effective_delta
            
            # Apply to state
            current = getattr(state, axis)
            new_value = current + effective_delta
            
            # Clamp based on axis type
            if axis in ('valence', 'arousal', 'dominance'):
                new_value = self._clamp(new_value, -1.0, 1.0)
            elif axis == 'attachment':
                new_value = self._clamp(new_value, 0.0, self.profile.attachment_ceiling)
            else:
                new_value = self._clamp(new_value, 0.0, 1.0)
            
            setattr(state, axis, new_value)
        
        # Increment familiarity slightly with each interaction
        state.familiarity = self._clamp(state.familiarity + 0.005, 0.0, 1.0)
        
        return applied_deltas
    
    def _apply_trust_delta_modifier(self, delta: float) -> float:
        """Apply asymmetric trust change (negative changes are larger)."""
        if delta > 0:
            # Positive trust change: slow, reduced
            return delta * 0.3 * self.profile.trust_gain_multiplier
        else:
            # Negative trust change: faster, amplified
            return delta * 1.5 * self.profile.trust_loss_multiplier
    
    def _check_play_context(self, trigger: str, trust: float, intensity: float) -> float:
        """
        Adjust trigger intensity based on play context.
        
        Teasing at high trust becomes positive bonding.
        """
        if trigger not in ('teasing',):
            return intensity
        
        if trust >= self.profile.play_trust_threshold:
            # High trust: teasing is bonding, flip to positive
            return abs(intensity) * 0.8
        elif trust >= 0.4:
            # Medium trust: neutral
            return abs(intensity) * 0.2
        else:
            # Low trust: teasing hurts
            return -abs(intensity) * 0.5
    
    def calculate_mood_deltas(
        self,
        triggers: list[tuple[str, float]],
        trigger_mood_map: dict,
    ) -> dict[str, float]:
        """Calculate mood weight changes from triggers."""
        mood_deltas = {mood: 0.0 for mood in MOODS}

        for trigger, intensity in triggers:
            if trigger in trigger_mood_map:
                for mood, weight in trigger_mood_map[trigger].items():
                    if mood in MOODS:
                        mood_deltas[mood] += weight * intensity

        return mood_deltas

    def apply_mood_deltas(self, state: EmotionalState, mood_deltas: dict) -> None:
        """Apply mood deltas with volatility scaling."""
        if not state.mood_weights:
            state.mood_weights = {mood: self.profile.mood_baseline.get(mood, 0) for mood in MOODS}

        for mood, delta in mood_deltas.items():
            effective_delta = delta * self.profile.emotional_volatility
            current = state.mood_weights.get(mood, 0)
            state.mood_weights[mood] = self._clamp(current + effective_delta, -10, 20)

        # Update valence/arousal from moods
        self._update_valence_arousal_from_moods(state)

    def _update_valence_arousal_from_moods(self, state: EmotionalState) -> None:
        """Derive valence/arousal from mood weights."""
        total_weight = sum(max(0, w) for w in state.mood_weights.values()) or 1

        valence = sum(
            MOOD_VALENCE_AROUSAL.get(mood, (0, 0))[0] * max(0, weight)
            for mood, weight in state.mood_weights.items()
        ) / total_weight

        arousal = sum(
            MOOD_VALENCE_AROUSAL.get(mood, (0, 0))[1] * max(0, weight)
            for mood, weight in state.mood_weights.items()
        ) / total_weight

        # Blend with existing (don't completely override)
        state.valence = self._clamp(state.valence * 0.3 + valence * 0.7, -1, 1)
        state.arousal = self._clamp(state.arousal * 0.3 + arousal * 0.7, -1, 1)

    def apply_mood_decay(self, state: EmotionalState, elapsed_seconds: float) -> None:
        """Decay mood weights toward baseline."""
        if not state.mood_weights:
            return

        hours = elapsed_seconds / 3600
        decay_rate = self.profile.mood_decay_rate
        baseline = self.profile.mood_baseline

        for mood in MOODS:
            current = state.mood_weights.get(mood, 0)
            target = baseline.get(mood, 0)
            decay = (current - target) * decay_rate * hours
            state.mood_weights[mood] = current - decay

    def get_dominant_moods(self, state: EmotionalState, top_n: int = 3) -> list[tuple[str, float]]:
        """Get top N moods by current weight."""
        if not state.mood_weights:
            return []

        sorted_moods = sorted(
            state.mood_weights.items(),
            key=lambda x: x[1],
            reverse=True,
        )
        return [(m, w) for m, w in sorted_moods[:top_n] if w > 0]

    def get_behavior_levers(self, state: EmotionalState) -> dict[str, float]:
        """
        Convert emotional state to LLM-injectable behavior levers.
        
        Returns warmth, playfulness, guardedness (0-1 scale).
        """
        # Warmth: positive valence + trust
        warmth = ((state.valence + 1) / 2) * state.trust
        warmth = self._clamp(warmth, 0.0, 1.0)
        
        # Guardedness: inverse of trust + negative valence effect
        guardedness = (1 - state.trust) * 0.5 + max(0, -state.valence) * 0.3
        guardedness = self._clamp(guardedness, 0.0, 1.0)
        
        # Playfulness: positive arousal + low guardedness
        playfulness = max(0, (state.arousal + 0.5) / 1.5) * (1 - guardedness * 0.5)
        playfulness = self._clamp(playfulness, 0.0, 1.0)
        
        return {
            'warmth': round(warmth, 2),
            'playfulness': round(playfulness, 2),
            'guardedness': round(guardedness, 2),
        }
    
    def generate_context_block(self, state: EmotionalState) -> str:
        """Generate emotional context block for LLM prompt injection."""
        levers = self.get_behavior_levers(state)

        # Get dominant moods
        dominant = self.get_dominant_moods(state, top_n=2)

        if dominant:
            mood_names = [m[0] for m in dominant]
            top_weight = dominant[0][1]
            intensity = "strongly" if top_weight > 10 else "somewhat" if top_weight > 5 else "slightly"
            mood_desc = f"{intensity} {' and '.join(mood_names)}"
        else:
            mood_desc = "neutral"

        return f"""[EMOTIONAL_STATE]
You're feeling {mood_desc} right now.
Warmth: {levers['warmth']:.0%} | Playfulness: {levers['playfulness']:.0%} | Guardedness: {levers['guardedness']:.0%}
Trust level: {state.trust:.0%}
Let this color your tone naturally — don't mention these explicitly.
[/EMOTIONAL_STATE]"""

    @staticmethod
    def _lever_description(value: float, descriptions: list[str]) -> str:
        """Map a 0-1 value to a description from a list."""
        idx = min(int(value * len(descriptions)), len(descriptions) - 1)
        return descriptions[idx]
    
    @staticmethod
    def _clamp(value: float, min_val: float, max_val: float) -> float:
        """Clamp value to range."""
        return max(min_val, min(max_val, value))
