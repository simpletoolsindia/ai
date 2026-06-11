#!/usr/bin/env node
/**
 * scripts/publish.mjs
 *
 * Publishes all four @simpletoolsindiaorg/* packages to npm in dependency
 * order. Uses the auth token from ~/.npmrc. Designed for the local
 * post-bump workflow; does NOT bump versions or rebuild — run
 * `npm run build` first.
 *
 * Usage:
 *   node scripts/publish.mjs                 # publish with current versions
 *   node scripts/publish.mjs --tag next      # publish under a dist-tag
 *   node scripts/publish.mjs --dry-run       # build & pack, but don't publish
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const packages = [
	{ dir: "packages/ai", name: "@simpletoolsindiaorg/ai-provider" },
	{ dir: "packages/tui", name: "@simpletoolsindiaorg/ai-tui" },
	{ dir: "packages/agent", name: "@simpletoolsindiaorg/ai-agent" },
	{ dir: "packages/coding-agent", name: "@simpletoolsindiaorg/ai-coding-agent" },
];

const args = process.argv.slice(2);
let tag = "latest";
let dryRun = false;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--tag") tag = args[++i];
	else if (args[i] === "--dry-run") dryRun = true;
	else if (args[i] === "--help") {
		console.log("Usage: node scripts/publish.mjs [--tag <tag>] [--dry-run]");
		process.exit(0);
	} else {
		console.error(`Unknown arg: ${args[i]}`);
		process.exit(2);
	}
}

function run(cmd, cargs, opts = {}) {
	const r = spawnSync(cmd, cargs, {
		cwd: opts.cwd ?? process.cwd(),
		stdio: "inherit",
		shell: false,
		env: { ...process.env, ...(opts.env ?? {}) },
	});
	if (r.status !== 0) {
		throw new Error(`Failed: ${cmd} ${cargs.join(" ")}`);
	}
}

function getVersion(dir) {
	const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
	return { name: p.name, version: p.version };
}

console.log(`\n=== ${dryRun ? "DRY-RUN " : ""}Publishing ${packages.length} packages ===\n`);
for (const pkg of packages) {
	const { version } = getVersion(pkg.dir);
	console.log(`  ${pkg.name}@${version}`);
}
console.log();

if (dryRun) {
	console.log("--dry-run: skipping actual publish");
	process.exit(0);
}

for (const pkg of packages) {
	const cargs = ["publish", "--access", "public", "--tag", tag, "--provenance=false"];
	console.log(`\n>>> Publishing ${pkg.name}`);
	run("npm", cargs, { cwd: pkg.dir });
}

console.log(`\n=== Done. Published with tag "${tag}" ===\n`);
