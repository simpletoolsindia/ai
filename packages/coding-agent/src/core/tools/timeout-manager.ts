/**
 * Tool Execution Timeout Manager
 *
 * Provides configurable timeouts for tool execution to prevent infinite hangs.
 * Supports per-tool timeouts, global timeouts, and graceful cancellation.
 */

import { EventEmitter } from "events";

/**
 * Timeout configuration for a specific tool
 */
export interface ToolTimeoutConfig {
	/** Tool name */
	toolName: string;
	/** Timeout in milliseconds */
	timeoutMs: number;
	/** Whether to kill the process on timeout */
	killOnTimeout?: boolean;
	/** Custom error message on timeout */
	timeoutMessage?: string;
	/** Callback when timeout occurs */
	onTimeout?: (toolName: string, timeoutMs: number) => void;
}

/**
 * Global timeout configuration
 */
export interface GlobalTimeoutConfig {
	/** Default timeout for all tools in milliseconds */
	defaultTimeoutMs: number;
	/** Maximum timeout allowed in milliseconds */
	maxTimeoutMs: number;
	/** Minimum timeout allowed in milliseconds */
	minTimeoutMs: number;
	/** Whether to enable timeouts by default */
	enabled: boolean;
	/** Grace period before force kill in milliseconds */
	gracePeriodMs: number;
}

/**
 * Default timeout configuration
 */
const DEFAULT_GLOBAL_CONFIG: GlobalTimeoutConfig = {
	defaultTimeoutMs: 120000, // 2 minutes
	maxTimeoutMs: 600000, // 10 minutes
	minTimeoutMs: 1000, // 1 second
	enabled: true,
	gracePeriodMs: 5000, // 5 seconds
};

/**
 * Default tool-specific timeouts
 */
const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
	// Quick tools (30 seconds)
	read: 30000,
	write: 30000,
	edit: 30000,
	ls: 30000,
	find: 30000,
	grep: 30000,

	// Medium tools (2 minutes)
	bash: 120000,
	test: 120000,

	// Long-running tools (5 minutes)
	webfetch: 300000,
	websearch: 300000,

	// Very long-running tools (10 minutes)
	subagent: 600000,
};

/**
 * Timeout state for a running tool
 */
interface TimeoutState {
	toolName: string;
	timeoutMs: number;
	startTime: number;
	timer: NodeJS.Timeout | null;
	abortController: AbortController;
	cancelled: boolean;
}

/**
 * Tool Execution Timeout Manager
 */
export class ToolTimeoutManager extends EventEmitter {
	private config: GlobalTimeoutConfig;
	private toolTimeouts: Map<string, number> = new Map();
	private activeTimeouts: Map<string, TimeoutState> = new Map();
	private enabled: boolean;

	constructor(config?: Partial<GlobalTimeoutConfig>) {
		super();
		this.config = { ...DEFAULT_GLOBAL_CONFIG, ...config };
		this.enabled = this.config.enabled;

		// Load default tool timeouts
		for (const [tool, timeout] of Object.entries(DEFAULT_TOOL_TIMEOUTS)) {
			this.toolTimeouts.set(tool, timeout);
		}
	}

	/**
	 * Enable or disable timeouts
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/**
	 * Check if timeouts are enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Set timeout for a specific tool
	 */
	setToolTimeout(toolName: string, timeoutMs: number): void {
		const clampedTimeout = Math.max(this.config.minTimeoutMs, Math.min(this.config.maxTimeoutMs, timeoutMs));
		this.toolTimeouts.set(toolName, clampedTimeout);
	}

	/**
	 * Get timeout for a specific tool
	 */
	getToolTimeout(toolName: string): number {
		return this.toolTimeouts.get(toolName) || this.config.defaultTimeoutMs;
	}

	/**
	 * Start timeout tracking for a tool execution
	 */
	startTimeout(
		toolName: string,
		customTimeoutMs?: number,
	): {
		signal: AbortSignal;
		clearTimeout: () => void;
	} {
		if (!this.enabled) {
			return {
				signal: new AbortController().signal,
				clearTimeout: () => {},
			};
		}

		const timeoutMs = customTimeoutMs || this.getToolTimeout(toolName);
		const abortController = new AbortController();

		const state: TimeoutState = {
			toolName,
			timeoutMs,
			startTime: Date.now(),
			timer: null,
			abortController,
			cancelled: false,
		};

		// Set the timeout timer
		state.timer = setTimeout(() => {
			this.handleTimeout(state);
		}, timeoutMs);

		// Store the active timeout
		const timeoutId = `${toolName}-${Date.now()}`;
		this.activeTimeouts.set(timeoutId, state);

		// Return signal and cleanup function
		return {
			signal: abortController.signal,
			clearTimeout: () => {
				this.clearTimeout(timeoutId);
			},
		};
	}

	/**
	 * Handle timeout occurrence
	 */
	private handleTimeout(state: TimeoutState): void {
		if (state.cancelled) return;

		const elapsed = Date.now() - state.startTime;
		const message = `Tool "${state.toolName}" timed out after ${elapsed}ms (limit: ${state.timeoutMs}ms)`;

		// Emit timeout event
		this.emit("timeout", {
			toolName: state.toolName,
			timeoutMs: state.timeoutMs,
			elapsedMs: elapsed,
			message,
		});

		// Abort the tool execution
		state.abortController.abort();

		// Set grace period for force kill
		setTimeout(() => {
			if (!state.cancelled) {
				this.emit("forceKill", {
					toolName: state.toolName,
					message: `Force killing tool "${state.toolName}" after grace period`,
				});
			}
		}, this.config.gracePeriodMs);
	}

	/**
	 * Clear a specific timeout
	 */
	private clearTimeout(timeoutId: string): void {
		const state = this.activeTimeouts.get(timeoutId);
		if (state) {
			state.cancelled = true;
			if (state.timer) {
				clearTimeout(state.timer);
				state.timer = null;
			}
			this.activeTimeouts.delete(timeoutId);
		}
	}

	/**
	 * Clear all active timeouts
	 */
	clearAllTimeouts(): void {
		for (const [timeoutId] of this.activeTimeouts) {
			this.clearTimeout(timeoutId);
		}
	}

	/**
	 * Get active timeout count
	 */
	getActiveTimeoutCount(): number {
		return this.activeTimeouts.size;
	}

	/**
	 * Get timeout statistics
	 */
	getStats(): {
		activeTimeouts: number;
		toolTimeouts: Record<string, number>;
		enabled: boolean;
	} {
		const toolTimeouts: Record<string, number> = {};
		for (const [tool, timeout] of this.toolTimeouts) {
			toolTimeouts[tool] = timeout;
		}

		return {
			activeTimeouts: this.activeTimeouts.size,
			toolTimeouts,
			enabled: this.enabled,
		};
	}

	/**
	 * Update global configuration
	 */
	updateConfig(config: Partial<GlobalTimeoutConfig>): void {
		this.config = { ...this.config, ...config };

		// Clamp existing tool timeouts
		for (const [tool, timeout] of this.toolTimeouts) {
			this.toolTimeouts.set(tool, Math.max(this.config.minTimeoutMs, Math.min(this.config.maxTimeoutMs, timeout)));
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): GlobalTimeoutConfig {
		return { ...this.config };
	}
}

/**
 * Create a timeout-aware wrapper for tool execution
 */
export function withTimeout<T>(
	fn: () => Promise<T>,
	timeoutMs: number,
	options?: {
		toolName?: string;
		onTimeout?: () => void;
		killOnTimeout?: boolean;
	},
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			const message = options?.toolName
				? `Tool "${options.toolName}" timed out after ${timeoutMs}ms`
				: `Operation timed out after ${timeoutMs}ms`;

			options?.onTimeout?.();

			if (options?.killOnTimeout) {
				reject(new Error(`TIMEOUT_KILL: ${message}`));
			} else {
				reject(new Error(`TIMEOUT: ${message}`));
			}
		}, timeoutMs);

		fn()
			.then((result) => {
				clearTimeout(timer);
				resolve(result);
			})
			.catch((error) => {
				clearTimeout(timer);
				reject(error);
			});
	});
}

/**
 * Create an abort signal that fires after a timeout
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
	const controller = new AbortController();
	setTimeout(() => controller.abort(), timeoutMs);
	return controller.signal;
}

/**
 * Race a promise against a timeout
 */
export function raceTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage?: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			setTimeout(() => {
				reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		}),
	]);
}

/**
 * Delay with abort signal support
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}

		const timer = setTimeout(resolve, ms);

		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("Operation aborted"));
			},
			{ once: true },
		);
	});
}

/**
 * Global timeout manager instance
 */
export const globalTimeoutManager = new ToolTimeoutManager();
