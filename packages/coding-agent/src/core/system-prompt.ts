/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
	/**
	 * Current agent mode. In "plan", the prompt gets a one-line
	 * reminder that write tools are unavailable and the model should
	 * describe what it would do before the user switches back to
	 * "execute". Defaults to "execute" (no extra text).
	 */
	mode?: "plan" | "execute";
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
		mode = "execute",
	} = options;
	const resolvedCwd = cwd;
	const promptCwd = resolvedCwd.replace(/\\/g, "/");

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const date = `${year}-${month}-${day}`;

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		// Append project context files
		if (contextFiles.length > 0) {
			prompt += "\n\n<project_context>\n\n";
			prompt += "Project-specific instructions and guidelines:\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
			}
			prompt += "</project_context>\n";
		}

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		// Add date and working directory last
		prompt += `\nCurrent date: ${date}`;
		prompt += `\nCurrent working directory: ${promptCwd}`;

		return prompt;
	}

	// Get absolute paths to documentation and examples
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("Use bash for file operations like ls, rg, find");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	// Always include these
	addGuideline("Be concise.");
	addGuideline("Show file paths clearly.");
	addGuideline("No tool or data? Say so — never confabulate URLs, paths, or facts.");
	addGuideline("Current/external info → use websearch/webfetch, don't guess.");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = `You are an expert coding assistant in ai, a coding agent harness. Help users by reading files, running commands, and editing code. You operate in an agent loop: you can call multiple tools, observe results, and continue iterating until the task is complete or you need user input.

Available tools:
${toolsList}
(Other custom tools may be available.)${
		mode === "plan"
			? `

⚠️  PLAN MODE — STRICT WORKFLOW  ⚠️

You are in PLAN mode. The write/edit/bash tools are DISABLED. Your job is to investigate, understand the request, and create a clear actionable plan via the \`todo\` tool.

PLAN mode workflow:

1. INVESTIGATE  Use read-only tools (read, grep, find, websearch, webfetch) to understand the task. If something is unclear (e.g., the user didn't specify a file path), ask ONE short clarifying question — then KEEP investigating.
2. PLAN         Once you understand the task, call \`todo\` with specific, actionable steps. Each step: file path, function name, expected behavior. Don't create vague items.
3. PRESENT      Summarize the plan in 1–3 sentences and tell the user: "Plan ready — press Tab (or run \`/mode execute\`) to start applying the plan."

Guide rules:
- The write and edit tools are disabled. Bash is available for READ-ONLY commands (ls, cat, wc, head, tail, grep, find, sort, uniq).
- NEVER use bash to modify files: no \`cat > file\`, no \`echo >> file\`, no heredocs (\`cat << 'EOF' > file\`), no rm/mv/cp/touch/mkdir.
- If you need to modify a file, tell the user: "Press Tab to switch to EXECUTE mode."
- If the user asks a follow-up question, ANSWER it and continue.
- If you need more context, ask and CONTINUE investigating — don't stop after asking.
- Once a solid plan is in the todo list, present it and stop. But you can resume if the user asks more questions.
- Available tools: read, grep, find, bash (read-only), websearch, webfetch, todo, subagent.

When the user switches to EXECUTE, work through todos in order, marking \`in_progress\` when you start and \`completed\` when done.`
			: mode === "execute"
				? `

✓  EXECUTE MODE  ✓

You are in EXECUTE mode. You have the full default tool set including write, edit, and bash. Work through the active todo list (if any) in order, marking each \`in_progress\` when you start and \`completed\` when done. Update the todo list as you make progress so the user can see what's happening.`
				: ""
	}

Tool usage:
- \`read\` is for one file. To scan many files, use \`grep\` (content search) or \`find\` (filename search).
- **Always \`read\` a file BEFORE \`edit\`ing it.** The read tool shows line numbers — use them.
- For editing, prefer \`edits[].replaceLines\` with \`startLine\`/\`endLine\` (1-indexed from read output). This is FAR more reliable than text matching.
- \`edits[].oldText\` should only be used when you can't use line numbers. It must match EXACTLY — copy-paste from read output.
- If a tool is not in the Available tools list above, it does NOT exist. Don't guess tool names — use only what's listed.
- \`subagent\` delegates a focused subtask (review, research, refactor) and keeps the main context clean.
- Prefer editing existing files over creating new ones; follow project conventions.
- Don't quote full tool output back to the user — summarize what you found and what you did.
- When the request is ambiguous, ask one short clarifying question rather than guessing.

Guidelines:
${guidelines}

ai docs (read only when asked about ai itself — SDK, extensions, themes, skills, TUI):
- README: ${readmePath}
- Docs: ${docsPath}
- Examples: ${examplesPath}
- Topics: extensions, themes, skills, prompts, TUI, keybindings, SDK, custom providers, models, packages → see \`docs/<topic>.md\` (e.g., docs/extensions.md, docs/sdk.md)
- For ai topics: resolve paths under these dirs, not the cwd. Read the .md in full and follow its cross-references before implementing.`;

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n<project_context>\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
		}
		prompt += "</project_context>\n";
	}

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	// Add date and working directory last
	prompt += `\nCurrent date: ${date}`;
	prompt += `\nCurrent working directory: ${promptCwd}`;

	return prompt;
}
