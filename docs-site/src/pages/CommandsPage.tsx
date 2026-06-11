import { useMemo, useState } from "react";
import { commands, commandGroups } from "../data/commands";

export function CommandsPage() {
	const [q, setQ] = useState("");
	const filtered = useMemo(() => {
		const lower = q.toLowerCase();
		return commands.filter(
			(c) =>
				c.name.toLowerCase().includes(lower) ||
				c.description.toLowerCase().includes(lower) ||
				c.group.toLowerCase().includes(lower),
		);
	}, [q]);

	const grouped = useMemo(() => {
		const m = new Map<string, typeof commands>();
		for (const c of filtered) {
			if (!m.has(c.group)) m.set(c.group, []);
			m.get(c.group)!.push(c);
		}
		return commandGroups
			.map((g) => ({ group: g, items: m.get(g) ?? [] }))
			.filter((g) => g.items.length > 0);
	}, [filtered]);

	return (
		<article className="section py-16 max-w-5xl">
			<h1 className="text-3xl font-bold text-white mb-3">Slash commands</h1>
			<p className="text-ink-300 mb-8 max-w-2xl">
				Every command is registered in <code>BUILTIN_SLASH_COMMANDS</code> and shows up in the
				autocomplete picker as you type <code>/</code>. Extensions can add their own.
			</p>

			<input
				type="text"
				placeholder="Filter commands…"
				value={q}
				onChange={(e) => setQ(e.target.value)}
				className="w-full mb-8 bg-ink-800/60 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 placeholder-ink-500 focus:outline-none focus:border-accent-500/60"
			/>

			<div className="space-y-10">
				{grouped.map(({ group, items }) => (
					<div key={group}>
						<h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
							<span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
							{group}
							<span className="tag-muted ml-2">{items.length}</span>
						</h2>
						<div className="grid gap-3">
							{items.map((c) => (
								<div
									key={c.name}
									className="glass p-4 hover:border-accent-500/30 transition-colors"
								>
									<div className="flex items-baseline gap-3 mb-1.5">
										<code className="text-accent-300 font-mono text-sm">/{c.name}</code>
										<span className="text-ink-200 text-sm">{c.description}</span>
									</div>
									{c.example && (
										<pre className="mt-2 font-mono text-xs bg-ink-900/80 border border-ink-800 rounded-md p-2 text-ink-300">
											<code>{c.example}</code>
										</pre>
									)}
								</div>
							))}
						</div>
					</div>
				))}
			</div>

			{filtered.length === 0 && (
				<div className="text-center py-16 text-ink-500">
					No commands match <code>{q}</code>. Press Esc to clear the filter.
				</div>
			)}
		</article>
	);
}
