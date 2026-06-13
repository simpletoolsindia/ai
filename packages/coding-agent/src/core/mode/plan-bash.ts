/**
 * Plan-mode bash command allow/deny policy.
 *
 * In PLAN mode, the agent can still use the `bash` tool — but only for
 * read-only / investigative commands. Mutating commands (file ops, package
 * installs, git writes, system changes, editors, etc.) are rejected with
 * a one-line reason. The user can then press Tab (or run `/mode execute`)
 * to switch to full EXECUTE mode.
 *
 * The policy is a default-deny allow-list: a command must
 *   1. match the SAFE_PATTERNS allow-list (a known read-only command at
 *      the start of the line), AND
 *   2. NOT match the DESTRUCTIVE_PATTERNS deny-list (a known mutating
 *      command or operator anywhere on the line).
 *
 * Both lists are deliberately conservative. The system prompt lists the
 * same SAFE commands so the LLM knows what it can use. New commands
 * require extending both lists; that's intentional — adding to the
 * allow-list should be a deliberate review.
 *
 * Promoted from `examples/extensions/plan-mode/utils.ts` v0.84.0. The
 * example extension still ships its own copy for back-compat with
 * any forks consuming the example's `isSafeCommand` export.
 */

export const PLAN_MODE_DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
	// File operations
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	// Redirections (write to file)
	/(^|[^<])>(?!>)/,
	/>>/,
	// Privilege escalation — check BEFORE package managers so
	// `sudo apt install foo` is reported as a privilege issue, not as an
	// "apt package operation" (which would obscure the real reason).
	/\bsudo\b/i,
	/\bsu\b/i,
	// Package managers — install / remove / update
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	// VCS writes
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	// Process management
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	// System control
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	// Editors (interactive / file-modifying)
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

export const PLAN_MODE_SAFE_PATTERNS: readonly RegExp[] = [
	// File reading
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	// Shell builtins / prints
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	// Text/data utilities
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	// Introspection
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	// VCS reads
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	// Package manager reads
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	// Version checks
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	// Network reads (no body writes to disk)
	/^\s*curl\b/,
	/^\s*wget\b/,
	// Structured data
	/^\s*jq\b/,
	// Read-only stream ops
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	// Modern alternatives
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
];

/**
 * Return `true` if `command` is safe to run in PLAN mode.
 *
 * A command is safe when it matches at least one SAFE_PATTERNS entry AND
 * matches no DESTRUCTIVE_PATTERNS entry. A bare `curl` is allowed because
 * in plan mode the LLM is reading docs / API responses — but `curl >
 * file` is still blocked by the `>` redirection deny-pattern.
 */
export function isSafeBashCommand(command: string): boolean {
	if (typeof command !== "string" || command.trim() === "") return false;
	const destructive = PLAN_MODE_DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	if (destructive) return false;
	const safe = PLAN_MODE_SAFE_PATTERNS.some((p) => p.test(command));
	return safe;
}

/**
 * Return a human-readable reason the command is blocked in PLAN mode, or
 * `null` if the command is safe to run.
 *
 * The reason matches the first deny-pattern that triggered. Used as the
 * reason in the tool-result error message so the LLM knows *why* the
 * command was rejected (and can phrase the next attempt accordingly).
 */
export function planModeBlockReason(command: string): string | null {
	if (isSafeBashCommand(command)) return null;
	// First surface a destructive pattern if any matched — that's the more
	// useful reason ("you tried rm" vs "command not in safe list").
	for (const p of PLAN_MODE_DESTRUCTIVE_PATTERNS) {
		if (p.test(command)) return matchLabel(p);
	}
	return "command is not in the plan-mode allow list";
}

function matchLabel(pattern: RegExp): string {
	const src = pattern.source;
	if (src.includes("rmdir")) return "rmdir (delete directory)";
	if (src === "\\brm\\b") return "rm (delete file)";
	if (src === "\\bmv\\b") return "mv (move file)";
	if (src === "\\bcp\\b") return "cp (copy file)";
	if (src === "\\bmkdir\\b") return "mkdir (create directory)";
	if (src === "\\btouch\\b") return "touch (create file)";
	if (src.includes("chmod")) return "chmod (change permissions)";
	if (src.includes("chown")) return "chown (change owner)";
	if (src.includes("chgrp")) return "chgrp (change group)";
	if (src === "\\bln\\b") return "ln (create link)";
	if (src === "\\btee\\b") return "tee (write to file)";
	if (src === "\\btruncate\\b") return "truncate (shrink file)";
	if (src === "\\bdd\\b") return "dd (low-level write)";
	if (src === "\\bshred\\b") return "shred (secure-delete)";
	if (src.includes(">")) return "output redirection (writes to file)";
	if (src === "/>>/") return "append redirection (writes to file)";
	if (src.startsWith("\\bnpm\\s+")) return "npm package operation";
	if (src.startsWith("\\byarn\\s+")) return "yarn package operation";
	if (src.startsWith("\\bpnpm\\s+")) return "pnpm package operation";
	if (src.startsWith("\\bpip\\s+")) return "pip package operation";
	if (src.startsWith("\\bapt")) return "apt package operation";
	if (src.startsWith("\\bbrew")) return "brew package operation";
	if (src.startsWith("\\bgit\\s+")) return "git write operation";
	if (src === "\\bsudo\\b") return "sudo (privilege escalation)";
	if (src === "\\bsu\\b") return "su (privilege escalation)";
	if (src === "\\bkill\\b") return "kill (process termination)";
	if (src === "\\bpkill\\b") return "pkill (process termination)";
	if (src === "\\bkillall\\b") return "killall (process termination)";
	if (src === "\\breboot\\b") return "reboot (system control)";
	if (src === "\\bshutdown\\b") return "shutdown (system control)";
	if (src.startsWith("\\bsystemctl")) return "systemctl (system service)";
	if (src.startsWith("\\bservice\\s+")) return "service (system service)";
	if (src.includes("vim")) return "interactive editor";
	if (src.includes("nano")) return "interactive editor";
	if (src.includes("emacs")) return "interactive editor";
	if (src.includes("code")) return "interactive editor";
	if (src.includes("subl")) return "interactive editor";
	return "mutating operation";
}
