import { features } from "../data/features";

export function FeaturesPage() {
	return (
		<article className="section py-16 max-w-5xl">
			<h1 className="text-3xl font-bold text-white mb-3">Features</h1>
			<p className="text-ink-300 mb-12 max-w-2xl">
				Every feature below is enabled by default. Toggle them, extend them, or disable them in
				<code> settings.json</code>.
			</p>

			<div className="space-y-16">
				{features.map((f, i) => (
					<section key={f.title} id={f.link.split("#")[1] ?? ""}>
						<div className="flex items-start gap-5">
							<div className="text-4xl flex-shrink-0">{f.icon}</div>
							<div className="flex-1">
								<div className="flex items-baseline gap-3 mb-2">
									<h2 className="text-2xl font-bold text-white">
										<span className="text-ink-500 font-mono text-sm mr-2">
											{String(i + 1).padStart(2, "0")}
										</span>
										{f.title}
									</h2>
								</div>
								<p className="text-ink-200 text-lg leading-relaxed mb-3">{f.summary}</p>
								<p className="text-ink-400 text-sm leading-relaxed">{f.details}</p>
							</div>
						</div>
						{i < features.length - 1 && <hr className="my-12 border-ink-800/60" />}
					</section>
				))}
			</div>
		</article>
	);
}
