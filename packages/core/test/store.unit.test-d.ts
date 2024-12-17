import { describe } from "node:test";
import { expectTypeOf, test } from "vitest";
import { type StoringOptions, middyStore } from "../src/store.js";

type Input = {};

describe("selector", () => {
	test("should type selector", () => {
		expectTypeOf<StoringOptions<Input, {}>>().toMatchTypeOf<{
			skip?: boolean;
			passThrough?: boolean;
			selector?: undefined;
			minSize?: number;
		}>();

		expectTypeOf<StoringOptions<Input, { a: string }>>().toMatchTypeOf<{
			skip?: boolean;
			passThrough?: boolean;
			selector?: "a";
			minSize?: number;
		}>();

		expectTypeOf<StoringOptions<Input, { a: { b: string } }>>().toMatchTypeOf<{
			skip?: boolean;
			passThrough?: boolean;
			selector?: "a" | "a.b";
			minSize?: number;
		}>();

		expectTypeOf<
			StoringOptions<Input, { a: { b: Array<string> } }>
		>().toMatchTypeOf<{
			skip?: boolean;
			passThrough?: boolean;
			selector?: "a" | "a.b" | `a.b.${number}` | "a.b.*";
			minSize?: number;
		}>();

		expectTypeOf<
			StoringOptions<Input, { a: { b: Array<{ c: string }> } }>
		>().toMatchTypeOf<{
			skip?: boolean;
			passThrough?: boolean;
			selector?:
				| "a"
				| "a.b"
				| `a.b.${number}`
				| "a.b.*"
				| `a.b.${number}.c`
				| "a.b.*.c";
			minSize?: number;
		}>();
	});
});
