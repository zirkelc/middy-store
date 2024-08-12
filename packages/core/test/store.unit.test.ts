import middy from "@middy/core";
import type { Context } from "aws-lambda";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	MIDDY_STORE,
	type MiddyStoreOptions,
	Sizes,
	type StoreInterface,
	middyStore,
} from "../src/store.js";
import { calculateByteSize } from "../src/utils.js";

const context = {} as Context;

const mockStore: StoreInterface = {
	name: "mock",
	canLoad: vi.fn(),
	load: vi.fn(),
	canStore: vi.fn(),
	store: vi.fn(),
};

const useStore = <TInput = any, TOutput = any>(
	options: MiddyStoreOptions<TInput>,
) =>
	middy<TInput, TOutput>()
		.use(middyStore(options))
		.handler(async (input) => {
			return input;
		});

beforeAll(() => {
	vi.resetAllMocks();
});

describe("load", () => {
	test("should passthrough input without reference", async () => {
		const handler = useStore({
			stores: [mockStore],
		});

		await expect(handler(null, context)).resolves.toEqual(null);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler(undefined, context)).resolves.toEqual({}); // undefined is converted to {}
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler("foo", context)).resolves.toEqual("foo");
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler(42, context)).resolves.toEqual(42);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler(true, context)).resolves.toEqual(true);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler(false, context)).resolves.toEqual(false);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler({}, context)).resolves.toEqual({});
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler({ foo: "bar" }, context)).resolves.toEqual({
			foo: "bar",
		});
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler([], context)).resolves.toEqual([]);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler(["foo"], context)).resolves.toEqual(["foo"]);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(handler([{ foo: "bar" }], context)).resolves.toEqual([
			{ foo: "bar" },
		]);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();
	});

	test("should passthrough input if stores are empty", async () => {
		const reference = {
			store: "mock",
		};

		const handler = useStore({
			stores: [],
			loadOptions: { passThrough: true },
		});

		await expect(
			handler(
				{
					[MIDDY_STORE]: reference,
				},
				context,
			),
		).resolves.toEqual(reference);

		await expect(
			handler(
				{
					a: {
						[MIDDY_STORE]: reference,
					},
				},
				context,
			),
		).resolves.toEqual({ a: reference });

		await expect(
			handler(
				{
					a: {
						b: { [MIDDY_STORE]: reference },
					},
				},
				context,
			),
		).resolves.toEqual({ a: { b: reference } });

		await expect(
			handler(
				{
					a: {
						b: { c: [{ [MIDDY_STORE]: reference }] },
					},
				},
				context,
			),
		).resolves.toEqual({ a: { b: { c: [reference] } } });

		await expect(
			handler(
				[
					{
						[MIDDY_STORE]: reference,
					},
				],
				context,
			),
		).resolves.toEqual([reference]);

		await expect(
			handler(
				[
					{
						[MIDDY_STORE]: reference,
					},
					{
						[MIDDY_STORE]: reference,
					},
				],
				context,
			),
		).resolves.toEqual([reference, reference]);
	});

	test("should passthrough input if no store can load", async () => {
		vi.mocked(mockStore.canLoad).mockReturnValue(false);

		const reference = {
			store: "mock",
		};

		const handler = useStore({
			stores: [mockStore],
			loadOptions: { passThrough: true },
		});

		await expect(
			handler(
				{
					[MIDDY_STORE]: reference,
				},
				context,
			),
		).resolves.toEqual(reference);
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				{
					a: {
						[MIDDY_STORE]: reference,
					},
				},
				context,
			),
		).resolves.toEqual({ a: reference });
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				{
					a: {
						b: { [MIDDY_STORE]: reference },
					},
				},
				context,
			),
		).resolves.toEqual({ a: { b: reference } });
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				{
					a: {
						b: { c: [{ [MIDDY_STORE]: reference }] },
					},
				},
				context,
			),
		).resolves.toEqual({ a: { b: { c: [reference] } } });
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				[
					{
						[MIDDY_STORE]: reference,
					},
				],
				context,
			),
		).resolves.toEqual([reference]);
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				[
					{
						[MIDDY_STORE]: reference,
					},
					{
						[MIDDY_STORE]: reference,
					},
				],
				context,
			),
		).resolves.toEqual([reference, reference]);
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canLoad).mockReturnValue(false);

		const reference = {
			store: "mock",
		};

		const handler = useStore({
			stores: [mockStore],
			loadOptions: { passThrough: false },
		});

		await expect(
			handler(
				{
					[MIDDY_STORE]: reference,
				},
				context,
			),
		).rejects.toThrow();
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				{
					a: {
						[MIDDY_STORE]: reference,
					},
				},
				context,
			),
		).rejects.toThrow();
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				{
					a: {
						b: { [MIDDY_STORE]: reference },
					},
				},
				context,
			),
		).rejects.toThrow();
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				{
					a: {
						b: { c: [{ [MIDDY_STORE]: reference }] },
					},
				},
				context,
			),
		).rejects.toThrow();
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();

		await expect(
			handler(
				[
					{
						[MIDDY_STORE]: reference,
					},
					{
						[MIDDY_STORE]: reference,
					},
				],
				context,
			),
		).rejects.toThrow();
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).not.toHaveBeenCalled();
	});

	test("should load input from reference", async () => {
		const payload = {
			foo: "bar",
		};

		const reference = {
			store: "mock",
		};

		const handler = useStore({
			stores: [mockStore],
		});

		vi.mocked(mockStore.canLoad).mockReturnValue(true);
		vi.mocked(mockStore.load).mockResolvedValue(payload);

		await expect(
			handler(
				{
					[MIDDY_STORE]: reference,
				},
				context,
			),
		).resolves.toEqual(payload);
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).toHaveBeenCalledWith({ reference });

		await expect(
			handler(
				{
					a: {
						[MIDDY_STORE]: reference,
					},
				},
				context,
			),
		).resolves.toEqual({ a: payload });
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).toHaveBeenCalledWith({ reference });

		await expect(
			handler(
				{
					a: {
						b: { [MIDDY_STORE]: reference },
					},
				},
				context,
			),
		).resolves.toEqual({ a: { b: payload } });
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).toHaveBeenCalledWith({ reference });

		await expect(
			handler(
				{
					a: {
						b: { c: [{ [MIDDY_STORE]: reference }] },
					},
				},
				context,
			),
		).resolves.toEqual({ a: { b: { c: [payload] } } });
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).toHaveBeenCalledWith({ reference });

		await expect(
			handler(
				{
					a: {
						b: {
							c: [{ [MIDDY_STORE]: reference }, { [MIDDY_STORE]: reference }],
						},
					},
				},
				context,
			),
		).resolves.toEqual({ a: { b: { c: [payload, payload] } } });
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).toHaveBeenCalledWith({ reference });

		await expect(
			handler(
				[
					{
						[MIDDY_STORE]: reference,
					},
					{
						[MIDDY_STORE]: reference,
					},
				],
				context,
			),
		).resolves.toEqual([payload, payload]);
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).toHaveBeenCalledWith({ reference });
	});
});

describe("store", () => {
	test("should passthrough output if it not an object", async () => {
		const handler = useStore({
			stores: [mockStore],
		});

		await expect(handler(null, context)).resolves.toEqual(null);
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();

		await expect(handler(undefined, context)).resolves.toEqual({});
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();

		await expect(handler("foo", context)).resolves.toEqual("foo");
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();

		await expect(handler(42, context)).resolves.toEqual(42);
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();

		await expect(handler(true, context)).resolves.toEqual(true);
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();

		await expect(handler(false, context)).resolves.toEqual(false);
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should passthrough output if size is too small", async () => {
		const payload = {
			foo: "bar",
		};

		const handler = useStore({
			stores: [mockStore],
		});

		await expect(handler(payload, context)).resolves.toEqual(payload);
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should passthrough output if stores are empty", async () => {
		const payload = {
			foo: "bar",
		};
		const byteSize = calculateByteSize(payload);

		const handler = useStore({
			stores: [],
		});

		await expect(handler(payload, context)).resolves.toEqual(payload);
	});

	test("should passthrough output if no store can store", async () => {
		const payload = {
			foo: "bar",
		};
		const byteSize = calculateByteSize(payload);

		vi.mocked(mockStore.canStore).mockReturnValue(false);

		const handler = useStore({
			stores: [mockStore],
			storeOptions: {
				minSize: Sizes.ZERO,
				passThrough: true,
			},
		});

		await expect(handler(payload, context)).resolves.toEqual(payload);
		expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canStore).mockReturnValue(false);

		const payload = {
			foo: "bar",
		};
		const byteSize = calculateByteSize(payload);

		const handler = useStore({
			stores: [mockStore],
			storeOptions: {
				minSize: Sizes.ZERO,
				passThrough: false,
			},
		});

		await expect(handler(payload, context)).rejects.toThrow();
		expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should store output and return reference", async () => {
		const reference = {
			store: "mock",
		};
		const payload = { a: { b: { c: [{ foo: "bar" }, { foo: "bar" }] } } };
		const byteSize = calculateByteSize(payload);

		vi.mocked(mockStore.canStore).mockReturnValue(true);
		vi.mocked(mockStore.store).mockResolvedValue(reference);

		{
			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: Sizes.ZERO,
					selector: "",
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				{ [MIDDY_STORE]: reference },
			);
			expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
			expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: Sizes.ZERO,
					selector: "a",
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				{ a: { [MIDDY_STORE]: reference } },
			);
			expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
			expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b",
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				{ a: { b: { [MIDDY_STORE]: reference } } },
			);
			expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
			expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b.c",
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				{ a: { b: { c: { [MIDDY_STORE]: reference } } } },
			);
			expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
			expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b.c[0]",
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				{ a: { b: { c: [{ [MIDDY_STORE]: reference }, { foo: "bar" }] } } },
			);
			expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
			expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b.c[*]",
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				{
					a: {
						b: {
							c: [{ [MIDDY_STORE]: reference }, { [MIDDY_STORE]: reference }],
						},
					},
				},
			);
			expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
			expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b",
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				{ a: { b: { [MIDDY_STORE]: reference } } },
			);
			expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
			expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
		}
	});
});