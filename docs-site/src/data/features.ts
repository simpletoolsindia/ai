export type Feature = {
	icon: string;
	title: string;
	summary: string;
	link: string;
	details: string;
};

export const features: Feature[] = [
	{
		icon: "🛡️",
		title: "PLAN / EXECUTE modes",
		summary:
			"Start in read-only PLAN. The model can only search, read, and propose a plan. Press Tab to switch to EXECUTE and let it write.",
		link: "/features#plan-execute",
		details:
			"Every new session starts in PLAN mode. The footer shows the current mode as a badge. The system prompt gets a one-line note when in PLAN. Stripped tools: write, edit, bash. Restored in EXECUTE.",
	},
	{
		icon: "🔌",
		title: "Self-extensible",
		summary: "Drop a TypeScript file in extensions/ and you have a new slash command, tool, or renderer.",
		link: "/features#extensions",
		details:
			"Each extension exports a factory that registers commands, tools, message renderers, flags, and keybindings. Ship your own and they show up in the picker with no extra wiring.",
	},
	{
		icon: "🌐",
		title: "20+ providers out of the box",
		summary:
			"Anthropic, OpenAI, Google, Mistral, Bedrock, Groq, Together, Fireworks, LM Studio, vLLM, Ollama (auto-discovered).",
		link: "/features#providers",
		details:
			"Run /login to add a custom OpenAI-compatible endpoint at runtime. The dialog writes to models.json and auth.json. Ollama is auto-discovered from http://localhost:11434.",
	},
	{
		icon: "🔍",
		title: "Web search & fetch",
		summary: "Built-in websearch via SearXNG (configurable). webfetch retrieves any URL with content spillover.",
		link: "/features#websearch",
		details:
			"Run /searcheng to point at a different SearXNG endpoint. webfetch supports image fetch, Markdown rendering, and falls back to a content spillover file when the response is huge.",
	},
	{
		icon: "🧠",
		title: "Hermes persistent memory",
		summary: "Optional built-in extension. Records what the agent learns and surfaces it across sessions.",
		link: "/features#memory",
		details:
			"Stored in SQLite (better-sqlite3). Scoped per project. Surfaces a /memory slash command and auto-injects relevant context on the first turn of a new session.",
	},
	{
		icon: "🗜️",
		title: "Auto-compaction",
		summary: "When the context hits 90% full, the session compacts itself. No more out-of-context crashes.",
		link: "/features#compaction",
		details:
			"Configurable via settings.json: { compaction: { enabled, threshold, reserveTokens, keepRecentTokens } }. Default threshold is 0.9 (90% of context window).",
	},
	{
		icon: "📦",
		title: "Subagents & parallel work",
		summary: "Spawn a subagent to investigate a question while the main agent keeps going. Results merge back.",
		link: "/features#subagents",
		details:
			"The subagent tool runs an isolated agent with its own context, then returns the final assistant message. Use it for read-only exploration so the main thread stays clean.",
	},
	{
		icon: "⌨️",
		title: "Full keyboard control",
		summary: "Every action has a keybinding. Press Tab to flip mode, Ctrl+O to expand tool output, Ctrl+L to pick a model.",
		link: "/commands",
		details:
			"Keybindings are stored in ~/.ai/agent/keybindings.json. Override any default. Run /hotkeys for the live reference.",
	},
	{
		icon: "📝",
		title: "Slash commands for everything",
		summary: "20+ built-in commands. Add your own via extensions or as Markdown prompt templates.",
		link: "/commands",
		details:
			"Run /help for the full list. Each command has a description registered in BUILTIN_SLASH_COMMANDS so the autocomplete picker shows them.",
	},
];
