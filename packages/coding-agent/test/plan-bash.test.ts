/**
 * Tests for the plan-mode bash allow/deny policy.
 *
 * Locks the contract documented in the system prompt and consumed by
 * `agent-session.ts` `_isDestructiveBashCommand` (which now delegates
 * here). Any change to the allow/deny lists must update both the
 * system-prompt.md "Bash is read-only" rule and this test file.
 */

import { describe, expect, it } from "vitest";
import {
	isSafeBashCommand,
	PLAN_MODE_DESTRUCTIVE_PATTERNS,
	PLAN_MODE_SAFE_PATTERNS,
	planModeBlockReason,
} from "../src/core/mode/plan-bash.ts";

describe("plan-bash — safe commands allowed", () => {
	it.each([
		// File reading
		"ls -la",
		"ls -la /tmp",
		"cat file.txt",
		"cat src/index.ts | head -n 5",
		"head -n 10 file.txt",
		"tail -f log.txt",
		"less bigfile",
		"grep pattern file",
		"find . -name '*.ts'",
		"tree -L 2",
		"stat file.txt",
		"wc -l file.txt",
		// Shell / builtin
		"pwd",
		"echo hello",
		"echo $HOME",
		"printf 'x=%d\\n' 5",
		"env | grep PATH",
		"date",
		"cal 6 2026",
		"uptime",
		// System introspection
		"ps aux | head",
		"top -b -n 1 | head",
		"free -h",
		"df -h",
		"du -sh .",
		"uname -a",
		"whoami",
		"id",
		"which node",
		"whereis bash",
		"type ls",
		// Text processing
		"sort file.txt",
		"uniq -c file.txt",
		"diff a.txt b.txt",
		"file something.bin",
		// Modern tools
		"rg pattern src/",
		"fd '*.ts'",
		"bat file.txt",
		"eza -la",
		"jq '.foo' data.json",
		"awk '{print $1}' file",
		"sed -n '1,10p' file",
		// VCS reads
		"git status",
		"git log --oneline -20",
		"git diff",
		"git show HEAD",
		"git branch",
		"git remote -v",
		"git config --get user.name",
		"git ls-files",
		// Package manager reads
		"npm list",
		"npm ls",
		"npm view react",
		"npm info react",
		"npm search lodash",
		"npm outdated",
		"npm audit",
		"yarn list",
		"yarn info react",
		"yarn why lodash",
		"yarn audit",
		// Version checks
		"node --version",
		"python --version",
		// Network reads
		"curl https://example.com",
		"curl -sSL https://api.example.com/v1/health",
		"wget https://example.com/file.txt",
		"wget -q -O - https://example.com",
	])("allows: %s", (cmd) => {
		expect(isSafeBashCommand(cmd)).toBe(true);
		expect(planModeBlockReason(cmd)).toBeNull();
	});
});

describe("plan-bash — destructive commands blocked", () => {
	it.each([
		// File ops
		"rm file.txt",
		"rm -rf /tmp/whatever",
		"rmdir emptydir",
		"mv old new",
		"cp src dst",
		"mkdir newdir",
		"touch newfile",
		"chmod 755 script.sh",
		"chown user:group file",
		"chgrp staff file",
		"ln -s target link",
		"tee file.txt",
		"truncate -s 0 file",
		"dd if=/dev/zero of=disk.img bs=1M count=100",
		"shred sensitive.txt",
		// Redirects
		"echo hello > file.txt",
		"cat foo >> bar",
		">file.txt",
		// Package ops
		"npm install lodash",
		"npm uninstall lodash",
		"npm update",
		"npm ci",
		"npm link",
		"npm publish",
		"yarn add react",
		"yarn remove react",
		"yarn install",
		"yarn publish",
		"pnpm add react",
		"pnpm install",
		"pip install requests",
		"pip uninstall requests",
		"apt install nginx",
		"apt-get install nginx",
		"apt remove nginx",
		"apt-get update",
		"brew install node",
		"brew uninstall node",
		"brew upgrade",
		// VCS writes
		"git add .",
		"git commit -m 'msg'",
		"git push",
		"git push origin main",
		"git pull",
		"git merge feature",
		"git rebase main",
		"git reset --hard",
		"git checkout main",
		"git branch -D oldbranch",
		"git stash",
		"git cherry-pick abc123",
		"git revert HEAD",
		"git tag v1.0",
		"git init",
		"git clone https://github.com/foo/bar",
		// Privilege
		"sudo apt install foo",
		"su -c 'rm -rf /'",
		// Process
		"kill 1234",
		"kill -9 1234",
		"pkill nginx",
		"killall nginx",
		// System
		"reboot",
		"shutdown -h now",
		"systemctl start nginx",
		"systemctl stop nginx",
		"systemctl restart nginx",
		"systemctl enable nginx",
		"systemctl disable nginx",
		"service nginx start",
		"service nginx stop",
		"service nginx restart",
		// Editors
		"vim file.txt",
		"vi file.txt",
		"nano file.txt",
		"emacs file.txt",
		"code .",
		"code file.txt",
		"subl file.txt",
	])("blocks: %s", (cmd) => {
		expect(isSafeBashCommand(cmd)).toBe(false);
		expect(planModeBlockReason(cmd)).not.toBeNull();
	});
});

describe("plan-bash — default-deny for unknown commands", () => {
	it.each(["unknown-command", "my-script.sh", "weirdtool --flag", ""])("blocks: %s", (cmd) => {
		expect(isSafeBashCommand(cmd)).toBe(false);
	});
});

describe("plan-bash — non-string / empty", () => {
	it("rejects non-string input", () => {
		expect(isSafeBashCommand(null as unknown as string)).toBe(false);
		expect(isSafeBashCommand(undefined as unknown as string)).toBe(false);
		expect(isSafeBashCommand(123 as unknown as string)).toBe(false);
	});
});

describe("plan-bash — leading whitespace is OK", () => {
	it("allows commands with leading spaces/tabs", () => {
		expect(isSafeBashCommand("   ls -la")).toBe(true);
		expect(isSafeBashCommand("\tcat file")).toBe(true);
	});
});

describe("plan-bash — deny wins over allow", () => {
	it("blocks safe-looking commands with destructive tails", () => {
		// Looks like a `cat` first, but has an `rm` mid-command.
		expect(isSafeBashCommand("cat file.txt && rm file.txt")).toBe(false);
		// Looks like an `echo` first, but redirects to a file.
		expect(isSafeBashCommand("echo hello > file.txt")).toBe(false);
		// Safe git read with appended `&&` to a write.
		expect(isSafeBashCommand("git status && git add .")).toBe(false);
	});
});

describe("plan-bash — pipelined safe commands remain safe", () => {
	it("allows read pipelines", () => {
		expect(isSafeBashCommand("cat file | grep pattern")).toBe(true);
		expect(isSafeBashCommand("ls -la | wc -l")).toBe(true);
		expect(isSafeBashCommand("find . -name '*.ts' | head -20")).toBe(true);
	});
});

describe("plan-bash — pattern arrays are non-empty", () => {
	it("has both lists populated", () => {
		expect(PLAN_MODE_SAFE_PATTERNS.length).toBeGreaterThan(20);
		expect(PLAN_MODE_DESTRUCTIVE_PATTERNS.length).toBeGreaterThan(20);
	});
});

describe("plan-bash — block reason is human-readable", () => {
	it("names the actual operation", () => {
		expect(planModeBlockReason("rm foo")).toMatch(/rm/);
		expect(planModeBlockReason("git push")).toMatch(/git/);
		expect(planModeBlockReason("sudo apt install foo")).toMatch(/sudo/);
		expect(planModeBlockReason("echo x > f")).toMatch(/redirection|file/i);
		expect(planModeBlockReason("vim foo")).toMatch(/editor/i);
	});
});
