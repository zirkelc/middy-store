import get from "lodash.get";
import set from "lodash.set";
import toPath from "lodash.topath";
import type { Reference, Replacer, Selector } from "./store.js";

const REFERENCE_KEY = "@store";

export function tryParseJSON(json: string | undefined): unknown | false {
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

export function calculateByteSize(payload: any) {
	if (typeof payload === "string") return Buffer.byteLength(payload);

	if (typeof payload === "object")
		return Buffer.byteLength(JSON.stringify(payload));

	throw new Error(`Unsupported payload type: ${typeof payload}`);
}

type SelectPayloadArgs = {
	output: Record<string, any>;
	selector: Selector;
};
export function selectPayload({ output, selector }: SelectPayloadArgs): any {
	if (typeof selector === "function") {
		return selector({ output });
	}

	const path = toPath(selector);
	const payload = path.length === 0 ? output : get(output, path);

	return payload;
}

type ReplacePayloadWithReferenceArgs = {
	input: any;
	output: any;
	storeReference: any;
	replacer: Replacer;
};
export function replacePayloadWithReference({
	input,
	output,
	storeReference,
	replacer,
}: ReplacePayloadWithReferenceArgs): Record<string, any> {
	const reference: Reference = { [REFERENCE_KEY]: storeReference };

	if (typeof replacer === "function") {
		return replacer({ output, input, reference });
	}

	const path = toPath(replacer);

	return path.length === 0 ? reference : set(output, path, reference);
}

export function replaceReferenceWithPayload(
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
	if (result[REFERENCE_KEY]) {
		references.push({ reference: result[REFERENCE_KEY], path });
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
