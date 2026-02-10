function parseBooleanFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (rawValue == null) return defaultValue;
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

export const GAMES_V2_ENABLED = parseBooleanFlag(import.meta.env.VITE_GAMES_V2_ENABLED, true);

export { parseBooleanFlag };
