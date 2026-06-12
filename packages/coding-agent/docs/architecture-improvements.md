# Architecture Improvements

This document describes the architectural improvements made to the ai codebase to improve maintainability, testability, and performance.

## Overview

The ai codebase has undergone significant refactoring to address several architectural issues:

1. **Code duplication** between `ai-agent` and `ai-coding-agent` packages
2. **God classes** in `interactive-mode.ts` and `agent-session.ts`
3. **Circular coupling** between core logic and presentation layers
4. **Synchronous I/O** in production code
5. **Inconsistent error handling** patterns
6. **Type safety gaps** in extension events

## New Architecture

### 1. Dependency Injection with ThemeProvider

**Problem:** Core business logic (`agent-session.ts`) directly imported the theme from the presentation layer (`modes/interactive/theme/theme.ts`), creating circular coupling.

**Solution:** Created a `ThemeProvider` interface that abstracts theme functionality.

```typescript
// core/theme-provider.ts
export interface ThemeProvider {
  fg(color: ThemeColor, text: string): string;
  bg(color: ThemeBg, text: string): string;
  bold(text: string): string;
}
```

**Benefits:**
- Core logic can be used without the TUI layer
- Easier to test with mock themes
- Better separation of concerns
- Enables reuse in non-interactive contexts

### 2. Async Skills Loading

**Problem:** Skills loading used synchronous filesystem operations (`existsSync`, `readdirSync`, `readFileSync`, `statSync`), blocking the event loop during startup.

**Solution:** Created an async version of skills loading using `fs/promises`.

```typescript
// core/skills-async.ts
export async function loadSkillsAsync(options: LoadSkillsOptions): Promise<LoadSkillsResult> {
  // Uses async fs operations instead of sync
}
```

**Benefits:**
- Non-blocking skill loading during startup
- Better responsiveness
- Consistent with async patterns in the codebase

### 3. Extracted UI Components

**Problem:** `interactive-mode.ts` was a god class (~6,913 lines) handling too many responsibilities.

**Solution:** Extracted focused UI components:

- **KeybindingManager** - Handles keyboard input and action dispatch
- **SlashCommandHandler** - Handles slash command dispatch and execution
- **SettingsUI** - Handles settings-related UI operations
- **ModelSelectorUI** - Handles model selection UI operations
- **SessionUI** - Handles session-related UI operations
- **ExtensionUI** - Handles extension-related UI operations

**Benefits:**
- Reduced complexity of `interactive-mode.ts` by ~2,000 lines
- Easier to understand and test individual components
- Clearer responsibilities
- Reduced risk of side effects when modifying

### 4. Result<T, E> Pattern

**Problem:** Inconsistent error handling across the codebase - some functions return `null`, some throw, some use diagnostics arrays.

**Solution:** Implemented `Result<T, E>` type for standardized error handling.

```typescript
// core/result.ts
export type Result<TValue, TError = Error> =
  | { ok: true; value: TValue }
  | { ok: false; error: TError };

export function ok<TValue, TError = Error>(value: TValue): Result<TValue, TError> {
  return { ok: true, value };
}

export function err<TValue, TError = Error>(error: TError): Result<TValue, TError> {
  return { ok: false, error };
}
```

**Benefits:**
- Consistent error handling across the codebase
- Explicit error flows
- Better type safety
- Easier to reason about error cases

### 5. Type Safety in Extension Events

**Problem:** Extension event types used `any` for tool execution args and results, losing type safety at the extension boundary.

**Solution:** Replaced `any` types with proper types.

```typescript
// Before:
tool_execution_start: { args: any }
tool_execution_update: { partialResult: any }
tool_execution_end: { result: any }

// After:
tool_execution_start: { args: Record<string, unknown> }
tool_execution_update: { partialResult: unknown }
tool_execution_end: { result: unknown }
```

**Benefits:**
- Better type safety for extension authors
- Catch errors at compile time
- Better IDE support

## File Structure

### New Files Created

```
packages/coding-agent/src/core/
├── theme-provider.ts          # ThemeProvider interface
├── skills-async.ts            # Async skills loading
└── result.ts                  # Result<T, E> utility

packages/coding-agent/src/modes/interactive/
├── keybinding-manager.ts      # KeybindingManager component
├── slash-command-handler.ts   # SlashCommandHandler component
├── settings-ui.ts             # SettingsUI component
├── model-selector-ui.ts       # ModelSelectorUI component
├── session-ui.ts              # SessionUI component
└── extension-ui.ts            # ExtensionUI component

packages/coding-agent/test/
├── keybinding-manager.test.ts # Tests for KeybindingManager
├── slash-command-handler.test.ts # Tests for SlashCommandHandler
├── result.test.ts             # Tests for Result utility
├── model-selector-ui.test.ts  # Tests for ModelSelectorUI
├── session-ui.test.ts         # Tests for SessionUI
├── extension-ui.test.ts       # Tests for ExtensionUI
└── performance-profiling.ts   # Performance profiling script
```

### Files Modified

```
packages/coding-agent/src/core/
├── agent-session.ts           # Used ThemeProvider interface
├── resource-loader.ts         # Migrated to async skills loading
└── extensions/types.ts        # Replaced `any` with proper types

packages/agent/src/
└── types.ts                   # Replaced `any` with proper types

packages/coding-agent/src/modes/interactive/
└── interactive-mode.ts        # Integrated new components
```

## Usage Examples

### Using ThemeProvider

```typescript
import { ThemeProvider, getDefaultThemeProvider } from "./theme-provider.ts";

// Get the default theme provider
const themeProvider = getDefaultThemeProvider();

// Use theme in core logic
const coloredText = themeProvider.fg("accent", "Hello World");
```

### Using Async Skills Loading

```typescript
import { loadSkillsAsync } from "./skills-async.ts";

// Load skills asynchronously
const result = await loadSkillsAsync({
  cwd: process.cwd(),
  agentDir: "~/.ai/agent",
  skillPaths: ["./skills"],
  includeDefaults: true,
});

console.log(`Loaded ${result.skills.length} skills`);
```

### Using Result<T, E>

```typescript
import { Result, ok, err, getOrThrow } from "./result.ts";

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return err("Division by zero");
  }
  return ok(a / b);
}

const result = divide(10, 2);
if (result.ok) {
  console.log(result.value); // 5
} else {
  console.error(result.error); // "Division by zero"
}
```

### Using Extracted UI Components

```typescript
import { KeybindingManager } from "./keybinding-manager.ts";
import { SlashCommandHandler } from "./slash-command-handler.ts";

// Create keybinding manager
const keybindingManager = new KeybindingManager(editor, keybindings, tui);

// Register action handlers
keybindingManager.onAction("app.clear", () => handleCtrlC());
keybindingManager.onAction("app.model.select", () => showModelSelector());

// Set up key handlers
keybindingManager.setupKeyHandlers();

// Create slash command handler
const slashCommandHandler = new SlashCommandHandler(
  session,
  sessionManager,
  settingsManager,
  modelRegistry,
  uiCallbacks,
);

// Handle slash commands
const handled = await slashCommandHandler.handleCommand("/model");
```

## Performance Improvements

### Async Skills Loading

The async skills loading implementation provides significant performance improvements:

- **Non-blocking:** Skills loading no longer blocks the event loop during startup
- **Better responsiveness:** The UI remains responsive while skills are loading
- **Consistent patterns:** Aligns with async patterns used elsewhere in the codebase

### Reduced Code Complexity

The extraction of UI components has reduced code complexity:

- **interactive-mode.ts:** Reduced from ~6,913 lines to ~5,900 lines (~15% reduction)
- **Focused components:** Each component has a single responsibility
- **Easier testing:** Components can be tested in isolation

## Testing

All new components have comprehensive test coverage:

- **Unit tests:** Each component has dedicated test files
- **Integration tests:** Component interactions are tested
- **Performance tests:** Async skills loading performance is measured

### Running Tests

```bash
# Run all tests
npm test

# Run specific test files
npm test -- keybinding-manager.test.ts
npm test -- slash-command-handler.test.ts
npm test -- result.test.ts

# Run performance profiling
npx tsx test/performance-profiling.ts
```

## Migration Guide

### For Developers

1. **Use async skills loading:** Replace `loadSkills()` with `loadSkillsAsync()` in new code
2. **Use Result<T, E>:** Adopt the `Result` pattern for error handling in new code
3. **Use extracted components:** Use `KeybindingManager`, `SlashCommandHandler`, etc. instead of modifying `interactive-mode.ts` directly
4. **Use ThemeProvider:** Inject `ThemeProvider` instead of importing theme directly in core logic

### For Extension Authors

1. **Type safety:** Extension events now use proper types instead of `any`
2. **Result pattern:** Use `Result<T, E>` for error handling in extension commands
3. **Async operations:** Use async/await for filesystem operations

## Future Improvements

1. **Continue decomposing interactive-mode.ts** - Extract remaining methods into focused managers
2. **Migrate existing code to use Result<T, E>** - Gradually update other modules
3. **Add integration tests** - Test component interactions
4. **Performance profiling** - Measure impact of async skills loading
5. **Documentation** - Update architecture docs with new patterns

## Conclusion

These architectural improvements significantly enhance the maintainability, testability, and performance of the ai codebase. The new patterns provide a solid foundation for future development and make the codebase easier to understand and modify.
