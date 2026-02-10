import { describe, expect, it } from 'vitest';
import { parseBooleanFlag, parseStringList } from './features';

describe('parseBooleanFlag', () => {
  it('returns default when value is missing', () => {
    expect(parseBooleanFlag(undefined, true)).toBe(true);
    expect(parseBooleanFlag(undefined, false)).toBe(false);
  });

  it('parses false-like values as disabled', () => {
    expect(parseBooleanFlag('0', true)).toBe(false);
    expect(parseBooleanFlag('false', true)).toBe(false);
    expect(parseBooleanFlag('no', true)).toBe(false);
    expect(parseBooleanFlag('off', true)).toBe(false);
  });

  it('parses all other explicit values as enabled', () => {
    expect(parseBooleanFlag('1', false)).toBe(true);
    expect(parseBooleanFlag('true', false)).toBe(true);
    expect(parseBooleanFlag('yes', false)).toBe(true);
  });
});

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
