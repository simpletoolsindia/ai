/**
 * Modern footer component — clean, informative status bar.
 *
 * Design principles:
 * 1. Information density - show what matters, hide the rest
 * 2. Visual hierarchy - most important info on left, details on right
 * 3. Context-aware - adapts to terminal width
 * 4. Performance - minimal allocations, cached calculations
 */

import { isAbsolute, relative, resolve, sep } from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@simpletoolsindiaorg/ai-tui";
import type { AgentSession } from "../../../core/agent-session.ts";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.ts";
import { theme } from "../theme/theme.ts";

/**
 * Sanitize text for display in a single-line status.
 */
function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Format token counts for compact footer display.
 */
function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

/**
 * Format cost for display.
 */
function formatCost(cost: number, isSubscription: boolean): string {
	const costStr = `$${cost.toFixed(2)}`;
	return isSubscription ? `${costStr} (sub)` : costStr;
}

export function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

interface TokenStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	cacheHitRate: number | undefined;
}

/**
 * Modern footer component with clean visual hierarchy.
 */
export class ModernFooterComponent implements Component {
	private autoCompactEnabled = true;
	private session: AgentSession;
	private footerData: ReadonlyFooterDataProvider;
	private cachedStats: TokenStats | null = null;
	private statsVersion = -1;

	constructor(session: AgentSession, footerData: ReadonlyFooterDataProvider) {
		this.session = session;
		this.footerData = footerData;
	}

	setSession(session: AgentSession): void {
		this.session = session;
		this.cachedStats = null;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.autoCompactEnabled = enabled;
	}

	invalidate(): void {
		this.cachedStats = null;
	}

	dispose(): void {
		// No-op
	}

	private calculateStats(): TokenStats {
		// Check if we need to recalculate
		const currentVersion = this.session.sessionManager.getVersion?.() ?? 0;
		if (this.cachedStats && this.statsVersion === currentVersion) {
			return this.cachedStats;
		}

		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCacheWrite = 0;
		let totalCost = 0;
		let latestCacheHitRate: number | undefined;

		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
				totalCacheRead += entry.message.usage.cacheRead;
				totalCacheWrite += entry.message.usage.cacheWrite;
				totalCost += entry.message.usage.cost.total;

				const latestPromptTokens =
					entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
				latestCacheHitRate =
					latestPromptTokens > 0 ? (entry.message.usage.cacheRead / latestPromptTokens) * 100 : undefined;
			}
		}

		this.cachedStats = {
			input: totalInput,
			output: totalOutput,
			cacheRead: totalCacheRead,
			cacheWrite: totalCacheWrite,
			cost: totalCost,
			cacheHitRate: latestCacheHitRate,
		};
		this.statsVersion = currentVersion;

		return this.cachedStats;
	}

	render(width: number): string[] {
		const state = this.session.state;
		const stats = this.calculateStats();

		// Calculate context usage
		const contextUsage = this.session.getContextUsage();
		const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
		const contextPercentValue = contextUsage?.percent ?? 0;
		const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(0) : "?";

		// Left side: path + branch + mode
		let leftSide = "";

		// Path
		const pwd = formatCwdForFooter(this.session.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
		leftSide += theme.fg("text", pwd);

		// Branch
		const branch = this.footerData.getGitBranch();
		if (branch) {
			leftSide += theme.fg("dim", ` (${branch})`);
		}

		// Mode badge
		const mode = this.session.getMode();
		const modeBadge =
			mode === "plan"
				? theme.bg("warning", theme.fg("text", " PLAN "))
				: theme.bg("success", theme.fg("text", " EXECUTE "));
		leftSide += ` ${modeBadge}`;

		// Right side: stats + model
		let rightSide = "";

		// Token stats - compact format
		const statParts: string[] = [];
		if (stats.input > 0) statParts.push(`↑${formatTokens(stats.input)}`);
		if (stats.output > 0) statParts.push(`↓${formatTokens(stats.output)}`);
		if (stats.cacheRead > 0) statParts.push(`R${formatTokens(stats.cacheRead)}`);

		// Context usage - color coded
		let contextStr: string;
		const autoIndicator = this.autoCompactEnabled ? "" : "";
		if (contextPercent === "?") {
			contextStr = `?/${formatTokens(contextWindow)}`;
		} else {
			contextStr = `${contextPercent}%/${formatTokens(contextWindow)}`;
		}

		if (contextPercentValue > 90) {
			statParts.push(theme.fg("error", contextStr));
		} else if (contextPercentValue > 70) {
			statParts.push(theme.fg("warning", contextStr));
		} else {
			statParts.push(theme.fg("dim", contextStr));
		}

		// Cost
		if (stats.cost > 0 || (state.model && this.session.modelRegistry.isUsingOAuth(state.model))) {
			const usingSub = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;
			statParts.push(theme.fg("muted", formatCost(stats.cost, usingSub)));
		}

		rightSide = statParts.join(theme.fg("dim", " "));

		// Model name - rightmost
		const modelName = state.model?.id || "no-model";
		const modelDisplay = theme.fg("muted", modelName);

		// Calculate layout
		const leftWidth = visibleWidth(leftSide);
		const rightWidth = visibleWidth(rightSide);
		const modelWidth = visibleWidth(modelDisplay);
		const separator = theme.fg("dim", " │ ");

		// Calculate available space
		const totalRightWidth = rightWidth + visibleWidth(separator) + modelWidth;
		const availableForLeft = width - totalRightWidth - 2; // 2 for padding

		// Truncate left side if needed
		let finalLeft = leftSide;
		if (leftWidth > availableForLeft && availableForLeft > 10) {
			finalLeft = truncateToWidth(leftSide, availableForLeft, "...");
		}

		// Build final line
		const padding = Math.max(1, width - visibleWidth(finalLeft) - totalRightWidth);
		const line = finalLeft + " ".repeat(padding) + rightSide + separator + modelDisplay;

		// Ensure we don't exceed width
		if (visibleWidth(line) > width) {
			return [truncateToWidth(line, width, "...")];
		}

		return [line];
	}
}
