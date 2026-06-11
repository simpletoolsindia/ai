import { Link, NavLink, useLocation } from "react-router-dom";

const navItems = [
	{ to: "/", label: "Home" },
	{ to: "/install", label: "Install" },
	{ to: "/features", label: "Features" },
	{ to: "/commands", label: "Commands" },
	{ to: "/configuration", label: "Configuration" },
	{ to: "/troubleshooting", label: "Troubleshooting" },
	{ to: "/changelog", label: "Changelog" },
];

export function NavBar() {
	const { pathname } = useLocation();
	return (
		<header className="fixed top-0 inset-x-0 z-30 backdrop-blur-md bg-ink-900/70 border-b border-ink-800/60">
			<div className="section flex items-center justify-between h-16">
				<Link to="/" className="flex items-center gap-2.5 group">
					<Logo />
					<span className="font-bold text-lg text-white group-hover:text-accent-200 transition-colors">
						ai
					</span>
					<span className="text-xs text-ink-400 font-mono hidden sm:inline">v0.79.6</span>
				</Link>
				<nav className="hidden md:flex items-center gap-1">
					{navItems.map((item) => {
						const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
						return (
							<NavLink
								key={item.to}
								to={item.to}
								className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
									active
										? "text-white bg-ink-800/60"
										: "text-ink-300 hover:text-white hover:bg-ink-800/40"
								}`}
							>
								{item.label}
							</NavLink>
						);
					})}
				</nav>
				<div className="flex items-center gap-2">
					<a
						href="https://github.com/simpletoolsindia/ai"
						target="_blank"
						rel="noreferrer"
						className="btn-ghost text-sm"
					>
						<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
							<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.18c-3.34.73-4.04-1.41-4.04-1.41-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
						</svg>
						<span className="hidden sm:inline">GitHub</span>
					</a>
				</div>
			</div>
		</header>
	);
}

function Logo() {
	return (
		<svg
			viewBox="0 0 32 32"
			className="h-8 w-8"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stopColor="#a1b8fa" />
					<stop offset="100%" stopColor="#4f76ee" />
				</linearGradient>
			</defs>
			<rect x="3" y="3" width="26" height="26" rx="6" fill="url(#logoGrad)" />
			<rect x="9" y="9" width="14" height="3" rx="1.5" fill="white" />
			<rect x="9" y="14.5" width="14" height="3" rx="1.5" fill="white" opacity="0.85" />
			<rect x="9" y="20" width="9" height="3" rx="1.5" fill="white" opacity="0.7" />
		</svg>
	);
}
