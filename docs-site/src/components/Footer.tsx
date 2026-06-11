import { Link } from "react-router-dom";

export function Footer() {
	return (
		<footer className="border-t border-ink-800/60 mt-24">
			<div className="section py-12 grid gap-8 md:grid-cols-4">
				<div>
					<div className="font-bold text-white text-lg mb-2">ai</div>
					<p className="text-sm text-ink-400 leading-relaxed">
						A self-extensible coding agent for the terminal. Read, run, and write code in a single
						agent loop.
					</p>
				</div>
				<div>
					<h4 className="font-semibold text-white text-sm mb-3">Docs</h4>
					<ul className="space-y-2 text-sm">
						<li>
							<Link to="/install" className="text-ink-400 hover:text-white">
								Install
							</Link>
						</li>
						<li>
							<Link to="/commands" className="text-ink-400 hover:text-white">
								Commands
							</Link>
						</li>
						<li>
							<Link to="/features" className="text-ink-400 hover:text-white">
								Features
							</Link>
						</li>
						<li>
							<Link to="/configuration" className="text-ink-400 hover:text-white">
								Configuration
							</Link>
						</li>
						<li>
							<Link to="/troubleshooting" className="text-ink-400 hover:text-white">
								Troubleshooting
							</Link>
						</li>
					</ul>
				</div>
				<div>
					<h4 className="font-semibold text-white text-sm mb-3">Project</h4>
					<ul className="space-y-2 text-sm">
						<li>
							<a
								href="https://github.com/simpletoolsindia/ai"
								className="text-ink-400 hover:text-white"
								target="_blank"
								rel="noreferrer"
							>
								GitHub
							</a>
						</li>
						<li>
							<a
								href="https://www.npmjs.com/org/simpletoolsindiaorg"
								className="text-ink-400 hover:text-white"
								target="_blank"
								rel="noreferrer"
							>
								npm
							</a>
						</li>
						<li>
							<Link to="/changelog" className="text-ink-400 hover:text-white">
								Changelog
							</Link>
						</li>
					</ul>
				</div>
				<div>
					<h4 className="font-semibold text-white text-sm mb-3">Install</h4>
					<div className="font-mono text-xs bg-ink-800/80 border border-ink-700/60 rounded-md p-3 text-ink-200 break-all">
						curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash
					</div>
				</div>
			</div>
			<div className="border-t border-ink-800/60">
				<div className="section py-6 text-xs text-ink-500 flex flex-col sm:flex-row gap-2 justify-between">
					<span>© 2026 simpletoolsindia. Released under the MIT License.</span>
					<span>
						A fork of{" "}
						<a
							href="https://github.com/earendil-works/pi"
							className="hover:text-ink-300"
							target="_blank"
							rel="noreferrer"
						>
							pi
						</a>{" "}
						by Mario Zechner.
					</span>
				</div>
			</div>
		</footer>
	);
}
