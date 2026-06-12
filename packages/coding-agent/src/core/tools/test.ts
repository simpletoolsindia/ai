/**
 * Test tool — auto-detect and run project tests.
 *
 * This tool automatically detects the test runner for the current project
 * and runs tests with appropriate configuration.
 */

import { constants } from "node:fs";
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises";
import type { AgentTool } from "@simpletoolsindiaorg/ai-agent";
import { Text } from "@simpletoolsindiaorg/ai-tui";
import { spawn } from "child_process";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import { waitForChildProcess } from "../../utils/child-process.ts";
import {
	getShellConfig,
	getShellEnv,
	killProcessTree,
	trackDetachedChildPid,
	untrackDetachedChildPid,
} from "../../utils/shell.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { OutputAccumulator } from "./output-accumulator.ts";
import { getTextOutput, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult } from "./truncate.ts";

const testSchema = Type.Object({
	pattern: Type.Optional(
		Type.String({
			description:
				'Test file pattern or specific test to run. Examples: "auth.test.ts", "**/*.spec.ts", "tests/test_auth.py"',
		}),
	),
	watch: Type.Optional(
		Type.Boolean({
			description: "Run tests in watch mode (re-run on file changes). Default: false",
		}),
	),
	timeout: Type.Optional(
		Type.Number({
			description: "Timeout in seconds. Default: 120s for most test suites.",
		}),
	),
});

export type TestToolInput = Static<typeof testSchema>;

export interface TestToolDetails {
	/** Test runner detected */
	runner: string;
	/** Command executed */
	command: string;
	/** Exit code */
	exitCode: number | null;
	/** Truncation info */
	truncation?: TruncationResult;
}

/**
 * Test runner detection result.
 */
interface TestRunner {
	/** Runner name */
	name: string;
	/** Command to run tests */
	command: string;
	/** Whether the runner supports watch mode */
	supportsWatch: boolean;
	/** Whether the runner supports pattern matching */
	supportsPattern: boolean;
}

/**
 * Detect test runner from project files.
 */
async function detectTestRunner(cwd: string): Promise<TestRunner | null> {
	// Check for package.json (Node.js projects)
	try {
		const packageJsonPath = `${cwd}/package.json`;
		await fsAccess(packageJsonPath, constants.R_OK);
		const content = await fsReadFile(packageJsonPath, "utf-8");
		const pkg = JSON.parse(content);

		// Check for test scripts
		const scripts = pkg.scripts || {};
		if (scripts.test) {
			// Check for common test runners
			if (scripts.test.includes("vitest") || pkg.devDependencies?.vitest) {
				return {
					name: "vitest",
					command: "npx vitest",
					supportsWatch: true,
					supportsPattern: true,
				};
			}
			if (scripts.test.includes("jest") || pkg.devDependencies?.jest) {
				return {
					name: "jest",
					command: "npx jest",
					supportsWatch: true,
					supportsPattern: true,
				};
			}
			if (scripts.test.includes("mocha") || pkg.devDependencies?.mocha) {
				return {
					name: "mocha",
					command: "npx mocha",
					supportsWatch: false,
					supportsPattern: true,
				};
			}
			if (scripts.test.includes("ava") || pkg.devDependencies?.ava) {
				return {
					name: "ava",
					command: "npx ava",
					supportsWatch: true,
					supportsPattern: true,
				};
			}

			// Generic npm test
			return {
				name: "npm",
				command: "npm test",
				supportsWatch: false,
				supportsPattern: false,
			};
		}
	} catch {
		// Not a Node.js project or no package.json
	}

	// Check for Python projects
	try {
		await fsAccess(`${cwd}/pytest.ini`, constants.R_OK);
		return {
			name: "pytest",
			command: "python -m pytest",
			supportsWatch: false,
			supportsPattern: true,
		};
	} catch {
		// No pytest.ini
	}

	try {
		await fsAccess(`${cwd}/setup.py`, constants.R_OK);
		return {
			name: "unittest",
			command: "python -m unittest",
			supportsWatch: false,
			supportsPattern: true,
		};
	} catch {
		// No setup.py
	}

	// Check for Go projects
	try {
		await fsAccess(`${cwd}/go.mod`, constants.R_OK);
		return {
			name: "go test",
			command: "go test",
			supportsWatch: false,
			supportsPattern: true,
		};
	} catch {
		// No go.mod
	}

	// Check for Rust projects
	try {
		await fsAccess(`${cwd}/Cargo.toml`, constants.R_OK);
		return {
			name: "cargo test",
			command: "cargo test",
			supportsWatch: false,
			supportsPattern: true,
		};
	} catch {
		// No Cargo.toml
	}

	// Check for Makefile with test target
	try {
		await fsAccess(`${cwd}/Makefile`, constants.R_OK);
		const content = await fsReadFile(`${cwd}/Makefile`, "utf-8");
		if (content.includes("test:")) {
			return {
				name: "make",
				command: "make test",
				supportsWatch: false,
				supportsPattern: false,
			};
		}
	} catch {
		// No Makefile
	}

	return null;
}

function prepareTestArguments(input: unknown): TestToolInput {
	if (!input || typeof input !== "object") {
		return input as TestToolInput;
	}
	return input as TestToolInput;
}

function formatTestCall(args: TestToolInput | undefined, theme: Theme, runner?: string): string {
	const runnerName = runner ? theme.fg("accent", runner) : theme.fg("dim", "detecting...");
	const pattern = args?.pattern ? theme.fg("dim", ` ${args.pattern}`) : "";
	const watch = args?.watch ? theme.fg("warning", " (watch)") : "";
	return `${theme.fg("toolTitle", theme.bold("test"))} ${runnerName}${pattern}${watch}`;
}

function formatTestResult(
	result: { content: Array<{ type: string; text?: string }>; details?: TestToolDetails },
	options: { theme: Theme; cwd: string; width: number },
	theme: Theme,
): string {
	const details = result.details;
	if (!details) {
		return getTextOutput(result as any, false);
	}

	const exitColor = details.exitCode === 0 ? "success" : "error";
	const exitText = details.exitCode === 0 ? "PASS" : "FAIL";

	return [theme.fg(exitColor, `Tests ${exitText}`), theme.fg("dim", ` (${details.runner})`)].join("");
}

export function createTestToolDefinition(_cwd: string): ToolDefinition<typeof testSchema, TestToolDetails> {
	return {
		name: "test",
		label: "Test",
		description: [
			"Run project tests. Auto-detects: jest, vitest, mocha, pytest, go test, cargo test.",
			"",
			"Use this to run tests without remembering the test command for each project.",
			"The tool automatically detects the test runner from project files.",
			"",
			"Examples:",
			"- test() - Run all tests",
			'- test({ pattern: "auth.test.ts" }) - Run specific test file',
			"- test({ watch: true }) - Run in watch mode",
		].join("\n"),
		promptSnippet: "Run project tests (auto-detects jest, vitest, pytest, go test, cargo test)",
		promptGuidelines: [
			"Use test to run project tests",
			"Auto-detects test runner from project files",
			"Use pattern to run specific tests",
			"Use watch mode for development",
		],
		parameters: testSchema,
		prepareArguments: prepareTestArguments,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const { pattern, watch = false, timeout = 120 } = params;

			// Detect test runner
			const runner = await detectTestRunner(_cwd);
			if (!runner) {
				throw new Error("No test runner detected. Supported: jest, vitest, mocha, pytest, go test, cargo test.");
			}

			// Build command
			let command = runner.command;

			// Add pattern if supported
			if (pattern && runner.supportsPattern) {
				command += ` ${pattern}`;
			}

			// Add watch mode if supported
			if (watch && runner.supportsWatch) {
				command += " --watch";
			}

			// Execute tests
			const { shell, args: shellArgs } = getShellConfig();
			const child = spawn(shell, [...shellArgs, command], {
				cwd: _cwd,
				detached: process.platform !== "win32",
				env: getShellEnv(),
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});

			if (child.pid) trackDetachedChildPid(child.pid);

			const accumulator = new OutputAccumulator();
			let timedOut = false;
			let timeoutHandle: NodeJS.Timeout | undefined;

			try {
				// Set timeout
				if (timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) killProcessTree(child.pid);
					}, timeout * 1000);
				}

				// Stream output
				child.stdout?.on("data", (data) => accumulator.add(data));
				child.stderr?.on("data", (data) => accumulator.add(data));

				// Handle abort signal
				const onAbort = () => {
					if (child.pid) killProcessTree(child.pid);
				};
				if (context.signal) {
					if (context.signal.aborted) onAbort();
					else context.signal.addEventListener("abort", onAbort, { once: true });
				}

				// Wait for completion
				const exitCode = await waitForChildProcess(child);

				if (context.signal?.aborted) {
					throw new Error("aborted");
				}
				if (timedOut) {
					throw new Error(`Tests timed out after ${timeout}s`);
				}

				// Get output
				const output = accumulator.getText();
				const truncation = accumulator.getTruncation();

				return {
					content: [{ type: "text", text: output }],
					details: {
						runner: runner.name,
						command,
						exitCode,
						truncation,
					},
				};
			} finally {
				if (child.pid) untrackDetachedChildPid(child.pid);
				if (timeoutHandle) clearTimeout(timeoutHandle);
			}
		},
		renderCall: (args, theme, _context) => new Text(formatTestCall(args, theme)),
		renderResult: (result, options, theme) => new Text(formatTestResult(result as any, options as any, theme)),
	};
}
