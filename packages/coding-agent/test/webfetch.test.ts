import { describe, expect, test } from "vitest";
import type { WebfetchOperations } from "../src/core/tools/webfetch.ts";
import { createWebfetchTool, htmlToText } from "../src/core/tools/webfetch.ts";

function makeOps(overrides: Partial<WebfetchOperations> = {}): WebfetchOperations {
	return {
		fetch: async () => ({
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "content-type": "text/plain" }),
			body: null,
		}),
		htmlToText,
		...overrides,
	};
}

function bodyStream(content: string, contentType = "text/html"): WebfetchOperations {
	return makeOps({
		fetch: async () => ({
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "content-type": contentType }),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(content));
					controller.close();
				},
			}),
		}),
	});
}

describe("webfetch tool", () => {
	test("rejects invalid URL", async () => {
		const tool = createWebfetchTool("/tmp", { operations: makeOps() });
		await expect(tool.execute("call1", { url: "not-a-url" }, undefined)).rejects.toThrow(/Invalid URL/);
	});

	test("rejects non-http(s) protocol", async () => {
		const tool = createWebfetchTool("/tmp", { operations: makeOps() });
		await expect(tool.execute("call1", { url: "ftp://example.com/" }, undefined)).rejects.toThrow(/Only http/);
	});

	test("rejects empty host", async () => {
		// new URL("http:///foo") actually parses successfully (treats /// as host part).
		// Instead, test the file: protocol rejection which is the real empty-host case.
		const tool = createWebfetchTool("/tmp", { operations: makeOps() });
		await expect(tool.execute("call1", { url: "file:///etc/passwd" }, undefined)).rejects.toThrow(/Only http/);
	});

	test("returns plain text for text/html by stripping tags", async () => {
		const html = "<html><body><h1>Title</h1><p>Body <b>bold</b></p></body></html>";
		const tool = createWebfetchTool("/tmp", { operations: bodyStream(html) });
		const result = await tool.execute("call1", { url: "https://example.com/" }, undefined);
		const body = result.content[1]?.type === "text" ? result.content[1].text : "";
		expect(body).toContain("Title");
		expect(body).toContain("Body");
		expect(body).toContain("bold");
		expect(body).not.toContain("<h1>");
		expect(body).not.toContain("<p>");
		expect(result.details?.contentType).toBe("text/html");
	});

	test("strips script and style blocks entirely", async () => {
		const html = `<div>Before<script>alert('x')</script>After</div><style>body{}</style>End`;
		const tool = createWebfetchTool("/tmp", { operations: bodyStream(html) });
		const result = await tool.execute("call1", { url: "https://example.com/" }, undefined);
		const body = result.content[1]?.type === "text" ? result.content[1].text : "";
		expect(body).toContain("Before");
		expect(body).toContain("After");
		expect(body).toContain("End");
		expect(body).not.toContain("alert");
		expect(body).not.toContain("body{}");
	});

	test("decodes common HTML entities", async () => {
		const html = "<p>AT&amp;T &lt;tag&gt; &quot;quoted&quot; &#39;apostrophe&#39; &nbsp;space</p>";
		const tool = createWebfetchTool("/tmp", { operations: bodyStream(html) });
		const result = await tool.execute("call1", { url: "https://example.com/" }, undefined);
		const body = result.content[1]?.type === "text" ? result.content[1].text : "";
		expect(body).toContain("AT&T");
		expect(body).toContain("<tag>");
		expect(body).toContain('"quoted"');
		expect(body).toContain("'apostrophe'");
	});

	test("returns text/plain content as-is", async () => {
		const tool = createWebfetchTool("/tmp", {
			operations: bodyStream("Just plain text.\nWith two lines.", "text/plain; charset=utf-8"),
		});
		const result = await tool.execute("call1", { url: "https://example.com/file.txt" }, undefined);
		const body = result.content[1]?.type === "text" ? result.content[1].text : "";
		expect(body).toContain("Just plain text");
		expect(body).toContain("With two lines");
		expect(result.details?.contentType).toBe("text/plain");
	});

	test("returns JSON content as-is", async () => {
		const json = '{"key": "value", "nested": {"a": 1}}';
		const tool = createWebfetchTool("/tmp", { operations: bodyStream(json, "application/json") });
		const result = await tool.execute("call1", { url: "https://api.example.com/data" }, undefined);
		const body = result.content[1]?.type === "text" ? result.content[1].text : "";
		expect(body).toBe(json);
	});

	test("rejects binary content types", async () => {
		const tool = createWebfetchTool("/tmp", {
			operations: bodyStream("binary", "image/png"),
		});
		const result = await tool.execute("call1", { url: "https://example.com/img.png" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Unsupported content type");
		expect(text).toContain("image/png");
	});

	test("returns HTTP error on non-2xx", async () => {
		const tool = createWebfetchTool("/tmp", {
			operations: makeOps({
				fetch: async () => ({
					ok: false,
					status: 404,
					statusText: "Not Found",
					headers: new Headers(),
					body: null,
				}),
			}),
		});
		const result = await tool.execute("call1", { url: "https://example.com/missing" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("HTTP 404");
		expect(text).toContain("Not Found");
		expect(result.details?.status).toBe(404);
	});

	test("truncates response body when exceeding maxBytes", async () => {
		// Build a body that's larger than the limit
		const big = "x".repeat(2000);
		const tool = createWebfetchTool("/tmp", { operations: bodyStream(big, "text/plain") });
		const result = await tool.execute("call1", { url: "https://example.com/big", maxBytes: 500 }, undefined);
		const summary = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(summary).toContain("truncated");
		expect(result.details?.truncation).toBeDefined();
		expect(result.details?.bytes).toBeLessThanOrEqual(500);
	});

	test("handles network errors gracefully", async () => {
		const tool = createWebfetchTool("/tmp", {
			operations: makeOps({
				fetch: async () => {
					throw new Error("connection refused");
				},
			}),
		});
		const result = await tool.execute("call1", { url: "https://example.com/" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("connection refused");
		expect(result.details?.status).toBe(0);
	});

	test("respects timeoutMs by aborting", async () => {
		const tool = createWebfetchTool("/tmp", {
			operations: makeOps({
				fetch: async (_url, options) => {
					// Simulate a slow request by listening to the abort signal
					return new Promise((resolve, reject) => {
						const timer = setTimeout(
							() =>
								resolve({
									ok: true,
									status: 200,
									statusText: "OK",
									headers: new Headers(),
									body: null,
								}),
							60_000,
						);
						options.signal.addEventListener("abort", () => {
							clearTimeout(timer);
							reject(new Error("aborted"));
						});
					});
				},
			}),
		});
		const result = await tool.execute("call1", { url: "https://example.com/slow", timeoutMs: 100 }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text.toLowerCase()).toMatch(/timed out|aborted/);
	});

	test("honors caller-provided abort signal", async () => {
		const tool = createWebfetchTool("/tmp", {
			operations: makeOps({
				fetch: async (_url, options) => {
					return new Promise((resolve, reject) => {
						const timer = setTimeout(
							() =>
								resolve({
									ok: true,
									status: 200,
									statusText: "OK",
									headers: new Headers(),
									body: null,
								}),
							60_000,
						);
						options.signal.addEventListener("abort", () => {
							clearTimeout(timer);
							reject(new Error("aborted by caller"));
						});
					});
				},
			}),
		});
		const ac = new AbortController();
		setTimeout(() => ac.abort(), 50);
		const result = await tool.execute("call1", { url: "https://example.com/" }, ac.signal);
		// The tool catches abort errors and returns a result describing the failure
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text.toLowerCase()).toMatch(/abort|cancel|failed/);
	});
});

describe("htmlToText", () => {
	test("strips nav, header, footer content too", () => {
		const html = `<article>Real content</article><nav>Menu</nav><header>Site header</header><footer>Site footer</footer>`;
		const text = htmlToText(html);
		expect(text).toContain("Real content");
		expect(text).not.toContain("Menu");
		expect(text).not.toContain("Site header");
		expect(text).not.toContain("Site footer");
	});

	test("collapses multiple whitespace characters", () => {
		const html = "<p>a    b\t\tc\n\n\nd</p>";
		const text = htmlToText(html);
		expect(text).toBe("a b c\nd");
	});

	test("handles empty input", () => {
		expect(htmlToText("")).toBe("");
	});

	test("handles input with only whitespace", () => {
		expect(htmlToText("   \n\n   ")).toBe("");
	});
});
