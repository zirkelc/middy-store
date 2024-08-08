import middy from "@middy/core";
import { APIGatewayProxyEventV2, type Context, Handler } from "aws-lambda";
import set from "lodash.set";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	type LoadArgs,
	LoadOptions,
	MIDDY_STORE,
	type MiddyStoreOptions,
	type StoreArgs,
	type StoreInterface,
	StoreOptions,
	middyStore,
	// middyStore,
} from "../src/store.js";

const context = {} as Context;

type MockInput =
	| {
			foo: string;
	  }
	| {
			"@middy-store": MockReference;
	  };

type MockOutput = {
	foo: string;
};

type MockReference = {
	store: "mock";
};
const mockReference: MockReference = {
	store: "mock",
};

const mockPayloadWithReference: MockInput = {
	"@middy-store": mockReference,
};

const mockPayload: MockInput = {
	foo: "bar",
};

const mockLoadInput: LoadArgs<MockReference> = {
	reference: mockReference,
};

const mockStoreOutput: StoreArgs<typeof mockPayload> = {
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
};

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

	test("should passthrough input if no store was found", async () => {
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
						a: { [MIDDY_STORE]: reference },
					},
					{
						a: {
							b: { [MIDDY_STORE]: reference },
						},
					},
					{
						a: {
							b: { c: [{ [MIDDY_STORE]: reference }] },
						},
					},
				],
				context,
			),
		).resolves.toEqual([
			payload,
			{ a: payload },
			{ a: { b: payload } },
			{ a: { b: { c: [payload] } } },
		]);
		expect(mockStore.canLoad).toHaveBeenCalledWith({ reference });
		expect(mockStore.load).toHaveBeenCalledWith({ reference });
	});
});

describe("store", () => {
	test.each([null, "foo", 42, true, false, () => {}])(
		"should passthrough output if is: %s",
		async (input) => {
			const handler = useStore({
				stores: [mockStore],
			});

			const output = await handler(input as any, context);

			expect(output).toEqual(input);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		},
	);

	test("should passthrough output if size is too small", async () => {
		const handler = useStore({
			stores: [mockStore],
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(input);
		expect(mockStore.canStore).not.toHaveBeenCalled();
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should passthrough output if no store was found", async () => {
		vi.mocked(mockStore.canStore).mockReturnValue(false);

		const handler = useStore({
			stores: [mockStore],
			storeOptions: {
				minSize: 0,
				passThrough: true,
			},
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayload);
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canStore).mockReturnValue(false);

		const handler = useStore({
			stores: [mockStore],
			storeOptions: {
				minSize: 0,
				passThrough: false,
			},
		});

		const input = mockPayloadWithReference;

		const output = handler(input, context);

		await expect(output).rejects.toThrow();
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should store output if size exceeds max size", async () => {
		vi.mocked(mockStore.canStore).mockReturnValue(true);
		vi.mocked(mockStore.store).mockResolvedValue(mockReference);

		const handler = useStore({
			stores: [mockStore],
			storeOptions: {
				minSize: 0,
			},
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayloadWithReference);
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.store).toHaveBeenCalledWith(mockStoreOutput);
	});

	test.each([
		{
			selector: undefined,
			input: mockPayload,
			result: mockPayloadWithReference,
		},
		{
			selector: "",
			input: mockPayload,
			result: mockPayloadWithReference,
		},
	])(
		"should select root payload with selector: $selector",
		async ({ selector, input, result }) => {
			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(mockReference);

			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: 0,
					selector,
				},
			});

			const output = await handler(input, context);

			expect(output).toEqual(result);
			expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.store).toHaveBeenCalledWith(mockStoreOutput);
		},
	);

	test.each([
		{
			selector: "a",
			input: { a: mockPayload },
			result: { a: mockPayloadWithReference },
		},
		{
			selector: "a.b",
			input: { a: { b: mockPayload } },
			result: { a: { b: mockPayloadWithReference } },
		},
		{
			selector: "a.b[0].c",
			input: { a: { b: [{ c: mockPayload }] } },
			result: { a: { b: [{ c: mockPayloadWithReference }] } },
		},
	])(
		"should select single payload with selector: $selector",
		async ({ selector, input, result }) => {
			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(mockReference);

			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: 0,
					selector,
				},
			});

			const output = await handler(input, context);

			expect(output).toEqual(result);
			expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.store).toHaveBeenCalledWith(mockStoreOutput);
		},
	);

	test.each([
		{
			selector: "a[*]",
			input: { a: [mockPayload, mockPayload, mockPayload] },
			result: {
				a: [
					mockPayloadWithReference,
					mockPayloadWithReference,
					mockPayloadWithReference,
				],
			},
		},
		{
			selector: "a.b[*]",
			input: { a: { b: [mockPayload, mockPayload, mockPayload] } },
			result: {
				a: {
					b: [
						mockPayloadWithReference,
						mockPayloadWithReference,
						mockPayloadWithReference,
					],
				},
			},
		},
		{
			selector: "a.b[0].c[*]",
			input: { a: { b: [{ c: [mockPayload, mockPayload, mockPayload] }] } },
			result: {
				a: {
					b: [
						{
							c: [
								mockPayloadWithReference,
								mockPayloadWithReference,
								mockPayloadWithReference,
							],
						},
					],
				},
			},
		},
	])(
		"should select multiple payloads with selector: $selector",
		async ({ selector, input, result }) => {
			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(mockReference);

			const handler = useStore({
				stores: [mockStore],
				storeOptions: {
					minSize: 0,
					selector,
				},
			});

			const output = await handler(input, context);

			expect(output).toEqual(result);
			expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.store).toHaveBeenCalledWith(mockStoreOutput);
		},
	);
});
