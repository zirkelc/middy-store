import middy from "@middy/core";
import { APIGatewayProxyEventV2, Context, Handler } from "aws-lambda";
import { describe, test, expect, vi } from "vitest";
import store, {
	LoadInput,
	MiddlewareOptions,
	Store,
	StoreOutput,
} from "./store.js";
import { before } from "node:test";
import set from "lodash.set";

const context = {} as Context;

const lambdaHandler: Handler = async (input, context) => {
	return input;
};

const useHandler = (options: MiddlewareOptions) =>
	middy().use(store(options)).handler(lambdaHandler);

const mockReference = {
	store: "mock",
};

const mockPayloadWithReference = {
	"@store": mockReference,
};

const mockPayload = {
	foo: "bar",
};

const mockLoadInput: LoadInput = {
	reference: mockReference,
};

const mockStoreInput: StoreOutput = {
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
	typeOf: typeof mockPayload,
};

const mockStore: Store<any, any> = {
	name: "mock",
	canLoad: vi.fn(),
	load: vi.fn(),
	canStore: vi.fn(),
	store: vi.fn(),
};

before(() => {
	vi.resetAllMocks();
});

describe("middleware.before", () => {
	test.each([null, "foo", 42, true, false, () => { }])(
		"should passthrough input if is: %s",
		async (input) => {
			const handler = useHandler({
				stores: [mockStore],
			});

			const output = await handler(input as any, context);

			expect(output).toEqual(input);
			expect(mockStore.canLoad).not.toHaveBeenCalled();
			expect(mockStore.load).not.toHaveBeenCalled();
		},
	);

	test("should passthrough input if no reference", async () => {
		const handler = useHandler({
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

		const handler = useHandler({
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

		const handler = useHandler({
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

		const handler = useHandler({
			stores: [mockStore],
		});

		const input = mockPayloadWithReference;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayload);
		expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
		expect(mockStore.load).toHaveBeenCalledWith(mockLoadInput);
	});

	test.each([{ path: "a" }, { path: "a.b" }])(
		"should load input nested: $path",
		async ({ path }) => {
			vi.mocked(mockStore.canLoad).mockReturnValue(true);
			vi.mocked(mockStore.load).mockResolvedValue(mockPayload);

			const handler = useHandler({
				stores: [mockStore],
			});

			const input = set({}, path, mockPayloadWithReference);

			const output = await handler(input, context);

			expect(output).toEqual(set({}, path, mockPayload));
			expect(mockStore.canLoad).toHaveBeenCalledWith(mockLoadInput);
			expect(mockStore.load).toHaveBeenCalledWith(mockLoadInput);
		},
	);
});

describe("middleware.after", () => {
	test.each([null, "foo", 42, true, false, () => { }])(
		"should passthrough output if is: %s",
		async (input) => {
			const handler = useHandler({
				stores: [mockStore],
			});

			const output = await handler(input as any, context);

			expect(output).toEqual(input);
			expect(mockStore.canStore).not.toHaveBeenCalled();
			expect(mockStore.store).not.toHaveBeenCalled();
		},
	);

	test("should passthrough output if size is too size", async () => {
		const handler = useHandler({
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

		const handler = useHandler({
			stores: [mockStore],
			maxSize: 0,
			passThrough: true,
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayload);
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreInput);
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should throw an error if no store was found", async () => {
		vi.mocked(mockStore.canStore).mockReturnValue(false);

		const handler = useHandler({
			stores: [mockStore],
			maxSize: 0,
			passThrough: false,
		});

		const input = mockPayloadWithReference;

		const output = handler(input, context);

		await expect(output).rejects.toThrow();
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreInput);
		expect(mockStore.store).not.toHaveBeenCalled();
	});

	test("should store output if size exceeds max size", async () => {
		vi.mocked(mockStore.canStore).mockReturnValue(true);
		vi.mocked(mockStore.store).mockResolvedValue(mockReference);

		const handler = useHandler({
			stores: [mockStore],
			maxSize: 0,
		});

		const input = mockPayload;

		const output = await handler(input, context);

		expect(output).toEqual(mockPayloadWithReference);
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreInput);
		expect(mockStore.store).toHaveBeenCalledWith(mockStoreInput);
	});

	test.each([{ path: undefined }, { path: "" }, { path: [] }])(
		"should store output at root with selector: $path",
		async ({ path }) => {
			vi.mocked(mockStore.canStore).mockReturnValue(true);
			vi.mocked(mockStore.store).mockResolvedValue(mockReference);

			const handler = useHandler({
				stores: [mockStore],
				maxSize: 0,
				selector: path,
			});

			const input = mockPayload;

			const output = await handler(input, context);

			expect(output).toEqual(mockPayloadWithReference);
			expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreInput);
			expect(mockStore.store).toHaveBeenCalledWith(mockStoreInput);
		},
	);

	test.each([
		{ path: "a" },
		{ path: "a.b" },
		{ path: ["a"] },
		{ path: ["a", "b"] },
	])("should store output nested with selector: $path", async ({ path }) => {
		vi.mocked(mockStore.canStore).mockReturnValue(true);
		vi.mocked(mockStore.store).mockResolvedValue(mockReference);

		const handler = useHandler({
			stores: [mockStore],
			maxSize: 0,
			selector: path,
		});

		const input = set({}, path, mockPayload);

		const output = await handler(input, context);

		expect(output).toEqual(set({}, path, mockPayloadWithReference));
		expect(mockStore.canStore).toHaveBeenCalledWith(mockStoreInput);
		expect(mockStore.store).toHaveBeenCalledWith(mockStoreInput);
	});
});
