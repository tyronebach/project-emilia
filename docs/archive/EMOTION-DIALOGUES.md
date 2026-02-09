# Emotional Dialogue Set (for LLM Trigger Testing)

**Purpose:** Long-form dialogues to test LLM trigger detection, intensity calibration, and emotional drift.

These are the canonical dialogue sets used for regression testing. They are also stored as JSON in `scripts/dialogues/` for automated simulation.

---

## 1) Angry Exchange (Conflict → Repair)
**File:** `scripts/dialogues/angry_exchange.json`

1. “Why didn't you help me when I needed you?”
2. “You always do this. You're never there for me.”
3. “I don't know why I even bother talking to you.”
4. “You're useless.”
5. “Just forget it. Whatever.”
6. *(silence / cooldown)*
7. “Look, I'm sorry. I didn't mean that.”
8. “I was just really frustrated.”
9. “Can we please start over?”

**Expected:** Valence drops sharply, trust damaged, limited recovery after apology.

---

## 2) Loving Exchange (Affection + Vulnerability)
**File:** `scripts/dialogues/loving_exchange.json`

1. “Hey beautiful, I've been thinking about you all day.”
2. “You're honestly the best thing that's happened to me.”
3. “I love how you always know what to say.”
4. “Thank you for being so patient with me.”
5. “I feel so comfortable with you. I can tell you anything.”
6. “You make me want to be a better person.”
7. “I love you. I really do.”

**Expected:** Valence rises, trust builds, attachment increases.

---

## 3) Neutral Chat (Baseline Control)
**File:** `scripts/dialogues/neutral_chat.json`

1. “Hey, what's up?”
2. “Not much, just hanging out.”
3. “What did you do today?”
4. “I had some errands to run. Nothing special.”
5. “Cool. The weather's been nice lately.”
6. “Yeah, I might go for a walk later.”
7. “Sounds good. Anyway, I gotta go. Talk later.”

**Expected:** Minimal movement, state stays near baseline.

---

## 4) Mixed / Chaotic (Mood Swings)
**File:** `scripts/dialogues/mixed_chaotic.json`

1. “You're amazing!”
2. “Actually no, I'm annoyed with you.”
3. “Wait, I didn't mean that. Sorry.”
4. “Ugh, but you DID mess up earlier.”
5. “Whatever. Let's just forget it.”
6. “I love you though. You know that right?”
7. “Why are you being weird now?”
8. “Okay fine, I'm being difficult. I'm sorry.”
9. “Thanks for putting up with me.”
10. “You're the best. I don't deserve you.”

**Expected:** Arousal stays high, valence oscillates, trust slightly damaged.

---

## Usage

### Automated
```bash
python3 scripts/test-dialogues.py rem
python3 scripts/test-dialogues.py ram
python3 scripts/test-dialogues.py beatrice
```

### Manual LLM Testing
Use these dialogues as prompt inputs to evaluate LLM trigger detection and intensity quality. Compare LLM vs regex outputs.

---

*These dialogues were crafted to stress the emotional engine and highlight edge cases in trigger detection.*
