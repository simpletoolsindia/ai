/**
 * ThemeProvider interface for dependency injection.
 *
 * This interface abstracts theme functionality so core business logic
 * doesn't depend directly on the interactive mode's theme implementation.
 * This enables:
 * - Testing with mock themes
 * - Using core logic in non-interactive contexts
 * - Better separation of concerns
 */

/**
 * Theme color names used in the application.
 */
export type ThemeColor =
	| "accent"
	| "border"
	| "borderAccent"
	| "borderMuted"
	| "success"
	| "error"
	| "warning"
	| "muted"
	| "dim"
	| "text"
	| "thinkingText"
	| "userMessageText"
	| "customMessageText"
	| "customMessageLabel"
	| "toolTitle"
	| "toolOutput"
	| "mdHeading"
	| "mdLink"
	| "mdLinkUrl"
	| "mdCode"
	| "mdCodeBlock"
	| "mdCodeBlockBorder"
	| "mdQuote"
	| "mdQuoteBorder"
	| "mdHr"
	| "mdListBullet"
	| "toolDiffAdded"
	| "toolDiffRemoved"
	| "toolDiffContext"
	| "syntaxComment"
	| "syntaxKeyword"
	| "syntaxFunction"
	| "syntaxVariable"
	| "syntaxString"
	| "syntaxNumber"
	| "syntaxType"
	| "syntaxOperator"
	| "syntaxPunctuation"
	| "thinkingOff"
	| "thinkingMinimal"
	| "thinkingLow"
	| "thinkingMedium"
	| "thinkingHigh"
	| "thinkingXhigh"
	| "bashMode";

/**
 * Theme background color names used in the application.
 */
export type ThemeBg =
	| "selectedBg"
	| "userMessageBg"
	| "customMessageBg"
	| "toolPendingBg"
	| "toolSuccessBg"
	| "toolErrorBg";

/**
 * Interface for theme functionality.
 * This is the minimal interface needed by core business logic.
 */
export interface ThemeProvider {
	/**
	 * Apply foreground color to text.
	 * @param color - Theme color name
	 * @param text - Text to colorize
	 * @returns Colorized text string
	 */
	fg(color: ThemeColor, text: string): string;

	/**
	 * Apply background color to text.
	 * @param color - Theme background color name
	 * @param text - Text to colorize
	 * @returns Colorized text string
	 */
	bg(color: ThemeBg, text: string): string;

	/**
	 * Make text bold.
	 * @param text - Text to make bold
	 * @returns Bold text string
	 */
	bold(text: string): string;
}

/**
 * No-op theme provider that returns text without any styling.
 * Useful for testing or non-interactive contexts where theme is not needed.
 */
export class NoOpThemeProvider implements ThemeProvider {
	fg(_color: ThemeColor, text: string): string {
		return text;
	}

	bg(_color: ThemeBg, text: string): string {
		return text;
	}

	bold(text: string): string {
		return text;
	}
}

/**
 * Default theme provider instance that can be used as a fallback.
 * In production, this should be replaced with the actual theme from interactive mode.
 */
let defaultThemeProvider: ThemeProvider = new NoOpThemeProvider();

/**
 * Set the default theme provider.
 * This should be called during application initialization with the actual theme.
 */
export function setDefaultThemeProvider(provider: ThemeProvider): void {
	defaultThemeProvider = provider;
}

/**
 * Get the current default theme provider.
 */
export function getDefaultThemeProvider(): ThemeProvider {
	return defaultThemeProvider;
}
