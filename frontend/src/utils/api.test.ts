import { describe, it, expect } from 'vitest';
import { stripAvatarTags, stripAvatarTagsStreaming } from './api';

describe('api utilities', () => {
  describe('stripAvatarTags', () => {
    it('should remove mood tags', () => {
      const text = 'Hello <mood:happy:0.8> world';
      expect(stripAvatarTags(text)).toBe('Hello  world');
    });

    it('should remove animation tags', () => {
      const text = 'Testing <animation:wave> animations';
      expect(stripAvatarTags(text)).toBe('Testing  animations');
    });

    it('should remove multiple tags', () => {
      const text = '<mood:excited:1.0>Hello <animation:nod> there<mood:calm:0.5>';
      expect(stripAvatarTags(text)).toBe('Hello  there');
    });

    it('should trim whitespace', () => {
      const text = '  <mood:happy:0.5>  Text  <animation:wave>  ';
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
      expect(stripAvatarTags(null as any)).toBe('');
      expect(stripAvatarTags(undefined as any)).toBe('');
    });

    it('should preserve spacing between words', () => {
      const text = 'Hello <mood:happy:0.5> my <animation:wave> friend';
      expect(stripAvatarTags(text)).toBe('Hello  my  friend');
    });

    it('should handle complex nested scenarios', () => {
      const text = 'Start <mood:thinking:0.7> middle <animation:shrug> end';
      const result = stripAvatarTags(text);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).toContain('Start');
      expect(result).toContain('middle');
      expect(result).toContain('end');
    });

    it('should remove bracketed mood tags', () => {
      const text = 'Hello [MOOD:happy:0.7] world';
      expect(stripAvatarTags(text)).toBe('Hello  world');
    });

    it('should remove bracketed animation tags', () => {
      const text = 'Hi [ANIM:wave] there';
      expect(stripAvatarTags(text)).toBe('Hi  there');
    });
  });

  describe('stripAvatarTagsStreaming', () => {
    it('should remove trailing partial bracket tags', () => {
      const text = 'Hello [MOOD:ha';
      expect(stripAvatarTagsStreaming(text)).toBe('Hello ');
    });

    it('should remove trailing partial angle tags', () => {
      const text = 'Hi <mood:hap';
      expect(stripAvatarTagsStreaming(text)).toBe('Hi ');
    });

    it('should preserve whitespace while streaming', () => {
      const text = '  Hello ';
      expect(stripAvatarTagsStreaming(text)).toBe('  Hello ');
    });
  });
});
