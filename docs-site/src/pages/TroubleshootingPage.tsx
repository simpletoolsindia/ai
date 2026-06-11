import { CodeBlock } from "../components/CodeBlock";

export function TroubleshootingPage() {
	return (
		<article className="section py-16 prose-doc max-w-4xl">
			<h1>Troubleshooting</h1>
			<p>
				Most issues fall into one of the buckets below. If none of these help, file an issue on
				GitHub with the output of <code>ai --version</code> and{" "}
				<code>cat ~/.ai/agent/settings.json</code>.
			</p>

			<h2>"Model not found"</h2>
			<p>
				The model name you typed doesn't match anything in the registry. Run{" "}
				<code>ai --list-models</code> to see what's available. For Ollama, make sure the
				provider is configured with <code>autoDiscover: "ollama"</code> in{" "}
				<code>~/.ai/agent/models.json</code> so the model picker auto-populates.
			</p>

			<h2>Tab key doesn't toggle mode</h2>
			<p>
				Tab is bound to <code>app.mode.toggle</code> and fires from inside the editor's input
				handler. If it's not working:
			</p>
			<ul>
				<li>Check <code>~/.ai/agent/keybindings.json</code> doesn't override it.</li>
				<li>
					Try <code>Ctrl+L</code> for the model picker — it also shows the current mode in
					the header.
				</li>
				<li>
					As a fallback, run <code>/mode toggle</code> in the TUI.
				</li>
			</ul>

			<h2>Ctrl+O doesn't expand the welcome screen</h2>
			<p>
				<code>app.tools.expand</code> is bound to <code>ctrl+o</code> by default. If it doesn't
				fire, the most likely cause is another extension or a custom{" "}
				<code>keybindings.json</code> overriding it. Run <code>/hotkeys</code> to see the active
				binding.
			</p>

			<h2>fd / ripgrep downloads on every launch</h2>
			<p>
				The first launch downloads <code>fd</code> and <code>rg</code> to{" "}
				<code>~/.ai/agent/bin/</code>. If your network blocks the download, set{" "}
				<code>NO_FD_DOWNLOAD=1</code> and <code>NO_RG_DOWNLOAD=1</code> in the environment, or
				pre-install both via your package manager and make sure they're on PATH.
			</p>

			<h2>Native binding fails to build</h2>
			<p>
				<code>better-sqlite3</code> needs a C++ toolchain. On macOS: <code>xcode-select --install</code>.
				On Debian/Ubuntu: <code>sudo apt install build-essential python3</code>. After
				installing, run <code>npm rebuild -g better-sqlite3</code>.
			</p>

			<h2>Skill warnings on every start</h2>
			<p>
				ai now silently derives a description from the first heading when a skill is missing
				the <code>description</code> frontmatter field. If you want a real description (e.g.
				for the picker), add one to the <code>SKILL.md</code>:
			</p>
			<CodeBlock
				language="markdown"
				code={`---
name: my-skill
description: A short, single-line description of what this skill does
---

# My Skill
...`}
			/>

			<h2>Custom provider not showing up</h2>
			<p>
				After running <code>/login</code> → "Add OpenAI-compatible provider", the new entry
				should appear in the model picker. If it doesn't, check that{" "}
				<code>~/.ai/agent/models.json</code> parses:
			</p>
			<CodeBlock language="bash" code={`node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/.ai/agent/models.json')))"`} />

			<h2>"Settings file not found" on first launch</h2>
			<p>
				This is just <code>context-mode</code> warning that the optional config doesn't exist
				yet. The agent creates it lazily. To silence the warning, set{" "}
				<code>contextMode.enabled = true</code> (or <code>false</code>) in{" "}
				<code>~/.ai/agent/settings.json</code>.
			</p>

			<h2>Reset everything</h2>
			<CodeBlock
				language="bash"
				code={`# Back up first
cp -r ~/.ai ~/.ai.backup

# Wipe and re-onboard
rm -rf ~/.ai
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash`}
			/>
		</article>
	);
}
