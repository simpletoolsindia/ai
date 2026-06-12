/**
 * Result<T, E> type for standardized error handling.
 *
 * This module provides a consistent error handling pattern across the codebase.
 * Instead of throwing exceptions, functions return a Result type that explicitly
 * represents success or failure.
 *
 * Usage:
 * ```typescript
 * import { Result, ok, err, getOrThrow } from "./result.ts";
 *
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return err("Division by zero");
 *   }
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log(result.value); // 5
 * } else {
 *   console.error(result.error); // "Division by zero"
 * }
 * ```
 */

/**
 * Result type that represents either success (ok) or failure (err).
 */
export type Result<TValue, TError = Error> = { ok: true; value: TValue } | { ok: false; error: TError };

/**
 * Create a successful Result.
 */
export function ok<TValue, TError = Error>(value: TValue): Result<TValue, TError> {
	return { ok: true, value };
}

/**
 * Create a failed Result.
 */
export function err<TValue, TError = Error>(error: TError): Result<TValue, TError> {
	return { ok: false, error };
}

/**
 * Return the success value or throw the failure error.
 * Intended for tests and explicit adapter boundaries.
 */
export function getOrThrow<TValue, TError>(result: Result<TValue, TError>): TValue {
	if (!result.ok) {
		if (result.error instanceof Error) {
			throw result.error;
		}
		throw new Error(String(result.error));
	}
	return result.value;
}

/**
 * Return the success value or a default value.
 */
export function getOrDefault<TValue, TError>(result: Result<TValue, TError>, defaultValue: TValue): TValue {
	return result.ok ? result.value : defaultValue;
}

/**
 * Return the success value or undefined.
 */
export function getOrUndefined<TValue, TError>(result: Result<TValue, TError>): TValue | undefined {
	return result.ok ? result.value : undefined;
}

/**
 * Map the success value of a Result.
 */
export function map<TValue, TError, UValue>(
	result: Result<TValue, TError>,
	fn: (value: TValue) => UValue,
): Result<UValue, TError> {
	if (!result.ok) {
		return result;
	}
	return ok(fn(result.value));
}

/**
 * Map the error value of a Result.
 */
export function mapError<TValue, TError, UError>(
	result: Result<TValue, TError>,
	fn: (error: TError) => UError,
): Result<TValue, UError> {
	if (result.ok) {
		return result;
	}
	return err(fn(result.error));
}

/**
 * Chain Results together (flatMap).
 */
export function flatMap<TValue, TError, UValue, UError>(
	result: Result<TValue, TError>,
	fn: (value: TValue) => Result<UValue, UError>,
): Result<UValue, TError | UError> {
	if (!result.ok) {
		return result;
	}
	return fn(result.value);
}

/**
 * Combine multiple Results into a single Result.
 * Returns the first error encountered, or all values if all succeed.
 */
export function combine<TValue, TError>(results: Result<TValue, TError>[]): Result<TValue[], TError> {
	const values: TValue[] = [];
	for (const result of results) {
		if (!result.ok) {
			return result;
		}
		values.push(result.value);
	}
	return ok(values);
}

/**
 * Execute a function that might throw and return a Result.
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
	try {
		return ok(fn());
	} catch (error) {
		return err(error instanceof Error ? error : new Error(String(error)));
	}
}

/**
 * Execute an async function that might throw and return a Result.
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
	try {
		return ok(await fn());
	} catch (error) {
		return err(error instanceof Error ? error : new Error(String(error)));
	}
}

/**
 * Normalize unknown thrown values into Error instances.
 */
export function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	try {
		return new Error(JSON.stringify(error));
	} catch {
		return new Error(String(error));
	}
}

/**
 * Create a Result from a value that might be null or undefined.
 */
export function fromNullable<T>(
	value: T | null | undefined,
	errorMessage: string = "Value is null or undefined",
): Result<T, Error> {
	if (value === null || value === undefined) {
		return err(new Error(errorMessage));
	}
	return ok(value);
}

/**
 * Create a Result from a Promise that might reject.
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
	try {
		return ok(await promise);
	} catch (error) {
		return err(toError(error));
	}
}

/**
 * Utility class for working with Results in a more fluent way.
 */
export class ResultWrapper<TValue, TError = Error> {
	constructor(private result: Result<TValue, TError>) {}

	/**
	 * Get the underlying Result.
	 */
	get(): Result<TValue, TError> {
		return this.result;
	}

	/**
	 * Check if the Result is successful.
	 */
	isOk(): boolean {
		return this.result.ok;
	}

	/**
	 * Check if the Result is a failure.
	 */
	isErr(): boolean {
		return !this.result.ok;
	}

	/**
	 * Get the success value (throws if error).
	 */
	unwrap(): TValue {
		return getOrThrow(this.result);
	}

	/**
	 * Get the success value or a default.
	 */
	unwrapOr(defaultValue: TValue): TValue {
		return getOrDefault(this.result, defaultValue);
	}

	/**
	 * Map the success value.
	 */
	map<U>(fn: (value: TValue) => U): ResultWrapper<U, TError> {
		return new ResultWrapper(map(this.result, fn));
	}

	/**
	 * Map the error value.
	 */
	mapError<U>(fn: (error: TError) => U): ResultWrapper<TValue, U> {
		return new ResultWrapper(mapError(this.result, fn));
	}

	/**
	 * Chain with another Result-producing function.
	 */
	flatMap<U, UError>(fn: (value: TValue) => Result<U, UError>): ResultWrapper<U, TError | UError> {
		return new ResultWrapper(flatMap(this.result, fn));
	}
}

/**
 * Create a ResultWrapper from a Result.
 */
export function wrap<TValue, TError>(result: Result<TValue, TError>): ResultWrapper<TValue, TError> {
	return new ResultWrapper(result);
}
