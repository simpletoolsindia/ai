export function getAiUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `ai/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
