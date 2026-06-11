import { CodeBlock } from "../components/CodeBlock";

export function ConfigurationPage() {
	return (
		<article className="section py-16 prose-doc max-w-4xl">
			<h1>Configuration</h1>
			<p>
				ai stores all settings in a single JSON file. The agent dir is{" "}
				<code>~/.ai/agent/</code> by default and can be overridden via the{" "}
				<code>AI_CODING_AGENT_DIR</code> env var.
			</p>

			<h2>Settings file location</h2>
			<ul>
				<li>
					<strong>Global</strong>: <code>~/.ai/agent/settings.json</code> (applies to every
					project)
				</li>
				<li>
					<strong>Project</strong>: <code>.ai/settings.json</code> in the working directory
					(only loaded when the project is <code>trusted</code>)
				</li>
			</ul>

			<h2>Full settings reference</h2>
			<CodeBlock
				language="json"
				code={`{
  "agentMode": "plan",
  "defaultProvider": "ollama",
  "defaultModel": "gemma4:e2b",
  "defaultThinkingLevel": "low",
  "transport": "auto",
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "threshold": 0.9,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "backoffMs": 500
  },
  "hideThinkingBlock": false,
  "shellPath": "",
  "quietStartup": false,
  "enabledModels": ["ollama/gemma4:e2b"],
  "doubleEscapeAction": "tree"
}`}
			/>

			<h2>PLAN / EXECUTE mode</h2>
			<p>
				<strong>Default: <code>"plan"</code></strong>. The model cannot use{" "}
				<code>write</code>, <code>edit</code>, or <code>bash</code> in PLAN. Switch with{" "}
				<code>/mode execute</code>, the <span className="kbd">Tab</span> key, or by editing this
				field. The footer shows the current mode as a badge.
			</p>

			<h2>Compaction</h2>
			<p>
				When the session context hits <code>threshold * contextWindow</code>, ai automatically
				compacts the oldest messages. The remaining budget is <code>reserveTokens</code>; the
				most recent <code>keepRecentTokens</code> are always preserved verbatim.
			</p>

			<h2>Auto-discovered providers</h2>
			<p>
				Set <code>autoDiscover: "ollama"</code> in <code>~/.ai/agent/models.json</code> and ai
				will poll <code>http://localhost:11434/v1/models</code> at startup, populating the model
				picker with whatever your local Ollama instance is serving.
			</p>
			<CodeBlock
				language="json"
				code={`{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "optionalApiKey": true,
      "autoDiscover": "ollama"
    }
  }
}`}
			/>

			<h2>Custom OpenAI-compatible provider</h2>
			<p>Run <code>/login</code> and pick "Add OpenAI-compatible provider" for a 5-step dialog.</p>
			<CodeBlock
				language="json"
				code={`{
  "providers": {
    "groq": {
      "baseUrl": "https://api.groq.com/openai/v1",
      "api": "openai-completions"
    }
  },
  "models": [
    {
      "id": "llama-3.3-70b-versatile",
      "provider": "groq",
      "name": "Llama 3.3 70B",
      "contextWindow": 131072,
      "maxTokens": 32768
    }
  ]
}`}
			/>

			<h2>Web search</h2>
			<p>
				Configure a SearXNG endpoint via <code>/searcheng</code> or by editing{" "}
				<code>models.json</code>:
			</p>
			<CodeBlock
				language="json"
				code={`{
  "providers": {
    "websearch": {
      "baseUrl": "https://search.example.org"
    }
  }
}`}
			/>

			<h2>Keybindings</h2>
			<p>
				Override any keybinding by writing <code>~/.ai/agent/keybindings.json</code>. See{" "}
				<code>/hotkeys</code> in the TUI for the full list.
			</p>
			<CodeBlock
				language="json"
				code={`{
  "app.mode.toggle": ["tab"],
  "app.tools.expand": ["ctrl+o"]
}`}
			/>

			<h2>Quiet startup</h2>
			<p>
				Set <code>quietStartup: true</code> to suppress the welcome screen and just show the
				prompt. You can still expand it with <span className="kbd">Ctrl+O</span>.
			</p>
		</article>
	);
}
