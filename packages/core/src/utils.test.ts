import { describe, expect, test } from "vitest";
import { calculateByteSize, tryParseJSON, tryStringifyJSON } from "./utils.js";

const mockPayload = {
	foo: "bar",
};

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
