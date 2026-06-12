/**
 * Local Model Optimizer
 *
 * Optimizations for local LLM models (Ollama, LM Studio, vLLM, etc.)
 * to improve performance and reduce latency.
 */

import type { Api, Model } from "../types.ts";

/**
 * Local model configuration with performance tuning options
 */
export interface LocalModelConfig {
	/** Keep model loaded in memory after request (e.g., "30m", "1h") */
	keepAlive?: string;
	/** Context window size in tokens */
	numCtx?: number;
	/** Number of GPU layers to offload */
	numGpu?: number;
	/** Number of CPU threads */
	numThread?: number;
	/** Request timeout in milliseconds */
	requestTimeoutMs?: number;
	/** Enable connection pooling */
	enablePooling?: boolean;
	/** Maximum concurrent requests */
	maxConcurrentRequests?: number;
}

/**
 * Default configuration for local models
 */
const DEFAULT_LOCAL_CONFIG: LocalModelConfig = {
	keepAlive: "30m",
	numCtx: 2048,
	requestTimeoutMs: 300000, // 5 minutes
	enablePooling: true,
	maxConcurrentRequests: 4,
};

/**
 * Connection pool for local model servers
 */
class ConnectionPool {
	private pools: Map<
		string,
		{
			active: number;
			maxConcurrent: number;
			queue: Array<() => void>;
		}
	> = new Map();

	/**
	 * Acquire a connection slot for a server
	 */
	async acquire(serverUrl: string, maxConcurrent: number): Promise<void> {
		let pool = this.pools.get(serverUrl);
		if (!pool) {
			pool = { active: 0, maxConcurrent, queue: [] };
			this.pools.set(serverUrl, pool);
		}

		if (pool.active < pool.maxConcurrent) {
			pool.active++;
			return;
		}

		// Wait for a slot to become available
		return new Promise<void>((resolve) => {
			pool!.queue.push(resolve);
		});
	}

	/**
	 * Release a connection slot
	 */
	release(serverUrl: string): void {
		const pool = this.pools.get(serverUrl);
		if (!pool) return;

		if (pool.queue.length > 0) {
			const next = pool.queue.shift()!;
			next();
		} else {
			pool.active--;
		}
	}

	/**
	 * Get pool statistics
	 */
	getStats(serverUrl: string): { active: number; queued: number } {
		const pool = this.pools.get(serverUrl);
		if (!pool) return { active: 0, queued: 0 };
		return { active: pool.active, queued: pool.queue.length };
	}
}

// Global connection pool
const connectionPool = new ConnectionPool();

/**
 * Check if a model is a local model
 */
export function isLocalModel(model: Model<Api>): boolean {
	const localProviders = ["ollama", "lmstudio", "vllm", "mlx", "mlx-openai", "vllm-mlx", "local"];
	const localUrls = ["localhost", "127.0.0.1", "0.0.0.0"];

	return localProviders.includes(model.provider) || localUrls.some((url) => model.baseUrl?.includes(url));
}

/**
 * Get optimized configuration for a local model
 */
export function getLocalModelConfig(model: Model<Api>): LocalModelConfig {
	if (!isLocalModel(model)) {
		return {};
	}

	const config = { ...DEFAULT_LOCAL_CONFIG };

	// Override with model-specific settings if available
	if (model.contextWindow && model.contextWindow < config.numCtx!) {
		config.numCtx = model.contextWindow;
	}

	return config;
}

/**
 * Apply local model optimizations to request parameters
 */
export function applyLocalModelOptimizations(
	params: Record<string, unknown>,
	model: Model<Api>,
	config?: LocalModelConfig,
): Record<string, unknown> {
	if (!isLocalModel(model)) {
		return params;
	}

	const localConfig = config || getLocalModelConfig(model);
	const optimized = { ...params };

	// Apply keep_alive to prevent cold starts
	if (localConfig.keepAlive) {
		optimized.keep_alive = localConfig.keepAlive;
	}

	// Apply context window size
	if (localConfig.numCtx) {
		optimized.num_ctx = localConfig.numCtx;
	}

	// Apply GPU layers
	if (localConfig.numGpu) {
		optimized.num_gpu = localConfig.numGpu;
	}

	// Apply CPU threads
	if (localConfig.numThread) {
		optimized.num_thread = localConfig.numThread;
	}

	return optimized;
}

/**
 * Create a timeout-aware fetch wrapper for local models
 */
export function createLocalModelFetch(
	baseUrl: string,
	timeoutMs: number = DEFAULT_LOCAL_CONFIG.requestTimeoutMs!,
): typeof fetch {
	return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(input, {
				...init,
				signal: controller.signal,
			});
			return response;
		} finally {
			clearTimeout(timeoutId);
		}
	};
}

/**
 * Acquire a connection slot for a local model server
 */
export async function acquireConnection(serverUrl: string, maxConcurrent?: number): Promise<void> {
	const config = getLocalModelConfig({ baseUrl: serverUrl } as Model<Api>);
	await connectionPool.acquire(serverUrl, maxConcurrent || config.maxConcurrentRequests || 4);
}

/**
 * Release a connection slot for a local model server
 */
export function releaseConnection(serverUrl: string): void {
	connectionPool.release(serverUrl);
}

/**
 * Get connection pool statistics
 */
export function getConnectionStats(serverUrl: string): { active: number; queued: number } {
	return connectionPool.getStats(serverUrl);
}

/**
 * Optimize message history for local models
 * Reduces context window usage by removing old messages
 */
export function optimizeMessageHistory(
	messages: Array<{ role: string; content: string }>,
	maxTokens: number = 2048,
): Array<{ role: string; content: string }> {
	if (messages.length <= 2) {
		return messages;
	}

	// Estimate tokens (rough: 1 token ≈ 4 characters)
	const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

	// Keep system message and recent messages
	const systemMessages = messages.filter((m) => m.role === "system");
	const nonSystemMessages = messages.filter((m) => m.role !== "system");

	// Calculate current token usage
	let currentTokens = systemMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

	// Keep most recent messages that fit within context window
	const optimized: Array<{ role: string; content: string }> = [...systemMessages];

	for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
		const message = nonSystemMessages[i];
		const messageTokens = estimateTokens(message.content);

		if (currentTokens + messageTokens <= maxTokens) {
			optimized.splice(systemMessages.length, 0, message);
			currentTokens += messageTokens;
		} else {
			break;
		}
	}

	return optimized;
}

/**
 * Create a request queue for local models
 * Prevents overwhelming local servers with too many concurrent requests
 */
export class RequestQueue {
	private queue: Array<() => Promise<unknown>> = [];
	private processing = false;
	private maxConcurrent: number;
	private activeCount = 0;

	constructor(maxConcurrent: number = 4) {
		this.maxConcurrent = maxConcurrent;
	}

	/**
	 * Add a request to the queue
	 */
	async enqueue<T>(request: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push(async () => {
				try {
					const result = await request();
					resolve(result);
				} catch (error) {
					reject(error);
				}
			});

			this.processQueue();
		});
	}

	/**
	 * Process the queue
	 */
	private async processQueue(): Promise<void> {
		if (this.processing || this.activeCount >= this.maxConcurrent) {
			return;
		}

		this.processing = true;

		while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
			const request = this.queue.shift();
			if (request) {
				this.activeCount++;
				request().finally(() => {
					this.activeCount--;
					this.processQueue();
				});
			}
		}

		this.processing = false;
	}

	/**
	 * Get queue statistics
	 */
	getStats(): { queued: number; active: number } {
		return { queued: this.queue.length, active: this.activeCount };
	}
}

// Global request queue for local models
export const localModelQueue = new RequestQueue(DEFAULT_LOCAL_CONFIG.maxConcurrentRequests);
