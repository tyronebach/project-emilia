function parseBooleanFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (rawValue == null) return defaultValue;
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

function parseStringList(rawValue: string | undefined): Set<string> {
  if (!rawValue) return new Set();
  return new Set(
    rawValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export const GAMES_V2_ENABLED = parseBooleanFlag(import.meta.env.VITE_GAMES_V2_ENABLED, true);
export const GAMES_V2_AGENT_ALLOWLIST = parseStringList(import.meta.env.VITE_GAMES_V2_AGENT_ALLOWLIST);

export function isGamesV2EnabledForAgent(agentId: string | null | undefined): boolean {
  if (!GAMES_V2_ENABLED) return false;
  if (GAMES_V2_AGENT_ALLOWLIST.size === 0) return true;
  if (!agentId) return false;
  return GAMES_V2_AGENT_ALLOWLIST.has(agentId);
}

export { parseBooleanFlag, parseStringList };
