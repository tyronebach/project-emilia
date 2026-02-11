import { describe, expect, it } from 'vitest';
import { parseStringList } from './features';

describe('parseStringList', () => {
  it('returns an empty set for missing values', () => {
    expect(parseStringList(undefined).size).toBe(0);
    expect(parseStringList('').size).toBe(0);
  });

  it('normalizes comma-separated values', () => {
    const parsed = parseStringList('agent-a, agent-b ,,agent-c');
    expect(parsed.has('agent-a')).toBe(true);
    expect(parsed.has('agent-b')).toBe(true);
    expect(parsed.has('agent-c')).toBe(true);
    expect(parsed.size).toBe(3);
  });
});
