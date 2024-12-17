import get from "lodash.get";
import set from "lodash.set";
import toPath from "lodash.topath";
import type { MiddyStore, Resolveable } from "./store.js";
import { MIDDY_STORE } from "./store.js";

export const VALUE_NOT_FOUND = Symbol("VALUE_NOT_FOUND");

/**
 * Returns true if the value is an object and not null.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * Coerces the input into a resolvable function.
 * If the input is already a function, it returns it.
 * Otherwise, it returns a function that returns the input value.
 */
export function resolvableFn<TResolved, TArgs extends any[] = []>(
	input: Resolveable<TResolved, TArgs>,
): (...args: TArgs) => TResolved {
	return typeof input === "function"
		? (input as (...args: TArgs) => TResolved)
		: (...args: TArgs) => input as TResolved;
}

/**
 * Tries to parse a JSON string and returns the parsed object.
 * Returns false if the input is not a valid JSON string.
 */
export function tryParseJSON(json: string | undefined): object | false {
	// handle null, undefined, and empty string
	if (!json) return false;

	try {
		const object = JSON.parse(json);

		if (object && typeof object === "object") return object;
	} catch (e) {
		return false;
	}

	return false;
}

/**
 * Tries to stringify an object and return the JSON string.
 * Returns false if the input is not a valid JSON object.
 */
export function tryStringifyJSON(object: unknown): string | false {
	// handle null and undefined
	if (!object) return false;

	// handle primitives
	if (
		typeof object === "string" ||
		typeof object === "number" ||
		typeof object === "boolean"
	)
		return false;

	try {
		const json = JSON.stringify(object);

		if (json && typeof json === "string") return json;
	} catch {
		return false;
	}

	return false;
}

/**
 * Calculates the UTF-8 byte size of a payload.
 * If the payload is a string, it returns the byte length of the string.
 * If the payload is an object, it stringifies the object and returns the byte length of the JSON string.
 */
export function calculateByteSize(payload: unknown) {
	if (typeof payload === "string") return Buffer.byteLength(payload, "utf8");

	if (typeof payload === "object")
		return Buffer.byteLength(JSON.stringify(payload), "utf8");

	throw new Error(`Unsupported payload type: ${typeof payload}`);
}

type FormatPathArgs = {
	path: string;
	key: string | number;
};
export function formatPath({ path, key }: FormatPathArgs): string {
	let newPath = path.trim();

	newPath += newPath.length === 0 ? `${key}` : `.${key}`;

	return newPath;
}

type SelectByPathArgs = {
	source: Record<string, unknown> | string;
	path: string;
};
export function selectByPath({ source, path }: SelectByPathArgs): unknown {
	if (isString(source)) return source;

	const pathArray = toPath(path);
	const value =
		pathArray.length === 0 ? source : get(source, pathArray, VALUE_NOT_FOUND);

	if (value === VALUE_NOT_FOUND) {
		throw new Error(`Path not found at ${path}`);
	}

	return value;
}

type ReplaceByPathArgs = {
	source: Record<string, unknown> | string;
	value: unknown;
	path: string;
};

/**
 * Replaces the value at the given `path` in the `source` object with the new `value`.
 * The `source` object is mutated and returned.
 * If the `path` is empty, it returns the new `value`.
 */
export function replaceByPath({
	source,
	value,
	path,
}: ReplaceByPathArgs): unknown {
	if (isString(source)) return value;

	const pathArray = toPath(path);

	// TODO option to clone instead of mutate?
	return pathArray.length === 0 ? value : set(source, pathArray, value);
}

type GeneratePathsArgs = {
	output: Record<string, unknown> | string;
	selector?: string;
};
export function* generatePayloadPaths({
	output,
	selector = "",
}: GeneratePathsArgs): Generator<string> {
	if (isString(output)) {
		yield "";
		return;
	}

	let path = selector.trim();
	let isMultiPayload = false;

	if (selector.trim().endsWith("[*]")) {
		// old logic
		console.warn(
			"[middy-store] The selector `[*]` is deprecated. Please use `.*` instead.",
		);
		path = path.slice(0, -3);
		isMultiPayload = true;
	} else if (selector.trim().endsWith(".*")) {
		// new logic
		path = path.slice(0, -2);
		isMultiPayload = true;
	}

	const payload =
		path.length === 0 ? output : get(output, path, VALUE_NOT_FOUND);

	if (payload === VALUE_NOT_FOUND) {
		throw new Error(`Path not found at ${path}`);
	}

	// if the payload is a reference, we skip it
	if (hasReference(payload)) {
		return;
	}

	if (isMultiPayload && Array.isArray(payload)) {
		for (let index = 0; index < payload.length; index++) {
			// if the item is a reference, we skip it
			// this could happen if the handler is called multiple times and adds payload to the same path
			if (hasReference(payload[index])) continue;

			const itemPath = formatPath({ path, key: index });
			yield itemPath;
		}
	} else {
		yield path;
	}
}

export const hasReference = <TReference = unknown>(
	input: unknown,
): input is MiddyStore<TReference> => {
	return isObject(input) && MIDDY_STORE in input;
};

export const getReference = <TReference = unknown>(
	input: unknown,
): TReference | undefined => {
	return hasReference<TReference>(input) ? input[MIDDY_STORE] : undefined;
};

export const createReference = <TReference = unknown>(
	reference: TReference,
): MiddyStore<TReference> => {
	return { [MIDDY_STORE]: reference };
};

type GenerateReferencePathsArgs = {
	input: unknown;
	path: string;
};
export function* generateReferencePaths({
	input,
	path,
}: GenerateReferencePathsArgs): Generator<string> {
	// Check if the result itself is null or not an object
	if (!isObject(input)) return;

	// Check for the reference in the current level of the object
	if (hasReference(input)) {
		yield path;
	}

	// Iterate through the object recursively to find all references
	for (const key of Object.keys(input)) {
		const nextInput = (input as Record<string, unknown>)[key];
		if (nextInput === null || typeof nextInput !== "object") continue;

		const nextPath = formatPath({ path, key });

		// Recursively search for references in the next level of the object
		yield* generateReferencePaths({ input: nextInput, path: nextPath });
	}
}
