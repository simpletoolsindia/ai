/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { createDynamicSkillsLoader, formatSkillsForPromptLazy, type ScoredSkill } from "./dynamic-skills.ts";
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
	/** User query for dynamic skills loading. */
	userQuery?: string;
	/** Whether to use dynamic skills loading. */
	useDynamicSkills?: boolean;
	/** Maximum number of skills to include in prompt. */
	maxSkills?: number;
	/** Minimum relevance score threshold (0-1). */
	minRelevance?: number;
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
		userQuery,
		useDynamicSkills = false,
		maxSkills = 10,
		minRelevance = 0.3,
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

	// Use dynamic skills loading if enabled and user query is provided
	let skillsToInclude: Skill[] | ScoredSkill[] = skills;
	if (useDynamicSkills && userQuery && skills.length > 0) {
		const loader = createDynamicSkillsLoader({
			maxSkills,
			minRelevance,
		});
		// Note: This is synchronous for now, but could be made async
		// For now, we'll use the static skills but with dynamic formatting
		skillsToInclude = skills;
	}

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
		if (customPromptHasRead && skillsToInclude.length > 0) {
			if (useDynamicSkills) {
				prompt += formatSkillsForPromptLazy(skillsToInclude as ScoredSkill[]);
			} else {
				prompt += formatSkillsForPrompt(skillsToInclude);
			}
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

	// Categorize tools for better organization
	const toolCategories: Record<string, string[]> = {
		"File Operations": ["read", "write", "edit", "apply_patch", "multi_edit"],
		Search: ["grep", "find", "ls"],
		Execution: ["bash", "test"],
		Delegation: ["subagent", "todo"],
		Web: ["websearch", "webfetch"],
	};

	// Build categorized tools list
	let toolsList = "";
	if (visibleTools.length > 0) {
		const categorized = new Set<string>();
		for (const [category, categoryTools] of Object.entries(toolCategories)) {
			const categoryVisible = visibleTools.filter((name) => categoryTools.includes(name));
			if (categoryVisible.length > 0) {
				toolsList += `\n[${category}]\n`;
				for (const name of categoryVisible) {
					const snippet = toolSnippets![name];
					// Add concise examples for common tools
					const examples: Record<string, string> = {
						read: ' Example: read({ path: "src/index.ts", offset: 10, limit: 50 })',
						edit: ' Example: edit({ path: "src/index.ts", replaceLines: [{ startLine: 5, endLine: 5, newText: "const x = 1;" }] })',
						write: ' Example: write({ path: "src/new.ts", content: "export default {};" })',
						bash: ' Example: bash({ command: "npm test", timeout: 120 })',
						grep: ' Example: grep({ pattern: "TODO", glob: "*.ts", context: 2 })',
						find: ' Example: find({ pattern: "**/*.test.ts" })',
						ls: ' Example: ls({ path: "src" })',
						todo: ' Example: todo({ todos: [{ content: "Fix bug", status: "in_progress" }] })',
						test: ' Example: test({ pattern: "auth.test.ts" })',
						apply_patch:
							' Example: apply_patch({ path: "src/index.ts", patch: "@@ -5,3 +5,4 @@\\n-old\\n+new" })',
						multi_edit: ' Example: multi_edit({ edits: [{ path: "src/a.ts", replaceLines: [...] }] })',
					};
					const example = examples[name] || "";
					toolsList += `- ${name}: ${snippet}${example}\n`;
					categorized.add(name);
				}
			}
		}

		// Add uncategorized tools
		const uncategorized = visibleTools.filter((name) => !categorized.has(name));
		if (uncategorized.length > 0) {
			toolsList += `\n[Other]\n`;
			for (const name of uncategorized) {
				const snippet = toolSnippets![name];
				toolsList += `- ${name}: ${snippet}\n`;
			}
		}
	} else {
		toolsList = "(none)";
	}

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

	// Always include these (consolidated to avoid duplication with intro)
	addGuideline("Show file paths clearly.");
	addGuideline("No tool or data? Say so — never confabulate URLs, paths, or facts.");
	addGuideline("Current/external info → use websearch/webfetch, don't guess.");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = `You are an expert coding assistant in ai. You operate in an agent loop: call tools, observe results, iterate until the task is done or you need user input.${
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
- Bash is read-only: Use ls, cat, wc, head, tail, grep, find, sort, uniq. These commands don't modify files. Never use >, >>, rm, mv, cp, touch, mkdir, sed, awk, or any command that writes to disk.
- Never modify files in plan mode (no \`cat >\`, no heredocs, no rm/mv/cp/touch/mkdir).
- If the user asks a follow-up, ANSWER and continue investigating.`
			: mode === "execute"
				? `

✓  EXECUTE MODE  ✓

Full tool set. Work through the active todo list in order. Mark \`in_progress\` when you start, \`completed\` when done. Update the list as you go.`
				: ""
	}

Available tools:
${toolsList}
(Other custom tools may be available.)

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
	if (hasRead && skillsToInclude.length > 0) {
		if (useDynamicSkills) {
			prompt += formatSkillsForPromptLazy(skillsToInclude as ScoredSkill[]);
		} else {
			prompt += formatSkillsForPrompt(skillsToInclude);
		}
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
