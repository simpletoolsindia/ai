export type Command = {
	name: string;
	description: string;
	group: string;
	example?: string;
};

export const commands: Command[] = [
	// Session
	{ name: "new", description: "Start a brand-new session.", group: "Session", example: "/new" },
	{
		name: "clear",
		description: "Clear the editor (does not end the session).",
		group: "Session",
		example: "/clear",
	},
	{ name: "resume", description: "Resume a saved session by name or id.", group: "Session" },
	{ name: "tree", description: "Open the session tree picker.", group: "Session" },
	{ name: "rename", description: "Rename the current session.", group: "Session" },
	{ name: "fork", description: "Create a new fork from a previous user message.", group: "Session" },
	{
		name: "clone",
		description: "Duplicate the current session at the current position.",
		group: "Session",
	},
	{ name: "delete", description: "Delete a session by id (asks to confirm).", group: "Session" },
	{
		name: "name",
		description: "Set a friendly name for the current session.",
		group: "Session",
		example: "/name my-feature",
	},

	// Mode & Tools
	{
		name: "mode",
		description: "Switch the agent between PLAN (read-only) and EXECUTE (full tools).",
		group: "Mode & Tools",
		example: "/mode plan | /mode execute | /mode toggle",
	},
	{ name: "model", description: "Open the model picker.", group: "Mode & Tools", example: "/model" },
	{
		name: "scoped-models",
		description: "Restrict the available models for this session.",
		group: "Mode & Tools",
	},
	{ name: "scopes", description: "Show current tool scopes.", group: "Mode & Tools" },
	{ name: "tools", description: "List active tools.", group: "Mode & Tools" },
	{
		name: "compact",
		description: "Manually compact the session context.",
		group: "Mode & Tools",
		example: "/compact [custom instructions]",
	},
	{ name: "todos", description: "Show the current todo list.", group: "Mode & Tools" },
	{ name: "todo", description: "Add a todo item.", group: "Mode & Tools", example: "/todo fix bug" },
	{ name: "clear-todo", description: "Clear the todo list.", group: "Mode & Tools" },

	// Search & Memory
	{
		name: "searcheng",
		description: "Show or update the SearXNG endpoint for websearch.",
		group: "Search & Memory",
		example: "/searcheng https://search.example.org",
	},
	{ name: "websearch", description: "Trigger a one-off web search.", group: "Search & Memory" },
	{
		name: "webfetch",
		description: "Fetch a URL and render its content.",
		group: "Search & Memory",
		example: "/webfetch https://example.com/docs",
	},
	{ name: "memory", description: "Browse or pin hermes-memory entries.", group: "Search & Memory" },
	{ name: "skills", description: "List available skills.", group: "Search & Memory" },

	// Sharing & Export
	{
		name: "export",
		description: "Export the current session to a file (json, html, or md).",
		group: "Sharing & Export",
		example: "/export html /tmp/chat.html",
	},
	{ name: "import", description: "Import a session from a file.", group: "Sharing & Export" },
	{ name: "share", description: "Copy a shareable HTML export of the current session.", group: "Sharing & Export" },
	{ name: "copy", description: "Copy the last assistant message to the clipboard.", group: "Sharing & Export" },
	{ name: "html", description: "Alias for /export html.", group: "Sharing & Export" },
	{ name: "markdown", description: "Alias for /export md.", group: "Sharing & Export" },
	{ name: "json", description: "Alias for /export json.", group: "Sharing & Export" },

	// Auth & Providers
	{
		name: "login",
		description: "OAuth / API key login, or add a custom OpenAI-compatible provider.",
		group: "Auth & Providers",
	},
	{ name: "logout", description: "Remove stored credentials for a provider.", group: "Auth & Providers" },
	{ name: "providers", description: "List all configured providers.", group: "Auth & Providers" },

	// Configuration
	{ name: "settings", description: "Open the interactive settings editor.", group: "Configuration" },
	{ name: "hotkeys", description: "Show all keyboard shortcuts.", group: "Configuration" },
	{ name: "trust", description: "Toggle the project trust flag.", group: "Configuration" },
	{ name: "scout", description: "Run a code-scout subagent for a focused exploration task.", group: "Configuration" },
	{ name: "install", description: "Install an extension from a path or git URL.", group: "Configuration" },
	{ name: "reload", description: "Reload extensions, skills, prompts, and themes.", group: "Configuration" },
	{ name: "theme", description: "Switch the active theme.", group: "Configuration" },
	{ name: "changelog", description: "Show the changelog for the installed version.", group: "Configuration" },
	{ name: "help", description: "Show all available commands with descriptions.", group: "Configuration" },
];

export const commandGroups = Array.from(new Set(commands.map((c) => c.group)));
