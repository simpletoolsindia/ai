import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vite plugin: after the build, copy index.html to 404.html so GitHub
 * Pages (which serves 404.html for any unknown path under the site)
 * loads the React shell. The client-side router then takes over and
 * routes to the correct page.
 *
 * Without this, visiting https://simpletoolsindia.github.io/ai/install
 * directly returns a literal GitHub 404 instead of the React app.
 */
const ghPagesSpaFallback = () => ({
	name: "gh-pages-spa-fallback",
	closeBundle() {
		const outDir = resolve(__dirname, "dist");
		copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "404.html"));
	},
});

export default defineConfig({
	plugins: [react(), ghPagesSpaFallback()],
	base: "/ai/",
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
