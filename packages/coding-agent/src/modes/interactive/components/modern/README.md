# Modern UI Components

A set of modern, performant terminal UI components inspired by Claude Code and Codex.

## Design Principles

1. **Minimalist** — Only essential information, no visual clutter
2. **Clear Hierarchy** — Important info stands out, details are subtle
3. **Professional Colors** — Muted palette with high contrast
4. **Responsive** — Adapts to terminal width
5. **Fast** — Minimal allocations, efficient rendering

## Components

### ModernWelcomePanel

Clean, minimal welcome screen that shows only essential information.

```typescript
import { ModernWelcomePanel } from "./components/modern";

const welcome = new ModernWelcomePanel({
  appName: "ai",
  version: "1.0.0",
  cwd: process.cwd(),
  gitBranch: "main",
  sessionName: null,
  modelLabel: "claude-3-sonnet",
  mode: "plan",
  keyText: (binding) => binding.key,
  rawKeyHint: (key, desc) => `${key}: ${desc}`,
  keyHint: (binding, desc) => `${binding.key}: ${desc}`,
});
```

**Features:**
- Minimal ASCII logo
- Mode indicator (Plan/Execute)
- Current directory with git branch
- Model information
- Todo progress (if active)
- Quick start hints

### ModernFooterComponent

Clean, informative status bar with visual hierarchy.

```typescript
import { ModernFooterComponent } from "./components/modern";

const footer = new ModernFooterComponent(session, footerData);
```

**Layout:**
- Left: Path + Branch + Mode badge
- Right: Token stats + Context usage + Model

**Features:**
- Cached token calculations
- Color-coded context usage (green/yellow/red)
- Responsive truncation
- Mode badge with background color

### ModernLoader

Smooth loading animations with multiple styles.

```typescript
import { ModernLoader, SimpleSpinner, ProgressBar } from "./components/modern";

// Spinner with text
const loader = new ModernLoader({
  style: "spinner",
  text: "Loading...",
  showTime: true,
  speed: 80,
});

// Simple spinner
const spinner = new SimpleSpinner("Processing...", "accent");

// Progress bar
const progress = new ProgressBar({
  value: 50,
  maxValue: 100,
  width: 30,
  showPercent: true,
  label: "Downloading:",
});
```

**Styles:**
- `spinner` — Braille dot animation
- `dots` — Block dot animation
- `pulse` — Circle pulse animation
- `minimal` — Simple dot animation

### ModernMessage

Clean message display with type-based styling.

```typescript
import { ModernMessage, ModernToolMessage, ModernUserMessage, ModernAssistantMessage } from "./components/modern";

// User message
const userMsg = new ModernUserMessage("Hello, can you help me?");

// Assistant message
const assistantMsg = new ModernAssistantMessage({
  content: "Of course! What do you need help with?",
  isStreaming: false,
});

// Tool message
const toolMsg = new ModernToolMessage({
  toolName: "read",
  status: "success",
  content: "File contents...",
  duration: 150,
});

// Generic message
const msg = new ModernMessage({
  type: "system",
  content: "Session started",
  showBorder: false,
});
```

**Message Types:**
- `user` — User input
- `assistant` — AI response
- `system` — System messages
- `tool` — Tool execution
- `error` — Error messages
- `success` — Success messages

## Theme

The modern components use the `modern-dark` theme, which provides:

- Muted, professional color palette
- High contrast for readability
- Consistent styling across components
- Dark-first design

To use the modern theme, add it to your theme configuration:

```json
{
  "name": "modern-dark",
  "vars": {
    "cyan": "#22d3ee",
    "blue": "#60a5fa",
    "green": "#4ade80",
    "red": "#f87171",
    "yellow": "#fbbf24",
    "purple": "#c084fc",
    "text": "#e5e7eb",
    "gray": "#9ca3af",
    "dimGray": "#6b7280",
    "darkGray": "#374151",
    "accent": "#818cf8"
  }
}
```

## Performance Optimizations

1. **Cached Calculations** — Footer caches token stats until session changes
2. **Minimal Allocations** — Reuse strings where possible
3. **Efficient Rendering** — Only render visible content
4. **Animation Management** — Automatic start/stop based on visibility
5. **Responsive Truncation** — Graceful degradation at small widths

## Usage Example

```typescript
import {
  ModernWelcomePanel,
  ModernFooterComponent,
  ModernLoader,
  ModernUserMessage,
  ModernAssistantMessage,
} from "./components/modern";

// Create welcome screen
const welcome = new ModernWelcomePanel(inputs);

// Create footer
const footer = new ModernFooterComponent(session, footerData);

// Create loader
const loader = new ModernLoader({
  style: "spinner",
  text: "Thinking...",
  showTime: true,
});
loader.setUpdateCallback(() => requestRender());

// Create messages
const userMsg = new ModernUserMessage("What is the meaning of life?");
const assistantMsg = new ModernAssistantMessage();
assistantMsg.setContent("The meaning of life is 42.");
assistantMsg.setStreaming(false);
```

## Integration

To integrate the modern components into the existing interactive mode:

1. Import the modern components
2. Replace the existing welcome panel and footer
3. Use the modern loader for loading states
4. Apply modern message styling to chat messages

```typescript
import { ModernWelcomePanel, ModernFooterComponent } from "./components/modern";

// In interactive-mode.ts constructor:
this.welcomePanel = new ModernWelcomePanel(welcomeInputs);
this.footer = new ModernFooterComponent(session, footerData);
```

## Backward Compatibility

The modern components are designed to be drop-in replacements for the existing components. They implement the same `Component` interface and can be used interchangeably.

## Future Improvements

- [ ] Add smooth transitions between states
- [ ] Implement keyboard shortcuts for collapsing/expanding
- [ ] Add animation for new messages appearing
- [ ] Support for custom themes
- [ ] Add accessibility features (screen reader support)
