import { describe, expect, it } from 'vitest';
import { parseBooleanFlag } from './features';

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
