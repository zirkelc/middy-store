import get from "lodash.get";
import set from "lodash.set";
import toPath from "lodash.topath";
import type {
	MiddyStore,
	Path,
	ReadInput,
	ReadableStore,
	Size,
	Store,
	WritableStore,
	WriteOutput,
} from "./store.js";
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

// export const isReadableStore = (store: Store | ReadableStore | WritableStore, input: LoadInput): store is ReadableStore =>
// 	"canLoad" in store && "load" in store && store.canLoad(input);

// export const isWritableStore = (store: ReadableStore | WritableStore, output: StoreOutput): store is WritableStore =>
// 	"canStore" in store && "store" in store && store.canStore(output);

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

	if (pathArray.length === 0) return reference;

	// // If the path ends with "[]", it means we are pushing the reference into an array
	// // If the parent element is an array, we push the reference into it
	// // Otherwise we create a new array with the reference
	// if (path.endsWith("[]")) {
	// 	const parentPath = pathArray.slice(0, -1);
	// 	const parent = get(output, parentPath);
	// 	if (Array.isArray(parent)) {
	// 		return set(output, parentPath, parent.concat(reference));
	// 	}

	// 	// TODO check if that works
	// 	// if (Array.isArray(reference)) {
	// 	// 	return set(output, pathArray, reference);
	// 	// }

	// 	return set(output, parentPath, [reference]);
	// }

	return set(output, pathArray, reference);
}

export function replaceReferenceByPath(
	result: Record<string, any>,
	path: Array<string>,
	payload: any,
): Record<string, any> {
	return path.length === 0 ? payload : set(result, path, payload);
}

type FindReferenceResult = {
	reference: any;
	path: Array<string>;
};

export const hasReference = <TReference = any>(
	obj: unknown,
): obj is MiddyStore<TReference> => {
	return typeof obj === "object" && obj !== null && MIDDY_STORE in obj;
};

export const getReference = <TReference = any>(
	obj: unknown,
): TReference | undefined => {
	return hasReference(obj) ? obj[MIDDY_STORE] : undefined;
};

export function findAllReferences(
	result: Record<string, any>,
	path: Array<string> = [],
): FindReferenceResult[] {
	let references: FindReferenceResult[] = [];

	// Check if the result itself is null or not an object
	if (result === null || typeof result !== "object") return references;

	// Check for the reference in the current level of the object
	const reference = getReference(result);
	if (reference) references.push({ reference, path });
	// if (result[MIDDY_STORE]) {
	// 	references.push({ reference: result[MIDDY_STORE], path });
	// }

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

export const MAX_SIZE_STEPFUNCTIONS = 256 * 1024; // 256KB
export const MAX_SIZE_LAMBDA_SYNC = 6 * 1024 * 1024; // 6MB
export const MAX_SIZE_LAMBDA_ASYNC = 256 * 1024; // 256KB

export function sizeToNumber(size: Size): number {
	if (typeof size === "number") return size;

	switch (size) {
		case "always":
			return 0;

		case "never":
			return Number.POSITIVE_INFINITY;

		case "stepfunctions":
			return MAX_SIZE_STEPFUNCTIONS;

		case "lambda-sync":
			return MAX_SIZE_LAMBDA_SYNC;

		case "lambda-async":
			return MAX_SIZE_LAMBDA_ASYNC;

		default:
			size satisfies never;
			throw new Error(`Unsupported size: ${size}`);
	}
}
