import { describe, it, expect } from 'vitest';
import { stripAvatarTags, stripAvatarTagsStreaming } from './api';

describe('api utilities', () => {
  describe('stripAvatarTags', () => {
    it('should remove mood tags', () => {
      const text = 'Hello [MOOD:happy:0.8] world';
      expect(stripAvatarTags(text)).toBe('Hello  world');
    });

    it('should remove intent tags', () => {
      const text = 'Testing [INTENT:greeting] intents';
      expect(stripAvatarTags(text)).toBe('Testing  intents');
    });

    it('should remove energy tags', () => {
      const text = 'Hi [ENERGY:high] there';
      expect(stripAvatarTags(text)).toBe('Hi  there');
    });

    it('should remove multiple tags', () => {
      const text = '[INTENT:greeting] [MOOD:happy:0.8] [ENERGY:high] Hello there';
      expect(stripAvatarTags(text)).toBe('Hello there');
    });

    it('should trim whitespace', () => {
      const text = '  [MOOD:happy:0.5]  Text  [INTENT:greeting]  ';
      expect(stripAvatarTags(text)).toBe('Text');
    });

    it('should handle text without tags', () => {
      const text = 'Just plain text';
      expect(stripAvatarTags(text)).toBe('Just plain text');
    });

    it('should handle empty strings', () => {
      expect(stripAvatarTags('')).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing edge cases
      expect(stripAvatarTags(null as any)).toBe('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing edge cases
      expect(stripAvatarTags(undefined as any)).toBe('');
    });

    it('should preserve spacing between words', () => {
      const text = 'Hello [MOOD:happy:0.5] my [INTENT:greeting] friend';
      expect(stripAvatarTags(text)).toBe('Hello  my  friend');
    });

    it('should handle case-insensitive tags', () => {
      const text = 'Start [mood:thinking:0.7] middle [intent:curious] end';
      const result = stripAvatarTags(text);
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
      expect(result).toContain('Start');
      expect(result).toContain('middle');
      expect(result).toContain('end');
    });
  });

  describe('stripAvatarTagsStreaming', () => {
    it('should remove trailing partial bracket tags', () => {
      const text = 'Hello [MOOD:ha';
      expect(stripAvatarTagsStreaming(text)).toBe('Hello ');
    });

    it('should remove trailing partial intent tags', () => {
      const text = 'Hi [INTENT:gre';
      expect(stripAvatarTagsStreaming(text)).toBe('Hi ');
    });

    it('should remove trailing partial energy tags', () => {
      const text = 'Go [ENERGY:hi';
      expect(stripAvatarTagsStreaming(text)).toBe('Go ');
    });

    it('should preserve whitespace while streaming', () => {
      const text = '  Hello ';
      expect(stripAvatarTagsStreaming(text)).toBe('  Hello ');
    });
  });
});
