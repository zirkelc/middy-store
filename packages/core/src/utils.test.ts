import { describe, expect, test } from "vitest";
import { MIDDY_STORE } from "./store.js";
import {
	calculateByteSize,
	hasReference,
	isObject,
	resolvableFn,
	tryParseJSON,
	tryStringifyJSON,
} from "./utils.js";

const mockPayload = {
	foo: "bar",
};

describe("resolvableFn", () => {
	test("should resolve from function", async () => {
		const input = () => "foo";
		const result = resolvableFn(input);

		expect(typeof result).toBe("function");
		expect(result()).toBe("foo");
	});

	test("should resolve from value", async () => {
		const input = "foo";
		const result = resolvableFn(input);

		expect(typeof result).toBe("function");
		expect(result()).toBe("foo");
	});
});

describe("calculateByteSize", () => {
	test("should calculate the size from string", async () => {
		const payload = "foo";

		const size = calculateByteSize(payload);

		expect(size).toEqual(Buffer.from(payload).byteLength);
	});

	test("should calculate the size from object", async () => {
		const payload = mockPayload;

		const size = calculateByteSize(payload);

		expect(size).toEqual(Buffer.from(JSON.stringify(payload)).byteLength);
	});

	test("should throw an error if unsupported type", async () => {
		const payload = 42;

		expect(() => calculateByteSize(payload)).toThrowError();
	});
});

describe("tryParseJSON", () => {
	test("should parse string", async () => {
		const payload = JSON.stringify(mockPayload);

		const result = tryParseJSON(payload);

		expect(result).toEqual(mockPayload);
	});

	test.each([null, undefined, "foo", 42, true, false, () => {}])(
		"should return false for: %s",
		async (input) => {
			const result = tryParseJSON(input as any);

			expect(result).toBe(false);
		},
	);
});

describe("tryStringifyJSON", () => {
	test("should stringify object", async () => {
		const payload = mockPayload;

		const result = tryStringifyJSON(payload);

		expect(result).toEqual(JSON.stringify(payload));
	});

	test.each([null, undefined, "foo", 42, true, false, () => {}])(
		"should return false for: %s",
		async (input) => {
			const result = tryStringifyJSON(input as any);

			expect(result).toBe(false);
		},
	);
});

describe("isObject", () => {
	test.each([null, undefined, "foo", 42, true, false, () => {}])(
		"should return false for: %s",
		async (input) => {
			const result = isObject(input as any);
			expect(result).toBe(false);
		},
	);

	test("should return true for object", async () => {
		const input = {};

		const result = isObject(input);
		expect(result).toBe(true);
	});
});

describe("hasReference", () => {
	test("should return true if input has a reference", async () => {
		const input = { [MIDDY_STORE]: "foo" };
		const result = hasReference(input);
		expect(result).toBe(true);
	});

	test.each([{}, null, undefined, "foo", 42, true, false, () => {}])(
		"should return false if input '%s' has no reference",
		async (input) => {
			const result = hasReference(input);
			expect(result).toBe(false);
		},
	);
});

describe("getReference", () => {
	test("should return reference if input has a reference", async () => {
		const input = { [MIDDY_STORE]: "foo" };
		const result = hasReference(input);
		expect(result).toBe(true);
	});

	test.each([{}, null, undefined, "foo", 42, true, false, () => {}])(
		"should return undefined if input '%s' has no reference",
		async (input) => {
			const result = hasReference(input);
			expect(result).toBe(false);
		},
	);
});
