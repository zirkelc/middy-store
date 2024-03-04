import middy from "@middy/core";
import { APIGatewayProxyEventV2, Context, Handler } from "aws-lambda";
import set from "lodash.set";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	LoadInput,
	LoadInputMiddlewareOptions,
	Store,
	StoreOutput,
	StoreOutputMiddlewareOptions,
	loadInput,
	storeOutput,
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

const mockLoadInput: LoadInput<MockInput, MockReference> = {
	input: mockPayloadWithReference as any,
	reference: mockReference,
};

const mockStoreOutput: StoreOutput<typeof mockPayload, typeof mockPayload> = {
	input: mockPayload,
	output: mockPayload,
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
};

const mockStore: Store = {
	name: "mock",
	canLoad: vi.fn(),
	load: vi.fn(),
	canStore: vi.fn(),
	store: vi.fn(),
};

const useLoadInput = <TInput = any>(
	options: LoadInputMiddlewareOptions<TInput>,
) =>
	middy()
		.use(loadInput(options))
		.handler(async (input) => {
			return input;
		});

const useStoreOutput = <TInput = any, TOutput = any>(
	options: StoreOutputMiddlewareOptions<TInput, TOutput>,
) =>
	middy()
		.use(storeOutput(options))
		.handler(async (input) => {
			return input;
		});

beforeAll(() => {
	vi.resetAllMocks();
});

describe("loadInput", () => {
	test.each([null, "foo", 42, true, false, () => {}])(
		"should passthrough input if is: %s",
		async (input) => {
			const handler = useLoadInput({
				stores: [mockStore],
			});

			const output = await handler(input as any, context);

			expect(output).toEqual(input);
			expect(mockStore.canLoad).not.toHaveBeenCalled();
			expect(mockStore.load).not.toHaveBeenCalled();
		},
	);

	test("should passthrough input if no reference", async () => {
		const handler = useLoadInput({
			stores: [mockStore],
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(input);
		expect(mockStore.canLoad).not.toHaveBeenCalled();
		expect(mockStore.load).not.toHaveBeenCalled();
	});

	test("should passthrough input if no store was found", async () => {
		vi.mocked(mockStore.canLoad).mockReturnValue(false);

		const handler = useLoadInput({
			stores: [mockStore],
			passThrough: true,
		});

		const input = mockPayloadWithReference;

		const output = await handler(input, context);

		expect(output).toEqual(input);
		expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
		expect(mockStore.load).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canLoad).mockReturnValue(false);

		const handler = useLoadInput({
			stores: [mockStore],
			passThrough: false,
		});

		const input = mockPayloadWithReference;

		const output = handler(input, context);

		await expect(output).rejects.toThrow();
		expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
		expect(mockStore.load).not.toHaveBeenCalled();
	});

	test("should load input at root", async () => {
		vi.mocked(mockStore.canLoad).mockReturnValue(true);
		vi.mocked(mockStore.load).mockResolvedValue(mockPayload);

		const handler = useLoadInput({
			stores: [mockStore],
		});

		const input = mockPayloadWithReference;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayload);
		expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
		expect(mockStore.load).toHaveBeenCalledWith(mockLoadInput);
	});

	test.each([{ path: "a" }, { path: "a.b" }, { path: "a.b[0].c" }])(
		"should load input nested: $path",
		async ({ path }) => {
			vi.mocked(mockStore.canLoad).mockReturnValue(true);
			vi.mocked(mockStore.load).mockResolvedValue(mockPayload);

			const handler = useLoadInput({
				stores: [mockStore],
			});

			const input = set({}, path, mockPayloadWithReference);

			const output = await handler(input, context);

			expect(output).toEqual(set({}, path, mockPayload));
			expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.load).toHaveBeenCalledWith(mockLoadInput);
		},
	);

	describe("should load input from array", () => {
		test("root", async () => {
			vi.mocked(mockStore.canLoad).mockReturnValue(true);
			vi.mocked(mockStore.load).mockResolvedValue(mockPayload);

			const handler = useLoadInput({
				stores: [mockStore],
			});

			const input = [mockPayloadWithReference, mockPayloadWithReference];

			const output = await handler(input, context);

			expect(output).toEqual([mockPayload, mockPayload]);
			expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.load).toHaveBeenCalledWith(mockLoadInput);
		});

		test("single property", async () => {
			vi.mocked(mockStore.canLoad).mockReturnValue(true);
			vi.mocked(mockStore.load).mockResolvedValue(mockPayload);

			const handler = useLoadInput({
				stores: [mockStore],
			});

			const input = {
				a: [mockPayloadWithReference, mockPayloadWithReference],
			};

			const output = await handler(input, context);

			expect(output).toEqual({ a: [mockPayload, mockPayload] });
			expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.load).toHaveBeenCalledWith(mockLoadInput);
		});

		test("multiple properties", async () => {
			vi.mocked(mockStore.canLoad).mockReturnValue(true);
			vi.mocked(mockStore.load).mockResolvedValue(mockPayload);

			const handler = useLoadInput({
				stores: [mockStore],
			});

			const input = {
				a: [mockPayloadWithReference],
				b: mockPayloadWithReference,
			};

			const output = await handler(input, context);

			expect(output).toEqual({ a: [mockPayload], b: mockPayload });
			expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.load).toHaveBeenCalledWith(mockLoadInput);
		});
	});
});

describe("storeOutput", () => {
	test.each([null, "foo", 42, true, false, () => {}])(
		"should passthrough output if is: %s",
		async (input) => {
			const handler = useStoreOutput({
				stores: [mockStore],
			});

			const output = await handler(input as any, context);

			expect(output).toEqual(input);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		},
	);

	test("should passthrough output if size is too size", async () => {
		const handler = useStoreOutput({
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

		const handler = useStoreOutput({
			stores: [mockStore],
			maxSize: 0,
			passThrough: true,
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayload);
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canStore).mockReturnValue(false);

		const handler = useStoreOutput({
			stores: [mockStore],
			maxSize: 0,
			passThrough: false,
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

		const handler = useStoreOutput({
			stores: [mockStore],
			maxSize: 0,
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayloadWithReference);
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
		expect(mockStore.store).toHaveBeenCalledWith(mockStoreOutput);
	});

	test.each([
		{ selector: undefined },
		{ selector: "" },
		// { selector: [] }
	])(
		"should store output at root with selector: $selector",
		async ({ selector }) => {
			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(mockReference);

			const handler = useStoreOutput({
				stores: [mockStore],
				maxSize: 0,
				selector,
			});

			const input = mockPayload;

			const output = await handler(input, context);

			expect(output).toEqual(mockPayloadWithReference);
			expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.store).toHaveBeenCalledWith(mockStoreOutput);
		},
	);

	test.each([
		{ selector: "a" },
		{ selector: "a.b" },
		// { selector: ["a"] },
		// { selector: ["a", "b"] },
	])(
		"should store output nested with selector: $selector",
		async ({ selector }) => {
			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(mockReference);

			const handler = useStoreOutput({
				stores: [mockStore],
				maxSize: 0,
				selector,
			});

			const input = set({}, selector, mockPayload);

			const output = await handler(input, context);

			expect(output).toEqual(set({}, selector, mockPayloadWithReference));
			expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreOutput);
			expect(mockStore.store).toHaveBeenCalledWith(mockStoreOutput);
		},
	);
});
