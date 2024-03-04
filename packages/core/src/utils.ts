import get from "lodash.get";
import set from "lodash.set";
import toPath from "lodash.topath";
import type { MiddyStore, Path } from "./store.js";
import { MIDDY_STORE } from "./store.js";

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

export const isMiddyStore = <TReference = any>(
	obj: unknown,
): obj is MiddyStore<TReference> => {
	return typeof obj === "object" && obj !== null && MIDDY_STORE in obj;
};

export function calculateByteSize(payload: any) {
	if (typeof payload === "string") return Buffer.byteLength(payload);

	if (typeof payload === "object")
		return Buffer.byteLength(JSON.stringify(payload));

	throw new Error(`Unsupported payload type: ${typeof payload}`);
}

type SelectPayloadArgs = {
	output: Record<string, any>;
	path: Path;
};
export function selectPayloadByPath({ output, path }: SelectPayloadArgs): any {
	// if (typeof selector === "function") {
	// 	return selector({ output });
	// }

	const pathArray = toPath(path);
	const payload = pathArray.length === 0 ? output : get(output, pathArray);

	return payload;
}

type ReplacePayloadWithReferenceArgs = {
	output: any;
	path: Path;
	reference: MiddyStore<any>;
};
export function replacePayloadByPath({
	output,
	reference,
	path,
}: ReplacePayloadWithReferenceArgs): Record<string, any> {
	const pathArray = toPath(path);

	return pathArray.length === 0 ? reference : set(output, pathArray, reference);
}

export function replaceReferenceByPath(
	result: Record<string, any>,
	path: Array<string>,
	storePayload: any,
): Record<string, any> {
	return path.length === 0 ? storePayload : set(result, path, storePayload);
}

type FindReferenceResult = {
	reference: any;
	path: Array<string>;
};

// export function findReferences(
// 	result: Record<string, any>,
// 	path: Array<string> = [],
// ): FindReferenceResult | undefined {
// 	if (result === null || typeof result !== "object") return;
// 	if (result[REFERENCE_KEY]) return { reference: result[REFERENCE_KEY], path };

// 	for (const key in result) {
// 		if (result[key] === null || typeof result[key] !== "object") continue;

// 		// const nextPath = path ? `${path}.${key}` : key;
// 		const nextPath = path.concat(key);

// 		if (result[key][REFERENCE_KEY])
// 			return { reference: result[key][REFERENCE_KEY], path: nextPath };

// 		const nextResult = findReferences(result[key], nextPath);
// 		if (nextResult) return nextResult;
// 	}
// }
export function findAllReferences(
	result: Record<string, any>,
	path: Array<string> = [],
): FindReferenceResult[] {
	let references: FindReferenceResult[] = [];

	// Check if the result itself is null or not an object
	if (result === null || typeof result !== "object") return references;

	// Check for the REFERENCE_KEY in the current level of the object
	if (result[MIDDY_STORE]) {
		references.push({ reference: result[MIDDY_STORE], path });
	}

	// Iterate through the object recursively to find all references
	for (const key in result) {
		if (Object.hasOwn(result, key)) {
			if (result[key] === null || typeof result[key] !== "object") continue;

			const nextPath = path.concat(key); // Prepare the next path

			// Recursively search for references in the next level of the object
			const childReferences = findAllReferences(result[key], nextPath);
			references = references.concat(childReferences);
		}
	}

	return references;
}
