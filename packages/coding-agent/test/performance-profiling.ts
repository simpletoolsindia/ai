/**
 * Performance profiling script for async skills loading.
 *
 * This script measures the performance difference between
 * synchronous and asynchronous skills loading.
 */

import { performance } from "node:perf_hooks";
import { loadSkills } from "../src/core/skills.ts";
import { loadSkillsAsync } from "../src/core/skills-async.ts";

// Test configuration
const TEST_ITERATIONS = 10;
const TEST_DIRS = ["/Users/sridhar/ai/.ai/skills", "/Users/sridhar/ai/.agents/skills"];

interface PerformanceResult {
	name: string;
	iterations: number;
	totalTime: number;
	averageTime: number;
	minTime: number;
	maxTime: number;
}

/**
 * Run a performance test.
 */
async function runPerformanceTest(
	name: string,
	fn: () => Promise<void>,
	iterations: number,
): Promise<PerformanceResult> {
	const times: number[] = [];

	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await fn();
		const end = performance.now();
		times.push(end - start);
	}

	const totalTime = times.reduce((sum, time) => sum + time, 0);
	const averageTime = totalTime / iterations;
	const minTime = Math.min(...times);
	const maxTime = Math.max(...times);

	return {
		name,
		iterations,
		totalTime,
		averageTime,
		minTime,
		maxTime,
	};
}

/**
 * Run synchronous skills loading test.
 */
async function testSyncLoading(): Promise<void> {
	for (const dir of TEST_DIRS) {
		try {
			loadSkills({
				cwd: "/Users/sridhar/ai",
				agentDir: "/Users/sridhar/ai/.ai",
				skillPaths: [dir],
				includeDefaults: false,
			});
		} catch (error) {
			// Ignore errors for profiling
		}
	}
}

/**
 * Run asynchronous skills loading test.
 */
async function testAsyncLoading(): Promise<void> {
	for (const dir of TEST_DIRS) {
		try {
			await loadSkillsAsync({
				cwd: "/Users/sridhar/ai",
				agentDir: "/Users/sridhar/ai/.ai",
				skillPaths: [dir],
				includeDefaults: false,
			});
		} catch (error) {
			// Ignore errors for profiling
		}
	}
}

/**
 * Format a performance result for display.
 */
function formatResult(result: PerformanceResult): string {
	return [
		`Test: ${result.name}`,
		`Iterations: ${result.iterations}`,
		`Total Time: ${result.totalTime.toFixed(2)}ms`,
		`Average Time: ${result.averageTime.toFixed(2)}ms`,
		`Min Time: ${result.minTime.toFixed(2)}ms`,
		`Max Time: ${result.maxTime.toFixed(2)}ms`,
	].join("\n");
}

/**
 * Main profiling function.
 */
async function main(): Promise<void> {
	console.log("Performance Profiling: Async Skills Loading");
	console.log("=".repeat(50));
	console.log();

	// Run synchronous test
	console.log("Running synchronous skills loading test...");
	const syncResult = await runPerformanceTest("Synchronous Skills Loading", testSyncLoading, TEST_ITERATIONS);
	console.log(formatResult(syncResult));
	console.log();

	// Run asynchronous test
	console.log("Running asynchronous skills loading test...");
	const asyncResult = await runPerformanceTest("Asynchronous Skills Loading", testAsyncLoading, TEST_ITERATIONS);
	console.log(formatResult(asyncResult));
	console.log();

	// Calculate improvement
	const improvement = ((syncResult.averageTime - asyncResult.averageTime) / syncResult.averageTime) * 100;
	console.log("Performance Comparison:");
	console.log(`Synchronous Average: ${syncResult.averageTime.toFixed(2)}ms`);
	console.log(`Asynchronous Average: ${asyncResult.averageTime.toFixed(2)}ms`);
	console.log(`Improvement: ${improvement.toFixed(2)}%`);
	console.log();

	// Determine which is faster
	if (asyncResult.averageTime < syncResult.averageTime) {
		console.log("✓ Asynchronous loading is faster");
	} else if (asyncResult.averageTime > syncResult.averageTime) {
		console.log("✗ Synchronous loading is faster");
	} else {
		console.log("= Both methods have similar performance");
	}
}

// Run the profiling
main().catch(console.error);
