/**
 * Tests for Result utility.
 */

import { describe, expect, it } from "vitest";
import {
	combine,
	err,
	flatMap,
	fromNullable,
	fromPromise,
	getOrDefault,
	getOrThrow,
	getOrUndefined,
	map,
	mapError,
	ok,
	ResultWrapper,
	toError,
	tryCatch,
	tryCatchAsync,
	wrap,
} from "../src/core/result.ts";

describe("Result", () => {
	describe("ok", () => {
		it("should create a successful result", () => {
			const result = ok(42);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(42);
			}
		});
	});

	describe("err", () => {
		it("should create a failed result", () => {
			const result = err("error message");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("error message");
			}
		});
	});

	describe("getOrThrow", () => {
		it("should return value for ok result", () => {
			const result = ok(42);
			expect(getOrThrow(result)).toBe(42);
		});

		it("should throw for err result", () => {
			const result = err("error message");
			expect(() => getOrThrow(result)).toThrow("error message");
		});

		it("should throw Error for err result with Error", () => {
			const error = new Error("test error");
			const result = err(error);
			expect(() => getOrThrow(result)).toThrow(error);
		});
	});

	describe("getOrDefault", () => {
		it("should return value for ok result", () => {
			const result = ok(42);
			expect(getOrDefault(result, 0)).toBe(42);
		});

		it("should return default for err result", () => {
			const result = err("error");
			expect(getOrDefault(result, 0)).toBe(0);
		});
	});

	describe("getOrUndefined", () => {
		it("should return value for ok result", () => {
			const result = ok({ foo: "bar" });
			expect(getOrUndefined(result)).toEqual({ foo: "bar" });
		});

		it("should return undefined for err result", () => {
			const result = err("error");
			expect(getOrUndefined(result)).toBeUndefined();
		});
	});

	describe("map", () => {
		it("should map ok value", () => {
			const result = ok(42);
			const mapped = map(result, (v) => v * 2);
			expect(mapped.ok).toBe(true);
			if (mapped.ok) {
				expect(mapped.value).toBe(84);
			}
		});

		it("should preserve err", () => {
			const result = err("error");
			const mapped = map(result, (v) => v * 2);
			expect(mapped.ok).toBe(false);
			if (!mapped.ok) {
				expect(mapped.error).toBe("error");
			}
		});
	});

	describe("mapError", () => {
		it("should preserve ok", () => {
			const result = ok(42);
			const mapped = mapError(result, (e) => new Error(e));
			expect(mapped.ok).toBe(true);
			if (mapped.ok) {
				expect(mapped.value).toBe(42);
			}
		});

		it("should map error", () => {
			const result = err("error message");
			const mapped = mapError(result, (e) => new Error(e));
			expect(mapped.ok).toBe(false);
			if (!mapped.ok) {
				expect(mapped.error).toBeInstanceOf(Error);
				expect(mapped.error.message).toBe("error message");
			}
		});
	});

	describe("flatMap", () => {
		it("should flatMap ok value", () => {
			const result = ok(42);
			const flatMapped = flatMap(result, (v) => ok(v.toString()));
			expect(flatMapped.ok).toBe(true);
			if (flatMapped.ok) {
				expect(flatMapped.value).toBe("42");
			}
		});

		it("should return err from flatMap function", () => {
			const result = ok(42);
			const flatMapped = flatMap(result, (v) => err("too big"));
			expect(flatMapped.ok).toBe(false);
			if (!flatMapped.ok) {
				expect(flatMapped.error).toBe("too big");
			}
		});

		it("should preserve err", () => {
			const result = err("original error");
			const flatMapped = flatMap(result, (v) => ok(v.toString()));
			expect(flatMapped.ok).toBe(false);
			if (!flatMapped.ok) {
				expect(flatMapped.error).toBe("original error");
			}
		});
	});

	describe("combine", () => {
		it("should combine ok results", () => {
			const results = [ok(1), ok(2), ok(3)];
			const combined = combine(results);
			expect(combined.ok).toBe(true);
			if (combined.ok) {
				expect(combined.value).toEqual([1, 2, 3]);
			}
		});

		it("should return first err", () => {
			const results = [ok(1), err("error"), ok(3)];
			const combined = combine(results);
			expect(combined.ok).toBe(false);
			if (!combined.ok) {
				expect(combined.error).toBe("error");
			}
		});

		it("should handle empty array", () => {
			const results: Array<import("../src/core/result.ts").Result<number, string>> = [];
			const combined = combine(results);
			expect(combined.ok).toBe(true);
			if (combined.ok) {
				expect(combined.value).toEqual([]);
			}
		});
	});

	describe("tryCatch", () => {
		it("should return ok for successful function", () => {
			const result = tryCatch(() => 42);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(42);
			}
		});

		it("should return err for throwing function", () => {
			const result = tryCatch(() => {
				throw new Error("test error");
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error);
				expect(result.error.message).toBe("test error");
			}
		});

		it("should handle non-Error throws", () => {
			const result = tryCatch(() => {
				throw "string error";
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error);
				expect(result.error.message).toBe("string error");
			}
		});
	});

	describe("tryCatchAsync", () => {
		it("should return ok for successful async function", async () => {
			const result = await tryCatchAsync(async () => 42);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(42);
			}
		});

		it("should return err for rejecting async function", async () => {
			const result = await tryCatchAsync(async () => {
				throw new Error("test error");
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error);
				expect(result.error.message).toBe("test error");
			}
		});
	});

	describe("toError", () => {
		it("should return Error as-is", () => {
			const error = new Error("test");
			expect(toError(error)).toBe(error);
		});

		it("should convert string to Error", () => {
			const error = toError("test error");
			expect(error).toBeInstanceOf(Error);
			expect(error.message).toBe("test error");
		});

		it("should convert other values to Error", () => {
			const error = toError(42);
			expect(error).toBeInstanceOf(Error);
			expect(error.message).toBe("42");
		});
	});

	describe("fromNullable", () => {
		it("should return ok for non-null value", () => {
			const result = fromNullable(42);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(42);
			}
		});

		it("should return err for null", () => {
			const result = fromNullable(null);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("Value is null or undefined");
			}
		});

		it("should return err for undefined", () => {
			const result = fromNullable(undefined);
			expect(result.ok).toBe(false);
		});

		it("should use custom error message", () => {
			const result = fromNullable(null, "Custom error");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("Custom error");
			}
		});
	});

	describe("fromPromise", () => {
		it("should return ok for resolved promise", async () => {
			const result = await fromPromise(Promise.resolve(42));
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(42);
			}
		});

		it("should return err for rejected promise", async () => {
			const result = await fromPromise(Promise.reject(new Error("test error")));
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error);
				expect(result.error.message).toBe("test error");
			}
		});
	});

	describe("ResultWrapper", () => {
		it("should create wrapper from ok result", () => {
			const wrapper = wrap(ok(42));
			expect(wrapper.isOk()).toBe(true);
			expect(wrapper.isErr()).toBe(false);
			expect(wrapper.unwrap()).toBe(42);
		});

		it("should create wrapper from err result", () => {
			const wrapper = wrap(err("error"));
			expect(wrapper.isOk()).toBe(false);
			expect(wrapper.isErr()).toBe(true);
			expect(() => wrapper.unwrap()).toThrow("error");
		});

		it("should unwrapOr with default", () => {
			const wrapper = wrap(err("error"));
			expect(wrapper.unwrapOr(0)).toBe(0);
		});

		it("should map ok value", () => {
			const wrapper = wrap(ok(42));
			const mapped = wrapper.map((v) => v * 2);
			expect(mapped.unwrap()).toBe(84);
		});

		it("should mapError", () => {
			const wrapper = wrap(err("error"));
			const mapped = wrapper.mapError((e) => new Error(e));
			expect(mapped.isErr()).toBe(true);
			if (mapped.isErr()) {
				expect(mapped.get().error).toBeInstanceOf(Error);
			}
		});

		it("should flatMap", () => {
			const wrapper = wrap(ok(42));
			const flatMapped = wrapper.flatMap((v) => ok(v.toString()));
			expect(flatMapped.unwrap()).toBe("42");
		});
	});
});
