import { useState } from "react";

export function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// ignore
		}
	};
	return (
		<div className="relative my-4 group">
			<div className="flex items-center justify-between px-4 py-1.5 rounded-t-lg bg-ink-800/80 border border-b-0 border-ink-700/60 text-xs text-ink-400 font-mono">
				<span>{language}</span>
				<button
					onClick={copy}
					className="opacity-60 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-white"
				>
					{copied ? "✓ copied" : "copy"}
				</button>
			</div>
			<pre className="font-mono text-sm leading-relaxed p-4 overflow-x-auto bg-ink-900/80 border border-ink-700/60 rounded-b-lg text-ink-100">
				<code>{code}</code>
			</pre>
		</div>
	);
}
