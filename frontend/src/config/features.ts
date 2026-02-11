function parseStringList(rawValue: string | undefined): Set<string> {
  if (!rawValue) return new Set();
  return new Set(
    rawValue
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export const GAMES_V2_AGENT_ALLOWLIST = parseStringList(import.meta.env.VITE_GAMES_V2_AGENT_ALLOWLIST);

export function isGamesV2EnabledForAgent(agentId: string | null | undefined): boolean {
  if (GAMES_V2_AGENT_ALLOWLIST.size === 0) return true;
  if (!agentId) return false;
  return GAMES_V2_AGENT_ALLOWLIST.has(agentId);
}

export { parseStringList };
