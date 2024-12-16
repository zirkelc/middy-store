import middy from "@middy/core";
import type { Context } from "aws-lambda";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { randomStringInBytes } from "../src/internal.js";
import {
	MIDDY_STORE,
	type MiddyStoreOptions,
	Sizes,
	type StoreInterface,
	middyStore,
} from "../src/store.js";
import { calculateByteSize, createReference } from "../src/utils.js";

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

beforeEach(() => {
	vi.resetAllMocks();
});

describe("load", () => {
	test("should passthrough input if type is not supported", async () => {
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
	});

	test("should passthrough input if no reference", async () => {
		const handler = useStore({
			stores: [mockStore],
		});

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
			loadingOptions: { passThrough: true },
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
			loadingOptions: { passThrough: true },
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
			loadingOptions: { passThrough: false },
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

	describe("should load reference and return input", () => {
		test("object", async () => {
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
});

describe("store", () => {
	test("should passthrough output if type is not supported", async () => {
		const handler = useStore({
			stores: [mockStore],
		});

		await expect(handler(null, context)).resolves.toEqual(null);
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();

		await expect(handler(undefined, context)).resolves.toEqual({});
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

	describe("should passthrough output if size is too small", async () => {
		test("string", async () => {
			const payload = randomStringInBytes(Sizes.kb(1));
			const reference = { store: "mock" };

			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(reference);

			const handler = useStore({
				stores: [mockStore],
				storingOptions: {
					minSize: Sizes.kb(2),
				},
			});

			await expect(handler(payload, context)).resolves.toEqual(payload);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();

			await expect(handler([payload, payload], context)).resolves.toEqual({
				[MIDDY_STORE]: reference,
			});
			expect(mockStore.canStore).toHaveBeenCalled();
			expect(mockStore.store).toHaveBeenCalled();
		});

		test("object", async () => {
			const payload = { foo: randomStringInBytes(Sizes.kb(1)) };
			const reference = { store: "mock" };

			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(reference);

			const handler = useStore({
				stores: [mockStore],
				storingOptions: {
					minSize: Sizes.kb(2),
				},
			});

			await expect(handler(structuredClone(payload), context)).resolves.toEqual(
				payload,
			);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();

			await expect(
				handler(structuredClone([payload, payload]), context),
			).resolves.toEqual(createReference(reference));
			expect(mockStore.canStore).toHaveBeenCalled();
			expect(mockStore.store).toHaveBeenCalled();
		});
	});

	test("should passthrough output if it's a reference", async () => {
		const reference = { store: "mock" };

		{
			const payload = createReference(reference);
			const handler = useStore({
				stores: [mockStore],
				loadingOptions: { skip: true },
				storingOptions: {
					minSize: Sizes.ZERO,
				},
			});

			await expect(handler(payload, context)).resolves.toEqual(payload);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const payload = { a: createReference(reference) };
			const handler = useStore({
				stores: [mockStore],
				loadingOptions: { skip: true },
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "a",
				},
			});

			await expect(handler(payload, context)).resolves.toEqual(payload);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const payload = { a: { b: createReference(reference) } };
			const handler = useStore({
				stores: [mockStore],
				loadingOptions: { skip: true },
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b",
				},
			});

			await expect(handler(payload, context)).resolves.toEqual(payload);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const payload = {
				a: {
					b: { c: createReference(reference) },
				},
			};
			const handler = useStore({
				stores: [mockStore],
				loadingOptions: { skip: true },
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b.c",
				},
			});

			await expect(handler(payload, context)).resolves.toEqual(payload);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const payload = {
				a: {
					b: { c: [createReference(reference), createReference(reference)] },
				},
			};
			const handler = useStore({
				stores: [mockStore],
				loadingOptions: { skip: true },
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b.c[0]",
				},
			});

			await expect(handler(payload, context)).resolves.toEqual(payload);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const payload = {
				a: {
					b: { c: [createReference(reference), createReference(reference)] },
				},
			};
			const handler = useStore({
				stores: [mockStore],
				loadingOptions: { skip: true },
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "a.b.c.*",
				},
			});

			await expect(handler(payload, context)).resolves.toEqual(payload);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}
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
			storingOptions: {
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
			storingOptions: {
				minSize: Sizes.ZERO,
				passThrough: false,
			},
		});

		await expect(handler(payload, context)).rejects.toThrow();
		expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should throw an error if selector path does not exist", async () => {
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
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "x",
				},
			});

			await expect(
				handler(structuredClone(payload), context),
			).rejects.toThrow();
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "x.y",
				},
			});

			await expect(
				handler(structuredClone(payload), context),
			).rejects.toThrow();
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "x.y.z",
				},
			});

			await expect(
				handler(structuredClone(payload), context),
			).rejects.toThrow();
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "x.y.z[0]",
				},
			});

			await expect(
				handler(structuredClone(payload), context),
			).rejects.toThrow();
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}

		{
			const handler = useStore({
				stores: [mockStore],
				storingOptions: {
					minSize: Sizes.ZERO,
					selector: "x.y.z.*",
				},
			});

			await expect(
				handler(structuredClone(payload), context),
			).rejects.toThrow();
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		}
	});

	describe("should store output and return reference", () => {
		test("string", async () => {
			const reference = {
				store: "mock",
			};
			const payload = "foo";
			const byteSize = calculateByteSize(payload);

			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(reference);

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: undefined,
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual(createReference(reference));
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual(createReference(reference));
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				// ignore selector
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "a",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual(createReference(reference));
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				// ignore selector
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "a.b",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual(createReference(reference));
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}
		});

		test("object", async () => {
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
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: undefined,
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual(createReference(reference));
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual(createReference(reference));
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "a",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual({ a: createReference(reference) });
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "a.b",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual({ a: { b: createReference(reference) } });
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "a.b.c",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual({ a: { b: { c: createReference(reference) } } });
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "a.b.c[0]",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual({
					a: { b: { c: [createReference(reference), { foo: "bar" }] } },
				});
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}

			{
				const handler = useStore({
					stores: [mockStore],
					storingOptions: {
						minSize: Sizes.ZERO,
						selector: "a.b.c.*",
					},
				});

				await expect(
					handler(structuredClone(payload), context),
				).resolves.toEqual({
					a: {
						b: {
							c: [createReference(reference), createReference(reference)],
						},
					},
				});
				expect(mockStore.canStore).toHaveBeenCalledWith({ payload, byteSize });
				expect(mockStore.store).toHaveBeenCalledWith({ payload, byteSize });
			}
		});
	});
});
