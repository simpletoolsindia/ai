/**
 * Async Utilities
 * 
 * Provides utilities for parallel execution, non-blocking IO,
 * and async operation management.
 */

/**
 * Execute tasks in parallel with concurrency limit
 */
export async function parallelLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = 4
): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();
  
  for (const task of tasks) {
    const promise = task().then((result) => {
      results.push(result);
    });
    
    const wrappedPromise = promise.then(() => {
      executing.delete(wrappedPromise);
    });
    
    executing.add(wrappedPromise);
    
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  await Promise.all(executing);
  return results;
}

/**
 * Execute tasks in parallel with timeout
 */
export async function parallelTimeout<T>(
  tasks: Array<() => Promise<T>>,
  timeoutMs: number
): Promise<T[]> {
  const promises = tasks.map((task) => 
    Promise.race([
      task(),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error("Task timeout")), timeoutMs)
      ),
    ])
  );
  
  return Promise.all(promises);
}

/**
 * Execute tasks in parallel, returning all results (including errors)
 */
export async function parallelAllSettled<T>(
  tasks: Array<() => Promise<T>>
): Promise<PromiseSettledResult<T>[]> {
  const promises = tasks.map((task) => task());
  return Promise.allSettled(promises);
}

/**
 * Execute tasks in parallel, returning first successful result
 */
export async function parallelFirst<T>(
  tasks: Array<() => Promise<T>>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let rejectedCount = 0;
    const errors: Error[] = [];
    
    for (const task of tasks) {
      task().then(
        (result) => resolve(result),
        (error) => {
          rejectedCount++;
          errors.push(error instanceof Error ? error : new Error(String(error)));
          
          if (rejectedCount === tasks.length) {
            reject(new AggregateError(errors, "All tasks failed"));
          }
        }
      );
    }
  });
}

/**
 * Execute tasks in parallel, returning fastest result
 */
export async function parallelRace<T>(
  tasks: Array<() => Promise<T>>
): Promise<T> {
  const promises = tasks.map((task) => task());
  return Promise.race(promises);
}

/**
 * Non-blocking async iterator
 */
export async function* nonBlockingIterator<T>(
  items: T[],
  delayMs: number = 0
): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
    if (delayMs > 0) {
      await delay(delayMs);
    }
    // Yield control to event loop
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * Async batch processor
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options?: {
    batchSize?: number;
    concurrency?: number;
    onBatchComplete?: (batch: R[], batchIndex: number) => void;
    onError?: (error: Error, item: T, batchIndex: number) => void;
  }
): Promise<R[]> {
  const {
    batchSize = 10,
    concurrency = 4,
    onBatchComplete,
    onError,
  } = options || {};
  
  const results: R[] = [];
  const batches: T[][] = [];
  
  // Split into batches
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  // Process batches
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchResults = await parallelLimit(
      batch.map((item) => async () => {
        try {
          return await processor(item);
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error(String(error)), item, batchIndex);
          throw error;
        }
      }),
      concurrency
    );
    
    results.push(...batchResults);
    onBatchComplete?.(batchResults, batchIndex);
  }
  
  return results;
}

/**
 * Async queue with priority
 */
export class AsyncQueue<T> {
  private queue: Array<{
    task: () => Promise<T>;
    priority: number;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  }> = [];
  
  private running = 0;
  private concurrency: number;
  
  constructor(concurrency: number = 4) {
    this.concurrency = concurrency;
  }
  
  /**
   * Add task to queue
   */
  async add(task: () => Promise<T>, priority: number = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processNext();
    });
  }
  
  /**
   * Process next task in queue
   */
  private async processNext(): Promise<void> {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }
    
    this.running++;
    const { task, resolve, reject } = this.queue.shift()!;
    
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.processNext();
    }
  }
  
  /**
   * Get queue size
   */
  get size(): number {
    return this.queue.length;
  }
  
  /**
   * Get running count
   */
  get active(): number {
    return this.running;
  }
  
  /**
   * Clear queue
   */
  clear(): void {
    for (const { reject } of this.queue) {
      reject(new Error("Queue cleared"));
    }
    this.queue = [];
  }
}

/**
 * Debounce async function
 */
export function debounceAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  delayMs: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  let resolvePromise: ((value: unknown) => void) | null = null;
  let rejectPromise: ((reason: unknown) => void) | null = null;
  
  return ((...args: unknown[]) => {
    return new Promise((resolve, reject) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        rejectPromise?.(new Error("Debounced"));
      }
      
      resolvePromise = resolve;
      rejectPromise = reject;
      
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolvePromise?.(result);
        } catch (error) {
          rejectPromise?.(error);
        } finally {
          timeoutId = null;
          resolvePromise = null;
          rejectPromise = null;
        }
      }, delayMs);
    });
  }) as T;
}

/**
 * Throttle async function
 */
export function throttleAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  limitMs: number
): T {
  let lastRun = 0;
  let pendingPromise: Promise<unknown> | null = null;
  
  return ((...args: unknown[]) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRun;
    
    if (timeSinceLastRun >= limitMs) {
      lastRun = now;
      return fn(...args);
    }
    
    if (!pendingPromise) {
      pendingPromise = new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            lastRun = Date.now();
            const result = await fn(...args);
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            pendingPromise = null;
          }
        }, limitMs - timeSinceLastRun);
      });
    }
    
    return pendingPromise;
  }) as T;
}

/**
 * Retry async function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    onRetry?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    onRetry,
  } = options || {};
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const delayMs = Math.min(
          baseDelayMs * Math.pow(backoffFactor, attempt),
          maxDelayMs
        );
        
        onRetry?.(lastError, attempt + 1);
        await delay(delayMs);
      }
    }
  }
  
  throw lastError;
}

/**
 * Delay execution
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Delay with abort signal
 */
export function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Operation aborted"));
      return;
    }
    
    const timer = setTimeout(resolve, ms);
    
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Operation aborted"));
    }, { once: true });
  });
}

/**
 * Timeout wrapper
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
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
 * Non-blocking file read
 */
export async function readFileNonBlocking(
  filePath: string,
  encoding: BufferEncoding = "utf-8"
): Promise<string> {
  const fs = await import("node:fs/promises");
  return fs.readFile(filePath, { encoding });
}

/**
 * Non-blocking file write
 */
export async function writeFileNonBlocking(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8"
): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, content, { encoding });
}

/**
 * Non-blocking directory creation
 */
export async function mkdirNonBlocking(
  dirPath: string,
  options?: { recursive?: boolean }
): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(dirPath, options);
}

/**
 * Non-blocking file existence check
 */
export async function existsNonBlocking(filePath: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Global async scheduler
 */
export class AsyncScheduler {
  private tasks: Map<string, {
    fn: () => Promise<unknown>;
    intervalMs: number;
    timer: NodeJS.Timeout | null;
    running: boolean;
  }> = new Map();
  
  /**
   * Schedule periodic task
   */
  schedule(
    name: string,
    fn: () => Promise<unknown>,
    intervalMs: number
  ): void {
    this.cancel(name);
    
    const task = {
      fn,
      intervalMs,
      timer: null as NodeJS.Timeout | null,
      running: false,
    };
    
    task.timer = setInterval(async () => {
      if (task.running) return;
      
      task.running = true;
      try {
        await task.fn();
      } finally {
        task.running = false;
      }
    }, intervalMs);
    
    this.tasks.set(name, task);
  }
  
  /**
   * Cancel scheduled task
   */
  cancel(name: string): void {
    const task = this.tasks.get(name);
    if (task) {
      if (task.timer) {
        clearInterval(task.timer);
      }
      this.tasks.delete(name);
    }
  }
  
  /**
   * Cancel all tasks
   */
  cancelAll(): void {
    for (const [name] of this.tasks) {
      this.cancel(name);
    }
  }
  
  /**
   * Get scheduled task names
   */
  getScheduledTasks(): string[] {
    return Array.from(this.tasks.keys());
  }
}

/**
 * Global scheduler instance
 */
export const globalScheduler = new AsyncScheduler();
