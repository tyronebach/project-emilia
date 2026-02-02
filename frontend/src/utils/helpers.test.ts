import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatDate,
  truncate,
  formatSessionName,
  safeJsonParse,
  debounce,
  formatBytes,
  formatNumber,
  isDefined,
} from './helpers';

describe('formatDate', () => {
  beforeEach(() => {
    // Mock current time to 2026-02-02 12:00:00
    vi.setSystemTime(new Date('2026-02-02T12:00:00Z'));
  });

  it('should return "Just now" for very recent timestamps', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatDate(now)).toBe('Just now');
  });

  it('should return minutes ago for timestamps less than 1 hour', () => {
    const thirtyMinsAgo = Math.floor(Date.now() / 1000) - 30 * 60;
    expect(formatDate(thirtyMinsAgo)).toBe('30m ago');
  });

  it('should return hours ago for timestamps less than 24 hours', () => {
    const fiveHoursAgo = Math.floor(Date.now() / 1000) - 5 * 3600;
    expect(formatDate(fiveHoursAgo)).toBe('5h ago');
  });

  it('should return days ago for timestamps less than 7 days', () => {
    const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
    expect(formatDate(threeDaysAgo)).toBe('3d ago');
  });

  it('should return localized date for timestamps older than 7 days', () => {
    const tenDaysAgo = Math.floor(Date.now() / 1000) - 10 * 86400;
    const result = formatDate(tenDaysAgo);
    // Should be a date string (format varies by locale)
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('should handle string timestamps', () => {
    const dateStr = new Date().toISOString();
    const result = formatDate(dateStr);
    expect(result).toBe('Just now');
  });
});

describe('truncate', () => {
  it('should return original string if shorter than maxLength', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('should return original string if equal to maxLength', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('should truncate and add ellipsis if longer than maxLength', () => {
    expect(truncate('Hello World', 8)).toBe('Hello Wo...');
  });

  it('should handle empty strings', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('formatSessionName', () => {
  it('should return the name if provided', () => {
    expect(formatSessionName('My Session', '123456789012345')).toBe('My Session');
  });

  it('should truncate ID if name is null', () => {
    expect(formatSessionName(null, '123456789012345')).toBe('123456789012...');
  });

  it('should truncate ID if name is empty string', () => {
    expect(formatSessionName('', '123456789012345')).toBe('123456789012...');
  });

  it('should handle short IDs', () => {
    expect(formatSessionName(null, '12345')).toBe('12345');
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"key": "value"}', {});
    expect(result).toEqual({ key: 'value' });
  });

  it('should return fallback for invalid JSON', () => {
    const fallback = { default: true };
    const result = safeJsonParse('invalid json', fallback);
    expect(result).toBe(fallback);
  });

  it('should parse arrays', () => {
    const result = safeJsonParse('[1, 2, 3]', []);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should handle empty strings', () => {
    const fallback = { default: true };
    const result = safeJsonParse('', fallback);
    expect(result).toBe(fallback);
  });
});

describe('debounce', () => {
  it('should debounce function calls', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1');
    debouncedFn('arg2');
    debouncedFn('arg3');

    expect(fn).not.toHaveBeenCalled();

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('arg3');
  });

  it('should call function with latest arguments', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 50);

    debouncedFn(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    debouncedFn(2);
    await new Promise((resolve) => setTimeout(resolve, 30));
    debouncedFn(3);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });
});

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(5242880)).toBe('5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('should handle decimal values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

describe('formatNumber', () => {
  it('should format numbers with commas', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('should handle small numbers', () => {
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(999)).toBe('999');
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle negative numbers', () => {
    expect(formatNumber(-1000)).toBe('-1,000');
  });
});

describe('isDefined', () => {
  it('should return true for defined values', () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined('')).toBe(true);
    expect(isDefined(false)).toBe(true);
    expect(isDefined([])).toBe(true);
    expect(isDefined({})).toBe(true);
  });

  it('should return false for null', () => {
    expect(isDefined(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isDefined(undefined)).toBe(false);
  });

  it('should narrow types correctly', () => {
    const value: string | null = 'test';
    if (isDefined(value)) {
      // TypeScript should know value is string here
      expect(value.toUpperCase()).toBe('TEST');
    }
  });
});
