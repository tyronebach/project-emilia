import { describe, it, expect } from 'vitest';
import { chatInputSchema } from './chat';

describe('chatInputSchema', () => {
  it('should validate valid chat input', () => {
    const validInput = { message: 'Hello world' };
    const result = chatInputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('Hello world');
    }
  });

  it('should reject empty messages', () => {
    const invalidInput = { message: '' };
    const result = chatInputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should accept whitespace-only messages (trimming is UI responsibility)', () => {
    const input = { message: '   ' };
    const result = chatInputSchema.safeParse(input);

    // Schema accepts it, but UI should trim before submission
    expect(result.success).toBe(true);
  });

  it('should preserve whitespace (no automatic trimming)', () => {
    const input = { message: '  Hello world  ' };
    const result = chatInputSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      // Schema doesn't trim - that's the UI's job
      expect(result.data.message).toBe('  Hello world  ');
    }
  });

  it('should accept messages with special characters', () => {
    const input = { message: 'Hello! How are you? 😊' };
    const result = chatInputSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('should accept multi-line messages', () => {
    const input = { message: 'Line 1\nLine 2\nLine 3' };
    const result = chatInputSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('should reject missing message field', () => {
    const invalidInput = {};
    const result = chatInputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should reject non-string message', () => {
    const invalidInput = { message: 123 };
    const result = chatInputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should accept messages up to max length', () => {
    const maxLengthMessage = 'a'.repeat(4000);
    const input = { message: maxLengthMessage };
    const result = chatInputSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('should reject messages exceeding max length', () => {
    const tooLongMessage = 'a'.repeat(4001);
    const input = { message: tooLongMessage };
    const result = chatInputSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});
