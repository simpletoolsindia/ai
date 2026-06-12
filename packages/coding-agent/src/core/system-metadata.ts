/**
 * System Metadata Collector
 *
 * Collects information about the user's system including:
 * - Operating system and architecture
 * - Hardware specifications
 * - Installed tools and versions
 * - Supported features and capabilities
 * - Environment configuration
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * System information interface
 */
export interface SystemInfo {
	/** Operating system */
	os: {
		platform: string;
		release: string;
		arch: string;
		version: string;
		hostname: string;
	};

	/** Hardware information */
	hardware: {
		cpuModel: string;
		cpuCores: number;
		cpuSpeed: number;
		totalMemory: number;
		freeMemory: number;
		memoryUsagePercent: number;
	};

	/** Node.js information */
	nodejs: {
		version: string;
		platform: string;
		arch: string;
		modules: string[];
	};

	/** Installed tools */
	tools: {
		git?: string;
		npm?: string;
		node?: string;
		python?: string;
		docker?: string;
		ollama?: string;
		brew?: string;
	};

	/** Supported features */
	features: {
		/** Kitty graphics protocol */
		kittyGraphics: boolean;
		/** iTerm2 inline images */
		iterm2Images: boolean;
		/** Truecolor support */
		truecolor: boolean;
		/** 256 color support */
		color256: boolean;
		/** Unicode support */
		unicode: boolean;
		/** Hyperlink support */
		hyperlinks: boolean;
		/** Image support */
		images: boolean;
	};

	/** Environment variables */
	environment: {
		shell: string;
		term: string;
		termProgram: string;
		colorterm: string;
		lang: string;
		path: string;
		home: string;
		user: string;
	};

	/** Project information */
	project?: {
		/** Current working directory */
		cwd: string;
		/** Git repository */
		git?: {
			branch: string;
			remote: string;
			isClean: boolean;
		};
		/** Package manager */
		packageManager?: string;
		/** Node.js version in project */
		nodeVersion?: string;
	};
}

/**
 * Tool version detection result
 */
interface ToolVersion {
	name: string;
	version: string;
	path?: string;
}

/**
 * Detect tool version by running command
 */
function detectToolVersion(command: string, args: string[] = ["--version"]): string | undefined {
	try {
		const result = execSync(`${command} ${args.join(" ")}`, {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return result.trim().split("\n")[0];
	} catch {
		return undefined;
	}
}

/**
 * Detect installed tools
 */
function detectTools(): SystemInfo["tools"] {
	const tools: SystemInfo["tools"] = {};

	// Git
	const gitVersion = detectToolVersion("git", ["--version"]);
	if (gitVersion) {
		tools.git = gitVersion.replace("git version ", "");
	}

	// npm
	const npmVersion = detectToolVersion("npm", ["--version"]);
	if (npmVersion) {
		tools.npm = npmVersion;
	}

	// Node.js
	const nodeVersion = detectToolVersion("node", ["--version"]);
	if (nodeVersion) {
		tools.node = nodeVersion;
	}

	// Python
	const pythonVersion = detectToolVersion("python3", ["--version"]) || detectToolVersion("python", ["--version"]);
	if (pythonVersion) {
		tools.python = pythonVersion.replace("Python ", "");
	}

	// Docker
	const dockerVersion = detectToolVersion("docker", ["--version"]);
	if (dockerVersion) {
		tools.docker = dockerVersion.replace("Docker version ", "").split(",")[0];
	}

	// Ollama
	const ollamaVersion = detectToolVersion("ollama", ["--version"]);
	if (ollamaVersion) {
		tools.ollama = ollamaVersion.replace("ollama version ", "");
	}

	// Homebrew (macOS/Linux)
	const brewVersion = detectToolVersion("brew", ["--version"]);
	if (brewVersion) {
		tools.brew = brewVersion.replace("Homebrew ", "").split("\n")[0];
	}

	return tools;
}

/**
 * Detect terminal features
 */
function detectFeatures(): SystemInfo["features"] {
	const features: SystemInfo["features"] = {
		kittyGraphics: false,
		iterm2Images: false,
		truecolor: false,
		color256: false,
		unicode: true,
		hyperlinks: false,
		images: false,
	};

	const termProgram = process.env.TERM_PROGRAM || "";
	const colorterm = process.env.COLORTERM || "";
	const term = process.env.TERM || "";

	// Truecolor support
	features.truecolor = colorterm === "truecolor" || colorterm === "24bit";

	// 256 color support
	features.color256 = term.includes("256color") || features.truecolor;

	// Kitty graphics protocol
	features.kittyGraphics =
		termProgram === "kitty" ||
		!!process.env.KITTY_WINDOW_ID ||
		termProgram === "ghostty" ||
		!!process.env.GHOSTTY_RESOURCES_DIR;

	// iTerm2 inline images
	features.iterm2Images = termProgram === "iTerm.app" || !!process.env.ITERM_SESSION_ID;

	// Hyperlink support
	features.hyperlinks =
		termProgram === "kitty" ||
		termProgram === "iTerm.app" ||
		termProgram === "WezTerm" ||
		termProgram === "ghostty" ||
		!!process.env.WEZTERM_PANE;

	// Image support
	features.images = features.kittyGraphics || features.iterm2Images;

	return features;
}

/**
 * Detect project information
 */
function detectProject(): SystemInfo["project"] | undefined {
	const cwd = process.cwd();

	const project: SystemInfo["project"] = {
		cwd,
	};

	// Git information
	try {
		const branch = execSync("git rev-parse --abbrev-ref HEAD", {
			encoding: "utf-8",
			cwd,
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		const remote = execSync("git remote get-url origin", {
			encoding: "utf-8",
			cwd,
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		const isClean =
			execSync("git status --porcelain", {
				encoding: "utf-8",
				cwd,
				timeout: 5000,
				stdio: ["pipe", "pipe", "pipe"],
			}).trim().length === 0;

		project.git = { branch, remote, isClean };
	} catch {
		// Not a git repository
	}

	// Package manager detection
	if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
		project.packageManager = "pnpm";
	} else if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
		project.packageManager = "yarn";
	} else if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
		project.packageManager = "npm";
	} else if (fs.existsSync(path.join(cwd, "bun.lockb"))) {
		project.packageManager = "bun";
	}

	// Node.js version from .nvmrc or .node-version
	const nvmrcPath = path.join(cwd, ".nvmrc");
	const nodeVersionPath = path.join(cwd, ".node-version");

	if (fs.existsSync(nvmrcPath)) {
		project.nodeVersion = fs.readFileSync(nvmrcPath, "utf-8").trim();
	} else if (fs.existsSync(nodeVersionPath)) {
		project.nodeVersion = fs.readFileSync(nodeVersionPath, "utf-8").trim();
	}

	return project;
}

/**
 * Collect system information
 */
export function collectSystemInfo(): SystemInfo {
	const cpus = os.cpus();
	const totalMemory = os.totalmem();
	const freeMemory = os.freemem();

	return {
		os: {
			platform: os.platform(),
			release: os.release(),
			arch: os.arch(),
			version: os.version(),
			hostname: os.hostname(),
		},

		hardware: {
			cpuModel: cpus[0]?.model || "Unknown",
			cpuCores: cpus.length,
			cpuSpeed: cpus[0]?.speed || 0,
			totalMemory,
			freeMemory,
			memoryUsagePercent: Math.round(((totalMemory - freeMemory) / totalMemory) * 100),
		},

		nodejs: {
			version: process.version,
			platform: process.platform,
			arch: process.arch,
			modules: [],
		},

		tools: detectTools(),

		features: detectFeatures(),

		environment: {
			shell: process.env.SHELL || "unknown",
			term: process.env.TERM || "unknown",
			termProgram: process.env.TERM_PROGRAM || "unknown",
			colorterm: process.env.COLORTERM || "unknown",
			lang: process.env.LANG || "unknown",
			path: process.env.PATH || "",
			home: os.homedir(),
			user: os.userInfo().username,
		},

		project: detectProject(),
	};
}

/**
 * Format system information for display
 */
export function formatSystemInfo(info: SystemInfo): string {
	const lines: string[] = [];

	lines.push("=== System Information ===");
	lines.push("");

	// OS
	lines.push(`Platform: ${info.os.platform} ${info.os.release} (${info.os.arch})`);
	lines.push(`Hostname: ${info.os.hostname}`);
	lines.push("");

	// Hardware
	lines.push("=== Hardware ===");
	lines.push(`CPU: ${info.hardware.cpuModel}`);
	lines.push(`Cores: ${info.hardware.cpuCores}`);
	lines.push(
		`Memory: ${formatBytes(info.hardware.totalMemory)} total, ${formatBytes(info.hardware.freeMemory)} free (${info.hardware.memoryUsagePercent}% used)`,
	);
	lines.push("");

	// Node.js
	lines.push("=== Node.js ===");
	lines.push(`Version: ${info.nodejs.version}`);
	lines.push(`Platform: ${info.nodejs.platform} ${info.nodejs.arch}`);
	lines.push("");

	// Tools
	lines.push("=== Installed Tools ===");
	for (const [tool, version] of Object.entries(info.tools)) {
		if (version) {
			lines.push(`${tool}: ${version}`);
		}
	}
	lines.push("");

	// Features
	lines.push("=== Supported Features ===");
	lines.push(`Truecolor: ${info.features.truecolor ? "✓" : "✗"}`);
	lines.push(`256 Colors: ${info.features.color256 ? "✓" : "✗"}`);
	lines.push(`Unicode: ${info.features.unicode ? "✓" : "✗"}`);
	lines.push(`Hyperlinks: ${info.features.hyperlinks ? "✓" : "✗"}`);
	lines.push(`Images: ${info.features.images ? "✓" : "✗"}`);
	lines.push(`Kitty Graphics: ${info.features.kittyGraphics ? "✓" : "✗"}`);
	lines.push(`iTerm2 Images: ${info.features.iterm2Images ? "✓" : "✗"}`);
	lines.push("");

	// Environment
	lines.push("=== Environment ===");
	lines.push(`Shell: ${info.environment.shell}`);
	lines.push(`Terminal: ${info.environment.termProgram}`);
	lines.push(`User: ${info.environment.user}`);
	lines.push(`Home: ${info.environment.home}`);
	lines.push("");

	// Project
	if (info.project) {
		lines.push("=== Project ===");
		lines.push(`Directory: ${info.project.cwd}`);

		if (info.project.git) {
			lines.push(`Git Branch: ${info.project.git.branch}`);
			lines.push(`Git Remote: ${info.project.git.remote}`);
			lines.push(`Working Tree: ${info.project.git.isClean ? "Clean" : "Modified"}`);
		}

		if (info.project.packageManager) {
			lines.push(`Package Manager: ${info.project.packageManager}`);
		}

		if (info.project.nodeVersion) {
			lines.push(`Node Version (project): ${info.project.nodeVersion}`);
		}
	}

	return lines.join("\n");
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let unitIndex = 0;
	let value = bytes;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}

	return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Get system capabilities summary
 */
export function getSystemCapabilities(): {
	canRunOllama: boolean;
	canRunDocker: boolean;
	canDisplayImages: boolean;
	canUseHyperlinks: boolean;
	supportsTruecolor: boolean;
	supportsUnicode: boolean;
	recommendedModelSize: string;
} {
	const info = collectSystemInfo();

	const totalMemoryGB = info.hardware.totalMemory / (1024 * 1024 * 1024);

	return {
		canRunOllama: !!info.tools.ollama,
		canRunDocker: !!info.tools.docker,
		canDisplayImages: info.features.images,
		canUseHyperlinks: info.features.hyperlinks,
		supportsTruecolor: info.features.truecolor,
		supportsUnicode: info.features.unicode,
		recommendedModelSize:
			totalMemoryGB >= 32 ? "70B+" : totalMemoryGB >= 16 ? "13B-70B" : totalMemoryGB >= 8 ? "7B-13B" : "7B",
	};
}

/**
 * Create system metadata for LLM context
 */
export function createSystemMetadata(): string {
	const info = collectSystemInfo();
	const capabilities = getSystemCapabilities();

	const metadata: string[] = [];

	metadata.push("## System Context");
	metadata.push("");
	metadata.push(`**Platform:** ${info.os.platform} ${info.os.arch}`);
	metadata.push(`**Node.js:** ${info.nodejs.version}`);
	metadata.push(`**Shell:** ${info.environment.shell}`);
	metadata.push(`**Terminal:** ${info.environment.termProgram}`);
	metadata.push("");

	metadata.push("### Hardware");
	metadata.push(`- CPU: ${info.hardware.cpuModel} (${info.hardware.cpuCores} cores)`);
	metadata.push(`- Memory: ${formatBytes(info.hardware.totalMemory)} total`);
	metadata.push("");

	metadata.push("### Installed Tools");
	const installedTools = Object.entries(info.tools)
		.filter(([_, version]) => version)
		.map(([tool, version]) => `- ${tool}: ${version}`)
		.join("\n");
	metadata.push(installedTools || "- None detected");
	metadata.push("");

	metadata.push("### Capabilities");
	metadata.push(`- Ollama: ${capabilities.canRunOllama ? "Available" : "Not installed"}`);
	metadata.push(`- Docker: ${capabilities.canRunDocker ? "Available" : "Not installed"}`);
	metadata.push(`- Image Display: ${capabilities.canDisplayImages ? "Supported" : "Not supported"}`);
	metadata.push(`- Truecolor: ${capabilities.supportsTruecolor ? "Supported" : "Not supported"}`);
	metadata.push(`- Recommended Model Size: ${capabilities.recommendedModelSize}`);
	metadata.push("");

	if (info.project) {
		metadata.push("### Project");
		metadata.push(`- Directory: ${info.project.cwd}`);
		if (info.project.git) {
			metadata.push(`- Branch: ${info.project.git.branch}`);
			metadata.push(`- Status: ${info.project.git.isClean ? "Clean" : "Modified"}`);
		}
		if (info.project.packageManager) {
			metadata.push(`- Package Manager: ${info.project.packageManager}`);
		}
	}

	return metadata.join("\n");
}
