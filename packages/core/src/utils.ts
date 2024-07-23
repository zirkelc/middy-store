import get from "lodash.get";
import set from "lodash.set";
import toPath from "lodash.topath";
import type {
	MiddyStore,
	Path,
	ReadInput,
	ReadableStore,
	Resolveable,
	Store,
	WritableStore,
	WriteOutput,
} from "./store.js";
import { MIDDY_STORE } from "./store.js";

/**
 * Returns true if the value is an object and not null.
 */
export function isObject(value: unknown): value is Record<string, any> {
	return typeof value === "object" && value !== null;
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

		// Handle non-exception-throwing cases:
		// Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
		// but... JSON.parse(null) returns null, and typeof null === "object",
		// so we must check for that, too. Thankfully, null is falsey, so this suffices:
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
export function calculateByteSize(payload: any) {
	if (typeof payload === "string") return Buffer.byteLength(payload, "utf8");

	if (typeof payload === "object")
		return Buffer.byteLength(JSON.stringify(payload), "utf8");

	throw new Error(`Unsupported payload type: ${typeof payload}`);
}

export function formatPath(path: Path, key: string | number): string {
	let newPath = path.trim();

	if (typeof key === "number") {
		newPath += `[${key}]`;
	} else {
		newPath += newPath.length === 0 ? `${key}` : `.${key}`;
	}

	return newPath;
}

export function selectByPath(source: Record<string, any>, path: Path): any {
	const pathArray = toPath(path);
	const value = pathArray.length === 0 ? source : get(source, pathArray);

	return value;
}

/**
 * Replaces the value at the given `path` in the `source` object with the new `value`.
 * The `source` object is mutated and returned.
 * If the `path` is empty, it returns the new `value`.
 */
export function replaceByPath(
	source: Record<string, any>,
	value: Record<string, any>,
	path: Path,
): any {
	const pathArray = toPath(path);

	// TODO option to clone instead of mutate?
	return pathArray.length === 0 ? value : set(source, pathArray, value);
}

type GeneratePathsArgs = {
	output: Record<string, any>;
	selector: Path;
};
export function* generatePayloadPaths({
	output,
	selector,
}: GeneratePathsArgs): Generator<Path> {
	const isMultiPayload = selector.trim().endsWith("[*]");
	const path = isMultiPayload ? selector.trim().slice(0, -3) : selector.trim();

	const payload = path.length === 0 ? output : get(output, path);

	if (isMultiPayload && Array.isArray(payload)) {
		for (let i = 0; i < payload.length; i++) {
			// if the item is a reference, we skip it
			// this could happen if the handler is called multiple times and adds payload to the same path
			if (hasReference(payload[i])) continue;

			const itemPath = formatPath(path, i);
			yield itemPath;
		}
	} else {
		yield path;
	}
}

export const hasReference = <TReference = any>(
	input: unknown,
): input is MiddyStore<TReference> => {
	return isObject(input) && MIDDY_STORE in input;
};

export const getReference = <TReference = any>(
	input: unknown,
): TReference | undefined => {
	return hasReference(input) ? input[MIDDY_STORE] : undefined;
};

type GenerateReferencePathsArgs = {
	input: Record<string, any>;
	path: Path;
};
export function* generateReferencePaths({
	input,
	path,
}: GenerateReferencePathsArgs): Generator<Path> {
	// Check if the result itself is null or not an object
	if (input === null || typeof input !== "object") return;

	// Check for the reference in the current level of the object
	if (hasReference(input)) {
		yield path;
	}

	// Iterate through the object recursively to find all references
	for (const key in input) {
		if (Object.hasOwn(input, key)) {
			if (input[key] === null || typeof input[key] !== "object") continue;

			// const nextPath = path.concat(key); // Prepare the next path
			const nextPath = formatPath(path, key);

			// Recursively search for references in the next level of the object
			yield* generateReferencePaths({ input: input[key], path: nextPath });
		}
	}
}
