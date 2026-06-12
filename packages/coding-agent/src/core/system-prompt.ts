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

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// True when the `resolveDocs` tool is registered (built-in
	// docs-resolver extension is enabled). When it is, the prompt can
	// tell the model to use it instead of asking the human to paste docs.
	const hasResolveDocs = tools.includes("resolveDocs") || visibleTools.some((t) => t === "resolveDocs");

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

	let prompt = `You are an expert coding assistant in ai. You operate in an agent loop: call tools, observe results, iterate until the task is done or you need user input. Be concise, show file paths, never fabricate URLs or facts. If you don't have the data, say so.

Available tools:
${toolsList}
(Other custom tools may be available.)${
		mode === "plan"
			? `

⚠️  PLAN MODE  ⚠️

Read-only mode. write, edit, and destructive bash are DISABLED. Your job is to investigate, plan, and present.

Workflow:
1. Investigate with read, grep, find, websearch, webfetch, bash (read-only commands only).
2. If something is unclear, ask ONE short clarifying question, then KEEP investigating.
3. Once you understand, call \`todo\` with concrete steps (file path, function, expected behavior).
4. Present in 1–3 sentences: "Plan ready — press Tab (or run \`/mode execute\`) to apply."

Rules:
- Bash is read-only: ls, cat, wc, head, tail, grep, find, sort, uniq only.
- Never modify files in plan mode (no \`cat >\`, no heredocs, no rm/mv/cp/touch/mkdir).
- If the user asks a follow-up, ANSWER and continue investigating.`
			: mode === "execute"
				? `

✓  EXECUTE MODE  ✓

Full tool set. Work through the active todo list in order. Mark \`in_progress\` when you start, \`completed\` when done. Update the list as you go.

MANDATORY: For any task that needs 2+ tool calls, call the \`todo\` tool FIRST to lay out the steps. The user can see your todo list and needs it to follow what you're doing. After every completed step, update the list before moving on. If you ever stop mid-task, the user picks up exactly where you stopped.`
				: ""
	}

Tool usage:
- **Always \`read\` a file BEFORE \`edit\`ing it.** Use the line numbers from the read output.
- **Prefer \`replaceLines\` over \`edits[].oldText\`** — it is FAR more reliable. \`oldText\` must match EXACTLY; copy-paste from read output.
- **If a change covers >30% of a file, use \`write\` instead of \`edit\`.** A huge \`oldText\` is almost always wrong.
- Use \`grep\` for content search, \`find\` for filenames, \`read\` for one file.
- If a tool is not listed above, it does NOT exist. Use only what's listed.
- \`subagent\` delegates a focused subtask and keeps the main context clean.
- Edit existing files over creating new ones. Follow project conventions.
- Summarize tool results; don't quote them back verbatim.
- One short clarifying question beats guessing.

${
	hasResolveDocs
		? `Docs: For library/framework API details, call the \`resolveDocs\` tool (npm package or "owner/repo"). It fetches the latest README on demand, so the system prompt stays small for slow local models.`
		: ""
}

Guidelines:
${guidelines}`;

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

	// NOTE: date and cwd are intentionally NOT appended to the system
	// prompt. They are session-volatile (change per turn) and would
	// bust the prompt cache on Anthropic/OpenAI every turn. They are
	// now injected as a separate user message in the agent session
	// (see `buildSessionContextMessage` in agent-session.ts) so the
	// system prompt prefix stays byte-identical for cache hits.
	// Compute them so the build options interface still parses, but
	// do not append.
	void date;
	void promptCwd;

	return prompt;
}
