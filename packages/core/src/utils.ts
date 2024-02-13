import set from "lodash.set";
import toPath from "lodash.topath";
import type { Selector, Reference } from "./store.js";
import get from "lodash.get";

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

type SelectPayloadResult = {
	payload: any;
	path: Array<string>;
};

export function selectPayload(
	result: Record<string, any>,
	selector: Selector,
): SelectPayloadResult {
	const path = toPath(selector);
	const payload = path.length === 0 ? result : get(result, path);

	return { payload, path };
}

export function replacePayloadWithReference(
	result: Record<string, any>,
	path: Array<string>,
	storeReference: any,
): Record<string, any> {
	const reference: Reference = { [REFERENCE_KEY]: storeReference };

	return path.length === 0 ? reference : set(result, path, reference);
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

export function findReference(
	result: Record<string, any>,
	path: Array<string> = [],
): FindReferenceResult | undefined {
	if (result === null || typeof result !== "object") return;
	if (result[REFERENCE_KEY]) return { reference: result[REFERENCE_KEY], path };

	for (const key in result) {
		if (result[key] === null || typeof result[key] !== "object") continue;

		// const nextPath = path ? `${path}.${key}` : key;
		const nextPath = path.concat(key);

		if (result[key][REFERENCE_KEY])
			return { reference: result[key][REFERENCE_KEY], path: nextPath };

		const nextResult = findReference(result[key], nextPath);
		if (nextResult) return nextResult;
	}
}
