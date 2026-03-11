# Frontend Testing Guide

## Overview

The frontend uses **Vitest** (Vite's native test runner) with **React Testing Library** for comprehensive unit testing.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with UI (visual test runner)
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

Tests are co-located with their source files using the `.test.ts` or `.test.tsx` extension:

```
src/
├── utils/
│   ├── helpers.ts
│   ├── helpers.test.ts          # Tests for helpers
│   ├── api.ts
│   └── api.test.ts              # Tests for API utilities
├── store/
│   ├── chatStore.ts
│   ├── chatStore.test.ts        # Tests for chat store
│   ├── statsStore.ts
│   └── statsStore.test.ts       # Tests for stats store
└── test/
    └── setup.ts                 # Global test setup
```

## What's Tested

### ✅ Utility Functions (`utils/helpers.test.ts`)
- **formatDate**: Time-relative date formatting (34 tests)
- **truncate**: String truncation with ellipsis
- **formatSessionName**: Session name display logic
- **safeJsonParse**: Safe JSON parsing with fallbacks
- **debounce**: Function debouncing
- **formatBytes**: Human-readable byte formatting
- **formatNumber**: Number formatting with commas
- **isDefined**: Type-safe null/undefined checks

### ✅ Store Logic (`store/*.test.ts`)
- **chatStore** (16 tests):
  - Adding messages (user/assistant)
  - Updating messages
  - Setting/clearing messages
  - Streaming content management

- **statsStore** (14 tests):
  - Message count tracking
  - Latency accumulation
  - Stage-specific latencies
  - State log management
  - Stats reset

### ✅ API Utilities (`utils/api.test.ts`)
- **stripAvatarTags** (9 tests):
  - Removing mood tags
  - Removing animation tags
  - Handling multiple tags
  - Edge cases (empty strings, null values)

## Test Coverage

Current coverage: **73 tests** across 4 test suites

Key areas covered:
- ✅ All helper utilities
- ✅ Store state management
- ✅ API utility functions
- ⏳ Hooks (can be added as needed)
- ⏳ Components (can be added as needed)

## Writing Tests

### Example: Testing a Helper Function

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myModule';

describe('myFunction', () => {
  it('should do something specific', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });

  it('should handle edge cases', () => {
    expect(myFunction('')).toBe('');
    expect(myFunction(null)).toBe(null);
  });
});
```

### Example: Testing a Store

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMyStore } from './myStore';

describe('myStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useMyStore.setState({ data: [] });
  });

  it('should add data', () => {
    const store = useMyStore.getState();
    store.addItem('test');

    expect(useMyStore.getState().data).toHaveLength(1);
  });
});
```

## Best Practices

1. **Co-locate tests**: Keep test files next to the code they test
2. **Descriptive names**: Use clear test descriptions
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Reset state**: Use `beforeEach` to reset state between tests
5. **Test edge cases**: Include null, undefined, empty values
6. **Mock external deps**: Mock API calls, browser APIs, etc.

## Continuous Integration

Tests should be run:
- ✅ Before every commit
- ✅ In CI/CD pipeline
- ✅ Before deployment

Add to your CI workflow:
```yaml
- run: npm test
- run: npm run test:coverage
```

## Adding More Tests

To add tests for new functionality:

1. Create a `*.test.ts` file next to the source file
2. Import the functions/components to test
3. Write descriptive test cases
4. Run `npm test` to verify
5. Check coverage with `npm run test:coverage`

## Useful Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
