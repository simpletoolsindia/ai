/**
 * Central timing instrumentation for startup profiling.
 * Enable with `PI_TIMING=1` environment variable or the `--profile`
 * CLI flag. When enabled, `printTimings()` writes a per-phase timing
 * table to stderr at the end of startup.
 */

function isEnabled(): boolean {
	if (process.env.PI_TIMING === "1") return true;
	// Allow enabling via the CLI flag (set by main.ts when the user
	// passes --profile). This is process-local so we keep it as a
	// module-level override.
	return (globalThis as { __AI_PROFILE__?: boolean }).__AI_PROFILE__ === true;
}

const timings: Array<{ label: string; ms: number }> = [];
let lastTime = Date.now();

export function resetTimings(): void {
	if (!isEnabled()) return;
	timings.length = 0;
	lastTime = Date.now();
}

export function time(label: string): void {
	if (!isEnabled()) return;
	const now = Date.now();
	timings.push({ label, ms: now - lastTime });
	lastTime = now;
}

export function printTimings(): void {
	if (!isEnabled() || timings.length === 0) return;
	console.error("\n--- Startup Timings ---");
	for (const t of timings) {
		console.error(`  ${t.label}: ${t.ms}ms`);
	}
	console.error(`  TOTAL: ${timings.reduce((a, b) => a + b.ms, 0)}ms`);
	console.error("------------------------\n");
}
