import { CodeBlock } from "../components/CodeBlock";

export function InstallPage() {
	return (
		<article className="section py-16 prose-doc max-w-4xl">
			<h1>Install ai</h1>
			<p>
				ai ships as four npm packages under the{" "}
				<code>@simpletoolsindiaorg</code> scope, plus a single shell installer that does the
				whole job in one go.
			</p>

			<h2>One-liner (recommended)</h2>
			<CodeBlock
				language="bash"
				code={`curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash`}
			/>
			<p>The installer will:</p>
			<ul>
				<li>Detect Node.js and npm (requires Node 20+).</li>
				<li>Clone the repo to a temp directory, build all four packages, link the global binary.</li>
				<li>Symlink <code>ai</code> into <code>~/.ai/bin/</code> and append the path to your shell rc.</li>
				<li>Download <code>fd</code> and <code>ripgrep</code> into <code>~/.ai/agent/bin/</code> if missing.</li>
			</ul>

			<h2>Install a specific version</h2>
			<CodeBlock
				language="bash"
				code={`curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --ref v0.79.6`}
			/>

			<h2>From npm only (no build)</h2>
			<CodeBlock
				language="bash"
				code={`npm install -g @simpletoolsindiaorg/ai-coding-agent@0.79.7
npm rebuild -g better-sqlite3
ai --version`}
			/>
			<p>
				The npm install is faster but you lose the ability to read or modify source from{" "}
				<code>~/.ai/source</code>. Use the install.sh if you want a full local source tree.
			</p>

			<h2>System requirements</h2>
			<ul>
				<li>
					<strong>Node.js</strong> 20+ (tested on 22 and 24)
				</li>
				<li>
					<strong>macOS</strong> (Intel or Apple Silicon) or <strong>Linux</strong> (x64 or arm64)
				</li>
				<li>
					<strong>Windows</strong>: WSL2 recommended. Native Windows builds are skipped.
				</li>
				<li>
					<strong>Disk</strong>: ~150 MB for the source tree, ~50 MB for the linked binary
				</li>
			</ul>

			<h2>Verify the install</h2>
			<CodeBlock language="bash" code={`$ ai --version
0.79.6

$ which ai
/Users/you/.ai/bin/ai`} />

			<h2>Add to PATH (if needed)</h2>
			<p>The installer adds this to your shell rc. If it didn't take effect, run:</p>
			<CodeBlock language="bash" code={`# zsh (macOS default)
echo 'export PATH="$PATH:$HOME/.ai/bin"' >> ~/.zshrc
source ~/.zshrc

# bash (Linux default)
echo 'export PATH="$PATH:$HOME/.ai/bin"' >> ~/.bashrc
source ~/.bashrc`} />

			<h2>Uninstall</h2>
			<CodeBlock
				language="bash"
				code={`# Remove the binary
npm uninstall -g @simpletoolsindiaorg/ai-coding-agent
# or, if installed via install.sh:
rm -rf ~/.ai/bin/ai

# Remove the user data (DESTRUCTIVE: clears sessions, settings, memory)
rm -rf ~/.ai`}
			/>

			<h2>Updating</h2>
			<p>
				Re-run the install script with a newer <code>--ref</code>. It will replace the binary
				without touching your <code>~/.ai/agent/</code> data.
			</p>
			<CodeBlock
				language="bash"
				code={`curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash -s -- --ref v0.79.6`}
			/>

			<h2>First run</h2>
			<p>
				Start ai. The first turn will pick a default model (or the one you used last). If you
				have no provider configured, it prompts you to <code>/login</code>.
			</p>
			<CodeBlock language="bash" code={`$ ai
# A welcome screen appears. Press Tab to switch from PLAN to EXECUTE.
# Type your task and press Enter.`} />
		</article>
	);
}
