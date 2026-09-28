import { describe, expect, test, vi } from "vitest";
import { randomStringInBytes } from "../src/internal.js";
import { MIDDY_STORE, Sizes } from "../src/store.js";
import {
	calculateByteSize,
	createReference,
	hasReference,
	isObject,
	replaceByPath,
	resolvableFn,
	tryParseJSON,
	tryStringifyJSON,
} from "../src/utils.js";

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
		expect(calculateByteSize(randomStringInBytes(Sizes.kb(1)))).toEqual(
			Sizes.kb(1),
		);
		expect(calculateByteSize(randomStringInBytes(Sizes.kb(10)))).toEqual(
			Sizes.kb(10),
		);
		expect(calculateByteSize(randomStringInBytes(Sizes.kb(100)))).toEqual(
			Sizes.kb(100),
		);
		expect(calculateByteSize(randomStringInBytes(Sizes.mb(1)))).toEqual(
			Sizes.mb(1),
		);
		expect(calculateByteSize(randomStringInBytes(Sizes.mb(10)))).toEqual(
			Sizes.mb(10),
		);
	});

	test("should calculate the size from object", async () => {
		const objSize = Buffer.byteLength(JSON.stringify({ foo: "" }), "utf8");

		expect(
			calculateByteSize({ foo: randomStringInBytes(Sizes.kb(1)) }),
		).toEqual(Sizes.kb(1) + objSize);
		expect(
			calculateByteSize({ foo: randomStringInBytes(Sizes.kb(10)) }),
		).toEqual(Sizes.kb(10) + objSize);
		expect(
			calculateByteSize({ foo: randomStringInBytes(Sizes.kb(100)) }),
		).toEqual(Sizes.kb(100) + objSize);
		expect(
			calculateByteSize({ foo: randomStringInBytes(Sizes.mb(1)) }),
		).toEqual(Sizes.mb(1) + objSize);
		expect(
			calculateByteSize({ foo: randomStringInBytes(Sizes.mb(10)) }),
		).toEqual(Sizes.mb(10) + objSize);
	});

	test("should throw an error if unsupported type", async () => {
		const payload = 42;

		expect(() => calculateByteSize(payload)).toThrowError();
	});

	test("should fall back to the V8 max string length if the object is too large to stringify", async () => {
		// Arrange
		const payload = { foo: "bar" };
		const stringifySpy = vi.spyOn(JSON, "stringify").mockImplementation(() => {
			throw new RangeError("Invalid string length");
		});

		try {
			// Act
			const result = calculateByteSize(payload);

			// Assert
			expect(result).toBe(0x1fffffe8);
			expect(stringifySpy.mock.calls[0]).toEqual([payload]);
		} finally {
			stringifySpy.mockRestore();
		}
	});

	test("should rethrow errors other than RangeError", async () => {
		// Arrange
		const payload: Record<string, unknown> = {};
		payload.self = payload;

		// Act
		const result = () => calculateByteSize(payload);

		// Assert
		expect(result).toThrow(TypeError);
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

describe("createReference", () => {
	test("should create a reference", async () => {
		const reference = "foo";
		const result = createReference(reference);
		expect(result).toEqual({ [MIDDY_STORE]: reference });
	});
});

describe("replaceByPath", () => {
	test("should return the value if the path is empty", async () => {
		// Arrange
		const source = { a: 1 };

		// Act
		const result = replaceByPath({ source, value: "foo", path: "" });

		// Assert
		expect(result).toBe("foo");
		expect(source).toEqual({ a: 1 });
	});

	test("should return the value if the source is a string", async () => {
		// Arrange
		const source = "bar";

		// Act
		const result = replaceByPath({ source, value: "foo", path: "a" });

		// Assert
		expect(result).toBe("foo");
	});

	test("should replace the value without mutating the source", async () => {
		// Arrange
		const sibling = { x: 1 };
		const items = [{ y: 1 }, { y: 2 }];
		const source = { a: { b: items, sibling } };

		// Act
		const result = replaceByPath({ source, value: "foo", path: "a.b.1" });

		// Assert
		expect(result).toEqual({ a: { b: [{ y: 1 }, "foo"], sibling } });
		expect(source).toEqual({ a: { b: [{ y: 1 }, { y: 2 }], sibling } });
		expect(source.a.b).toBe(items);
		expect((result as any).a.sibling).toBe(sibling);
		expect((result as any).a.b[0]).toBe(items[0]);
	});

	test("should create missing containers along the path", async () => {
		// Arrange
		const source = { a: {} };

		// Act
		const result = replaceByPath({ source, value: "foo", path: "a.b[0].c" });

		// Assert
		expect(result).toEqual({ a: { b: [{ c: "foo" }] } });
		expect(source).toEqual({ a: {} });
	});

	test("should preserve the prototype of copied objects", async () => {
		// Arrange
		class Foo {
			a = 1;
		}
		const source = { foo: new Foo() };

		// Act
		const result = replaceByPath({ source, value: 2, path: "foo.a" }) as any;

		// Assert
		expect(result.foo).toBeInstanceOf(Foo);
		expect(result.foo.a).toBe(2);
		expect(source.foo.a).toBe(1);
	});

	test("should keep an own __proto__ key on the path", async () => {
		// Arrange
		const source = JSON.parse('{"__proto__":{"x":1},"y":2}');

		// Act
		const result = replaceByPath({ source, value: "foo", path: "__proto__.x" });

		// Assert
		expect(JSON.stringify(result)).toBe('{"__proto__":{"x":"foo"},"y":2}');
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect(JSON.stringify(source)).toBe('{"__proto__":{"x":1},"y":2}');
	});

	test("should keep accessors and non-index properties of arrays", async () => {
		// Arrange
		const items = Object.assign([1, 2], { extra: "bar" });
		const source = {
			items,
			get total() {
				return 42;
			},
		};

		// Act
		const result = replaceByPath({
			source,
			value: "foo",
			path: "items.0",
		}) as any;

		// Assert
		expect(result.items).toEqual(Object.assign(["foo", 2], { extra: "bar" }));
		expect(Array.isArray(result.items)).toBe(true);
		expect(result.items.extra).toBe("bar");
		expect(Object.getOwnPropertyDescriptor(result, "total")?.get).toBeTypeOf(
			"function",
		);
		expect(items[0]).toBe(1);
	});

	test("should throw instead of mutating a function on the path", async () => {
		// Arrange
		const fn = Object.assign(() => {}, { payload: 1 });
		const source = { fn };

		// Act
		const result = () =>
			replaceByPath({ source, value: "foo", path: "fn.payload" });

		// Assert
		expect(result).toThrow();
		expect(fn.payload).toBe(1);
	});

	test("should reuse containers that were already copied", async () => {
		// Arrange
		const source = { a: [1, 2, 3] };
		const cloned = new WeakSet<object>();

		// Act
		const first = replaceByPath({
			source,
			value: "x",
			path: "a.0",
			cloned,
		}) as any;
		const second = replaceByPath({
			source: first,
			value: "y",
			path: "a.1",
			cloned,
		}) as any;

		// Assert
		expect(second).toBe(first);
		expect(second.a).toBe(first.a);
		expect(second).toEqual({ a: ["x", "y", 3] });
		expect(source).toEqual({ a: [1, 2, 3] });
	});

	test("should copy again without a shared set of copied containers", async () => {
		// Arrange
		const source = { a: [1, 2, 3] };

		// Act
		const first = replaceByPath({ source, value: "x", path: "a.0" }) as any;
		const second = replaceByPath({
			source: first,
			value: "y",
			path: "a.1",
		}) as any;

		// Assert
		expect(second).not.toBe(first);
		expect(first).toEqual({ a: ["x", 2, 3] });
		expect(second).toEqual({ a: ["x", "y", 3] });
	});
});
