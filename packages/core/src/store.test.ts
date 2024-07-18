import middy from "@middy/core";
import { APIGatewayProxyEventV2, type Context, Handler } from "aws-lambda";
import set from "lodash.set";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	type MiddyStoreOptions,
	type ReadInput,
	ReadStoreOptions,
	type Store,
	type WriteOutput,
	WriteStoreOptions,
	middyStore,
} from "./store.js";

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

const mockLoadInput: ReadInput<MockInput, MockReference> = {
	input: mockPayloadWithReference as any,
	reference: mockReference,
};

const mockStoreOutput: WriteOutput<typeof mockPayload, typeof mockPayload> = {
	input: mockPayload,
	output: mockPayload,
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
	index: 0,
};

const mockStore: Store = {
	name: "mock",
	canRead: vi.fn(),
	read: vi.fn(),
	canWrite: vi.fn(),
	write: vi.fn(),
};

const useReadStore = <TInput = any, TOutput = any>(
	options: MiddyStoreOptions<TInput>,
) =>
	middy()
		.use(middyStore(options))
		.handler(async (input) => {
			return input;
		});

const useWriteStore = <TInput = any, TOutput = any>(
	options: MiddyStoreOptions<TInput>,
) =>
	middy()
		.use(middyStore(options))
		.handler(async (input) => {
			return input;
		});

beforeAll(() => {
	vi.resetAllMocks();
});

describe("onReadInput", () => {
	test.each([null, "foo", 42, true, false, () => {}])(
		"should passthrough input if is: %s",
		async (input) => {
			const handler = useReadStore({
				stores: [mockStore],
			});

			const output = await handler(input as any, context);

			expect(output).toEqual(input);
			expect(mockStore.canRead).not.toHaveBeenCalled();
			expect(mockStore.read).not.toHaveBeenCalled();
		},
	);

	test("should passthrough input if no reference", async () => {
		const handler = useReadStore({
			stores: [mockStore],
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(input);
		expect(mockStore.canRead).not.toHaveBeenCalled();
		expect(mockStore.read).not.toHaveBeenCalled();
	});

	test("should passthrough input if no store was found", async () => {
		vi.mocked(mockStore.canRead).mockReturnValue(false);

		const handler = useReadStore({
			stores: [mockStore],
			passThrough: true,
		});

		const input = mockPayloadWithReference;

		const output = await handler(input, context);

		expect(output).toEqual(input);
		expect(mockStore.canRead).toHaveBeenCalledWith(mockLoadInput);
		expect(mockStore.read).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canRead).mockReturnValue(false);

		const handler = useReadStore({
			stores: [mockStore],
			passThrough: false,
		});

		const input = mockPayloadWithReference;

		const output = handler(input, context);

		await expect(output).rejects.toThrow();
		expect(mockStore.canRead).toHaveBeenCalledWith(mockLoadInput);
		expect(mockStore.read).not.toHaveBeenCalled();
	});

	test("should load input at root", async () => {
		vi.mocked(mockStore.canRead).mockReturnValue(true);
		vi.mocked(mockStore.read).mockResolvedValue(mockPayload);

		const handler = useReadStore({
			stores: [mockStore],
		});

		const input = mockPayloadWithReference;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayload);
		expect(mockStore.canRead).toHaveBeenCalledWith(mockLoadInput);
		expect(mockStore.read).toHaveBeenCalledWith(mockLoadInput);
	});

	test.each([{ path: "a" }, { path: "a.b" }, { path: "a.b[0].c" }])(
		"should load input nested: $path",
		async ({ path }) => {
			vi.mocked(mockStore.canRead).mockReturnValue(true);
			vi.mocked(mockStore.read).mockResolvedValue(mockPayload);

			const handler = useReadStore({
				stores: [mockStore],
			});

			const input = set({}, path, mockPayloadWithReference);

			const output = await handler(input, context);

			expect(output).toEqual(set({}, path, mockPayload));
			expect(mockStore.canRead).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.read).toHaveBeenCalledWith(mockLoadInput);
		},
	);

	describe("should load input from array", () => {
		test("root", async () => {
			vi.mocked(mockStore.canRead).mockReturnValue(true);
			vi.mocked(mockStore.read).mockResolvedValue(mockPayload);

			const handler = useReadStore({
				stores: [mockStore],
			});

			const input = [mockPayloadWithReference, mockPayloadWithReference];

			const output = await handler(input, context);

			expect(output).toEqual([mockPayload, mockPayload]);
			expect(mockStore.canRead).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.read).toHaveBeenCalledWith(mockLoadInput);
		});

		test("single property", async () => {
			vi.mocked(mockStore.canRead).mockReturnValue(true);
			vi.mocked(mockStore.read).mockResolvedValue(mockPayload);

			const handler = useReadStore({
				stores: [mockStore],
			});

			const input = {
				a: [mockPayloadWithReference, mockPayloadWithReference],
			};

			const output = await handler(input, context);

			expect(output).toEqual({ a: [mockPayload, mockPayload] });
			expect(mockStore.canRead).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.read).toHaveBeenCalledWith(mockLoadInput);
		});

		test("multiple properties", async () => {
			vi.mocked(mockStore.canRead).mockReturnValue(true);
			vi.mocked(mockStore.read).mockResolvedValue(mockPayload);

			const handler = useReadStore({
				stores: [mockStore],
			});

			const input = {
				a: [mockPayloadWithReference],
				b: mockPayloadWithReference,
			};

			const output = await handler(input, context);

			expect(output).toEqual({ a: [mockPayload], b: mockPayload });
			expect(mockStore.canRead).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.read).toHaveBeenCalledWith(mockLoadInput);
		});
	});
});

describe("onWriteOutput", () => {
	test.each([null, "foo", 42, true, false, () => {}])(
		"should passthrough output if is: %s",
		async (input) => {
			const handler = useWriteStore({
				stores: [mockStore],
			});

			const output = await handler(input as any, context);

			expect(output).toEqual(input);
			expect(mockStore.canWrite).not.toHaveBeenCalled();
			expect(mockStore.write).not.toHaveBeenCalled();
		},
	);

	test("should passthrough output if size is too size", async () => {
		const handler = useWriteStore({
			stores: [mockStore],
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(input);
		expect(mockStore.canWrite).not.toHaveBeenCalled();
		expect(mockStore.write).not.toHaveBeenCalled();
	});

	test("should passthrough output if no store was found", async () => {
		vi.mocked(mockStore.canWrite).mockReturnValue(false);

		const handler = useWriteStore({
			stores: [mockStore],
			passThrough: true,
			write: {
				size: 0,
			},
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayload);
		expect(mockStore.canWrite).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.write).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canWrite).mockReturnValue(false);

		const handler = useWriteStore({
			stores: [mockStore],
			passThrough: false,
			write: {
				size: 0,
			},
		});

		const input = mockPayloadWithReference;

		const output = handler(input, context);

		await expect(output).rejects.toThrow();
		expect(mockStore.canWrite).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.write).not.toHaveBeenCalled();
	});

	test("should store output if size exceeds max size", async () => {
		vi.mocked(mockStore.canWrite).mockReturnValue(true);
		vi.mocked(mockStore.write).mockResolvedValue(mockReference);

		const handler = useWriteStore({
			stores: [mockStore],
			write: {
				size: 0,
			},
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayloadWithReference);
		expect(mockStore.canWrite).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.write).toHaveBeenCalledWith(mockStoreOutput);
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
			vi.mocked(mockStore.canWrite).mockReturnValue(true);
			vi.mocked(mockStore.write).mockResolvedValue(mockReference);

			const handler = useWriteStore({
				stores: [mockStore],
				write: {
					size: 0,
					selector,
				},
			});

			const output = await handler(input, context);

			expect(output).toEqual(result);
			expect(mockStore.canWrite).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.write).toHaveBeenCalledWith(mockStoreOutput);
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
			vi.mocked(mockStore.canWrite).mockReturnValue(true);
			vi.mocked(mockStore.write).mockResolvedValue(mockReference);

			const handler = useWriteStore({
				stores: [mockStore],
				write: {
					size: 0,
					selector,
				},
			});

			const output = await handler(input, context);

			expect(output).toEqual(result);
			expect(mockStore.canWrite).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.write).toHaveBeenCalledWith(mockStoreOutput);
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
			vi.mocked(mockStore.canWrite).mockReturnValue(true);
			vi.mocked(mockStore.write).mockResolvedValue(mockReference);

			const handler = useWriteStore({
				stores: [mockStore],
				write: {
					size: 0,
					selector,
				},
			});

			const output = await handler(input, context);

			expect(output).toEqual(result);
			expect(mockStore.canWrite).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.write).toHaveBeenCalledWith(mockStoreOutput);
		},
	);
});
