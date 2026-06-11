import { Link } from "react-router-dom";
import { features } from "../data/features";

export function HomePage() {
	return (
		<>
			<Hero />
			<Highlights />
			<QuickDemo />
			<FeatureGrid />
			<ArchitectureSection />
			<GettingStarted />
		</>
	);
}

function Hero() {
	return (
		<section className="relative overflow-hidden">
			<div className="absolute inset-0 grid-bg opacity-40" />
			<div
				className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-30 blur-3xl"
				style={{ background: "radial-gradient(closest-side, #4f76ee, transparent)" }}
			/>
			<div className="section relative pt-20 pb-24">
				<div className="max-w-4xl">
					<div className="flex items-center gap-3 mb-6">
						<span className="tag">v0.79.6</span>
						<span className="tag-muted">production build</span>
						<span className="tag-muted">self-extensible</span>
					</div>
					<h1 className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.05]">
						A coding agent for the terminal that{" "}
						<span className="gradient-text">thinks, plans, and ships</span>.
					</h1>
					<p className="mt-6 text-lg text-ink-300 max-w-2xl leading-relaxed">
						ai reads your code, runs your tests, edits files, and reports back — all in a single
						agent loop with first-class extension support. Start in <strong>PLAN</strong> mode for
						safe exploration, flip to <strong>EXECUTE</strong> to apply changes.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-3">
						<Link to="/install" className="btn-primary">
							<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
							</svg>
							Install ai
						</Link>
						<Link to="/features" className="btn-ghost">
							See all features
						</Link>
						<a
							href="https://github.com/simpletoolsindia/ai"
							target="_blank"
							rel="noreferrer"
							className="btn-ghost"
						>
							Star on GitHub
						</a>
					</div>
					<div className="mt-12 max-w-2xl">
						<Terminal />
					</div>
				</div>
			</div>
		</section>
	);
}

function Terminal() {
	return (
		<div className="rounded-xl bg-ink-900/80 border border-ink-800 backdrop-blur-md overflow-hidden shadow-2xl shadow-accent-900/20">
			<div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-800/60 bg-ink-900/60">
				<span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
				<span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
				<span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
				<span className="ml-3 text-xs text-ink-500 font-mono">~/projects/ai</span>
			</div>
			<pre className="font-mono text-sm leading-relaxed p-5 overflow-x-auto text-ink-100">
				<code>
					<span className="text-accent-300">$</span> ai -p "add a /help command to the slash-command table"
					{"\n"}
					<span className="text-ink-500">[PLAN]  read packages/coding-agent/src/core/slash-commands.ts</span>
					{"\n"}
					<span className="text-ink-500">[PLAN]  draft a plan: add description, group by category, render on /help</span>
					{"\n"}
					<span className="text-accent-400">→</span> Press <span className="kbd">Tab</span> to switch to EXECUTE mode
					{"\n\n"}
					<span className="text-ink-300">Plan ready. Confirm to apply (y/n):</span>{" "}
					<span className="text-accent-200">y</span>
					{"\n\n"}
					<span className="text-ink-500">[EXECUTE]  edit slash-commands.ts</span>
					{"\n"}
					<span className="text-ink-500">[EXECUTE]  edit interactive-mode.ts (handleHelpCommand)</span>
					{"\n"}
					<span className="text-ink-500">[EXECUTE]  npm test  →  362 passed</span>
					{"\n\n"}
					<span className="text-accent-200">✓</span> Done. <span className="text-ink-400">/help now lists every command.</span>
				</code>
			</pre>
		</div>
	);
}

function Highlights() {
	const items = [
		{
			icon: "🤖",
			title: "Single agent loop",
			body: "Read, run, edit, write — the model keeps iterating until the task is done or it needs your input.",
		},
		{
			icon: "🛡️",
			title: "PLAN by default",
			body: "Every new session starts in read-only PLAN mode. The model can only search, read, and propose a plan. Press Tab to switch to EXECUTE.",
		},
		{
			icon: "🔌",
			title: "Self-extensible",
			body: "Add slash commands, tools, message renderers, and keybindings via a single extension file. Ship them in the repo or in ~/.ai/agent/extensions/.",
		},
		{
			icon: "🌐",
			title: "20+ providers, zero config",
			body: "Anthropic, OpenAI, Google, Mistral, Bedrock, Groq, Together, Fireworks, LM Studio, vLLM, Ollama (auto-discovered) — pick one in the picker.",
		},
		{
			icon: "🔍",
			title: "Web search & fetch",
			body: "Built-in websearch uses a SearXNG endpoint (configurable). webfetch retrieves and renders any URL with full content spillover.",
		},
		{
			icon: "🧠",
			title: "Persistent memory",
			body: "Optional hermes-memory extension records what the agent learns and surfaces it across sessions, scoped to project and provider.",
		},
	];
	return (
		<section className="section py-20">
			<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
				{items.map((it) => (
					<div key={it.title} className="glass p-6 hover:border-accent-500/30 transition-colors">
						<div className="text-2xl mb-3">{it.icon}</div>
						<h3 className="text-white font-semibold mb-2">{it.title}</h3>
						<p className="text-sm text-ink-300 leading-relaxed">{it.body}</p>
					</div>
				))}
			</div>
		</section>
	);
}

function QuickDemo() {
	return (
		<section className="section py-16">
			<div className="text-center mb-12">
				<h2 className="text-3xl font-bold text-white mb-3">From prompt to pull request, in one loop</h2>
				<p className="text-ink-300 max-w-2xl mx-auto">
					ai is not a chat window. It actually runs your tests, applies the diff, and re-runs the
					suite. You watch it iterate.
				</p>
			</div>
			<div className="grid lg:grid-cols-2 gap-6">
				<DemoBlock
					title="Refactor a module"
					rows={[
						{ tag: "$", body: 'ai -p "split auth.ts into auth/ directory"' },
						{ tag: "→", body: "reads auth.ts, plans 5 new files, asks for confirmation" },
						{ tag: "✓", body: "applies diff, runs test suite, 412/412 pass" },
					]}
				/>
				<DemoBlock
					title="Debug a failing test"
					rows={[
						{ tag: "$", body: 'ai -p "why is test_x flaky?"' },
						{ tag: "→", body: "reads test, traces imports, finds race in fixture cleanup" },
						{ tag: "✓", body: "patches fixture, runs 50×, 0 flakes" },
					]}
				/>
				<DemoBlock
					title="Onboard a new repo"
					rows={[
						{ tag: "$", body: 'ai -p "summarize this repo, find the entry points, list TODOs"' },
						{ tag: "→", body: "reads README, scans src/, groups TODOs by file" },
						{ tag: "✓", body: "produces 14-line summary + 3 prioritized TODOs" },
					]}
				/>
				<DemoBlock
					title="Migrate a provider"
					rows={[
						{ tag: "$", body: 'ai -p "switch the test provider from OpenAI to Ollama"' },
						{ tag: "→", body: "edits models.json, configures autoDiscover, runs /login dry-run" },
						{ tag: "✓", body: "tests pass on local Ollama, no internet required" },
					]}
				/>
			</div>
		</section>
	);
}

function DemoBlock({ title, rows }: { title: string; rows: Array<{ tag: string; body: string }> }) {
	return (
		<div className="glass overflow-hidden">
			<div className="px-5 py-3 border-b border-ink-800/60 flex items-center justify-between">
				<span className="font-semibold text-white text-sm">{title}</span>
				<span className="tag-muted">live</span>
			</div>
			<pre className="font-mono text-sm leading-relaxed p-5 space-y-1">
				{rows.map((r, i) => (
					<div key={i} className="flex gap-2">
						<span className={r.tag === "✓" ? "text-accent-300" : r.tag === "→" ? "text-accent-400" : "text-accent-300"}>
							{r.tag}
						</span>
						<span className="text-ink-200">{r.body}</span>
					</div>
				))}
			</pre>
		</div>
	);
}

function FeatureGrid() {
	return (
		<section className="section py-20">
			<div className="text-center mb-12">
				<h2 className="text-3xl font-bold text-white mb-3">Every feature, on one page</h2>
				<p className="text-ink-300 max-w-2xl mx-auto">
					For the deep dive on each one (with examples and keybindings), see the{" "}
					<Link to="/features" className="text-accent-300 hover:text-accent-200">
						features
					</Link>{" "}
					page.
				</p>
			</div>
			<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{features.map((f) => (
					<Link
						key={f.title}
						to={f.link}
						className="glass p-5 hover:border-accent-500/40 transition-all hover:-translate-y-0.5"
					>
						<div className="text-2xl mb-3">{f.icon}</div>
						<h3 className="text-white font-semibold mb-1.5">{f.title}</h3>
						<p className="text-sm text-ink-300 leading-relaxed">{f.summary}</p>
						<div className="mt-3 text-xs text-accent-300 font-medium">Read more →</div>
					</Link>
				))}
			</div>
		</section>
	);
}

function ArchitectureSection() {
	return (
		<section className="section py-20">
			<div className="glass p-8 lg:p-10">
				<h2 className="text-2xl font-bold text-white mb-2">How it fits together</h2>
				<p className="text-ink-300 mb-8 max-w-2xl">
					ai is a thin orchestration layer over four focused packages. Each one is independently
					published to npm.
				</p>
				<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
					<PackageCard
						name="@simpletoolsindiaorg/ai-provider"
						desc="Model API contracts, streaming, tool-call parsing, OAuth, 20+ built-in providers."
					/>
					<PackageCard
						name="@simpletoolsindiaorg/ai-tui"
						desc="Terminal UI primitives: editor, autocomplete, dialogs, keybindings, theming."
					/>
					<PackageCard
						name="@simpletoolsindiaorg/ai-agent"
						desc="Core agent loop: messages, tools, subagents, telemetry, prompt caching."
					/>
					<PackageCard
						name="@simpletoolsindiaorg/ai-coding-agent"
						desc="The ai CLI: slash commands, settings, mode (PLAN/EXECUTE), extensions, hermes-memory."
					/>
				</div>
			</div>
		</section>
	);
}

function PackageCard({ name, desc }: { name: string; desc: string }) {
	return (
		<div className="rounded-lg border border-ink-800 bg-ink-900/60 p-4">
			<code className="text-xs font-mono text-accent-300 break-all">{name}</code>
			<p className="text-sm text-ink-300 mt-2 leading-relaxed">{desc}</p>
		</div>
	);
}

function GettingStarted() {
	return (
		<section className="section py-20">
			<div className="rounded-2xl bg-gradient-to-br from-accent-700/30 via-accent-600/20 to-transparent border border-accent-500/30 p-8 lg:p-12">
				<h2 className="text-3xl font-bold text-white mb-3">Ready in 30 seconds</h2>
				<p className="text-ink-200 max-w-2xl mb-6">
					One command installs the ai CLI plus all four packages. Then point it at any model and
					start coding.
				</p>
				<div className="font-mono text-sm bg-ink-900/80 border border-ink-800 rounded-lg p-4 text-ink-100 overflow-x-auto">
					<span className="text-accent-300">$</span>{" "}
					curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
				</div>
				<div className="mt-6 flex flex-wrap gap-3">
					<Link to="/install" className="btn-primary">
						Full install guide
					</Link>
					<Link to="/commands" className="btn-ghost">
						Browse commands
					</Link>
				</div>
			</div>
		</section>
	);
}
