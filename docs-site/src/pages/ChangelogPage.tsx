export function ChangelogPage() {
	const releases = [
		{
			version: "0.79.6",
			date: "2026-06-11",
			tagline: "Welcome screen polish + PLAN-by-default + /help",
			items: [
				"PLAN mode is now the default — new sessions can't write files until the user presses Tab or runs /mode execute.",
				"Tab keybinding now toggles between PLAN and EXECUTE.",
				"Welcome screen revamped: ASCII art logo, compact one-liner with every important shortcut, no more fork boilerplate.",
				"Inline extension list shows built-in:hermes-memory / built-in:context-mode instead of <inline:1>, <inline:2>.",
				"Skills with missing description fields now load silently (description is derived from the first heading).",
				"Last-used model is auto-restored on the next launch (no re-picking the provider every time).",
				"New /help slash command lists every command with a description, grouped by category.",
				"/searcheng, /mode, /login → 'Add OpenAI-compatible provider' all polished and documented.",
			],
		},
		{
			version: "0.79.4",
			date: "2026-06-11",
			tagline: "PLAN / EXECUTE mode + footer badge",
			items: [
				"New agent mode: 'plan' (read-only, strips write/edit/bash) and 'execute' (default, full tools).",
				"New /mode slash command with sub-args plan / execute / toggle.",
				"Mode badge in the footer: PLAN in warning color, EXECUTE in dim.",
				"Mode is persisted to settings.json under agentMode.",
				"System prompt gets a one-line PLAN-mode hint when in plan mode.",
				"9 new tests in test/agent-mode.test.ts.",
			],
		},
		{
			version: "0.79.3",
			date: "2026-06-11",
			tagline: "Dynamic working messages",
			items: [
				"Spinner cycles through Thinking... → Working... → Tool calling... → Executing task... → Almost done...",
				"Driven by agent_start, message_start, message_update, tool_execution_start/end, message_end events.",
				"3 regression tests in test/dynamic-working-messages.test.ts.",
			],
		},
		{
			version: "0.79.2",
			date: "2026-06-11",
			tagline: "Final production build",
			items: [
				"/login → 'Add OpenAI-compatible provider' 5-step dialog writes to models.json + auth.json.",
				"Auto-compaction at 90% of context window (configurable via compaction.threshold).",
				"System prompt optimized (~17% shorter, all rules preserved).",
				"Tool usage section added to system prompt.",
			],
		},
		{
			version: "0.79.1",
			date: "2026-06-11",
			tagline: "Web search + local Ollama fixes",
			items: [
				"/searcheng command to view/update the SearXNG endpoint.",
				"providers.websearch config wired into the websearch tool.",
				"Three real Ollama bugs fixed: model discovery timing, MissingApiKeyError for optional auth, and a build error from earlier session refactor.",
			],
		},
		{
			version: "0.79.0",
			date: "2026-06-11",
			tagline: "Initial ai fork release",
			items: [
				"First public release of the ai fork under @simpletoolsindiaorg on npm.",
				"20+ providers, full extension system, PLAN/EXECUTE groundwork, hermes-memory + context-mode bundled.",
				"Websearch, webfetch, subagent, todo, spillover, all the modern tooling.",
			],
		},
	];

	return (
		<article className="section py-16 max-w-4xl">
			<h1 className="text-3xl font-bold text-white mb-3">Changelog</h1>
			<p className="text-ink-300 mb-10 max-w-2xl">
				Major and minor releases for ai. For the full history of inherited entries, see{" "}
				<code>packages/coding-agent/CHANGELOG.md</code> in the repo.
			</p>

			<div className="space-y-10">
				{releases.map((r) => (
					<div key={r.version} className="relative pl-6 border-l-2 border-ink-800">
						<div className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-accent-500 border-4 border-ink-900" />
						<div className="flex items-baseline gap-3 mb-2">
							<h2 className="text-xl font-bold text-white">v{r.version}</h2>
							<span className="text-xs text-ink-500 font-mono">{r.date}</span>
						</div>
						<p className="text-ink-300 text-sm italic mb-3">{r.tagline}</p>
						<ul className="text-ink-200 text-sm space-y-1.5 list-disc pl-5">
							{r.items.map((it, i) => (
								<li key={i}>{it}</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</article>
	);
}
