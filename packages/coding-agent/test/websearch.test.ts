import { describe, expect, test } from "vitest";
import type { WebsearchOperations } from "../src/core/tools/websearch.ts";
import { createWebsearchTool } from "../src/core/tools/websearch.ts";

function makeOps(overrides: Partial<WebsearchOperations> = {}): WebsearchOperations {
	return {
		fetch: async () => ({
			ok: true,
			status: 200,
			statusText: "OK",
			json: async () => ({ query: "x", results: [] }),
		}),
		...overrides,
	};
}

describe("websearch tool", () => {
	test("returns formatted markdown for normal results", async () => {
		const ops = makeOps({
			fetch: async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				json: async () => ({
					query: "typescript",
					results: [
						{
							title: "TypeScript Handbook",
							url: "https://www.typescriptlang.org/docs/handbook/",
							content: "The TypeScript Handbook is a comprehensive guide.",
							engine: "google",
						},
					],
				}),
			}),
		});
		const tool = createWebsearchTool("/tmp", { operations: ops });
		const result = await tool.execute("call1", { query: "typescript" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("TypeScript Handbook");
		expect(text).toContain("https://www.typescriptlang.org/docs/handbook/");
		expect(text).toContain("Snippet:");
		expect(text).toContain("Engine: google");
		expect(result.details).toMatchObject({
			query: "typescript",
			resultCount: 1,
		});
	});

	test("respects the limit parameter", async () => {
		const ops = makeOps({
			fetch: async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				json: async () => ({
					query: "x",
					results: Array.from({ length: 10 }, (_, i) => ({
						title: `Result ${i}`,
						url: `https://example.com/${i}`,
						content: `Snippet ${i}`,
					})),
				}),
			}),
		});
		const tool = createWebsearchTool("/tmp", { operations: ops });
		const result = await tool.execute("call1", { query: "x", limit: 3 }, undefined);
		expect(result.details?.resultCount).toBe(3);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Result 0");
		expect(text).toContain("Result 2");
		expect(text).not.toContain("Result 3");
	});

	test("rejects unsupported language", async () => {
		const tool = createWebsearchTool("/tmp", { operations: makeOps() });
		await expect(tool.execute("call1", { query: "x", language: "xx" }, undefined)).rejects.toThrow(
			/Unsupported language/,
		);
	});

	test("rejects invalid safesearch", async () => {
		const tool = createWebsearchTool("/tmp", { operations: makeOps() });
		await expect(tool.execute("call1", { query: "x", safesearch: "9" }, undefined)).rejects.toThrow(
			/safesearch must be/,
		);
	});

	test("rejects invalid timeRange", async () => {
		const tool = createWebsearchTool("/tmp", { operations: makeOps() });
		await expect(tool.execute("call1", { query: "x", timeRange: "fortnight" }, undefined)).rejects.toThrow(
			/timeRange must be/,
		);
	});

	test("returns 'no results' message for empty results", async () => {
		const ops = makeOps({
			fetch: async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				json: async () => ({ query: "x", results: [] }),
			}),
		});
		const tool = createWebsearchTool("/tmp", { operations: ops });
		const result = await tool.execute("call1", { query: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("No results");
		expect(result.details?.resultCount).toBe(0);
	});

	test("returns error on HTTP failure", async () => {
		const ops = makeOps({
			fetch: async () => ({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
				json: async () => ({}),
			}),
		});
		const tool = createWebsearchTool("/tmp", { operations: ops });
		const result = await tool.execute("call1", { query: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("HTTP 503");
		expect(result.details?.error).toBeDefined();
	});

	test("returns error on network failure", async () => {
		const ops = makeOps({
			fetch: async () => {
				throw new Error("connection refused");
			},
		});
		const tool = createWebsearchTool("/tmp", { operations: ops });
		const result = await tool.execute("call1", { query: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("connection refused");
	});

	test("includes publishedDate in output when present", async () => {
		const ops = makeOps({
			fetch: async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				json: async () => ({
					query: "x",
					results: [
						{
							title: "Result",
							url: "https://example.com/1",
							content: "Snippet",
							publishedDate: "2024-06-15",
						},
					],
				}),
			}),
		});
		const tool = createWebsearchTool("/tmp", { operations: ops });
		const result = await tool.execute("call1", { query: "x" }, undefined);
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("Published: 2024-06-15");
	});

	test("sends the configured SearXNG URL with format=json", async () => {
		let capturedUrl = "";
		const ops = makeOps({
			fetch: async (url) => {
				capturedUrl = url;
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					json: async () => ({ results: [] }),
				};
			},
		});
		const tool = createWebsearchTool("/tmp", { operations: ops, searchUrl: "https://example.com/s" });
		await tool.execute("call1", { query: "hello world" }, undefined);
		expect(capturedUrl).toContain("https://example.com/s?");
		expect(capturedUrl).toContain("q=hello+world");
		expect(capturedUrl).toContain("format=json");
		expect(capturedUrl).toContain("categories=general");
		expect(capturedUrl).toContain("language=en");
		expect(capturedUrl).toContain("safesearch=0");
	});
});
