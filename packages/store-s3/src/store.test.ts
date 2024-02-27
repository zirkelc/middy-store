import middy from "@middy/core";
import { Context, Handler } from "aws-lambda";
import { before } from "node:test";
import { describe, expect, test, vi } from "vitest";
import { S3Store, S3StoreReference } from "./store.js";
import { LoadInput, StoreInput } from "middy-input-output-store";
import {
	GetObjectOutput,
	GetObjectCommandOutput,
	PutObjectRequest,
	S3Client,
	GetObjectRequest,
	GetObjectCommandInput,
} from "@aws-sdk/client-s3";
import { ReadableStream } from "stream/web";

const bucket = "bucket";
const key = "key";
const uri = "s3://bucket/key";

const mockReference: S3StoreReference = {
	store: "s3",
	bucket,
	key,
	uri,
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

const mockStoreInput: StoreInput = {
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
	typeOf: typeof mockPayload,
};

before(() => {
	vi.resetAllMocks();
});

describe("S3Store.canLoad", () => {
	const s3Store = new S3Store({ bucket, key });

	test("should return true for payload", async () => {
		const input = mockLoadInput;

		const output = s3Store.canLoad(input);

		expect(output).toBe(true);
	});

	test.each(["foo"])(
		"should return true for reference.bucket: %s",
		async (bucket) => {
			const input = { reference: { ...mockReference, bucket } };

			const output = s3Store.canLoad(input);

			expect(output).toBe(true);
		},
	);

	test.each(["foo"])(
		"should return true for reference.key: %s",
		async (key) => {
			const input = { reference: { ...mockReference, key } };

			const output = s3Store.canLoad(input);

			expect(output).toBe(true);
		},
	);

	test.each([
		{ reference: null },
		{ reference: undefined },
		{ reference: "" },
		{ reference: {} },
		{
			reference: {
				store: null,
			},
		},
		{
			reference: {
				store: "",
			},
		},
		{
			reference: {
				store: "foo",
			},
		},
	])("should return false for reference: %s", async (input) => {
		const output = s3Store.canLoad(input as any);

		expect(output).toBe(false);
	});

	test.each([null, undefined, "", 42, true, false, () => {}, {}])(
		"should throw an error for invalid reference.bucket: %s",
		async (bucket) => {
			const input = { reference: { ...mockReference, bucket } };

			expect(() => s3Store.canLoad(input as any)).toThrowError();
		},
	);

	test.each([null, undefined, "", 42, true, false, () => {}, {}])(
		"should throw an error for invalid reference.key: %s",
		async (key) => {
			const input = { reference: { ...mockReference, key } };

			expect(() => s3Store.canLoad(input as any)).toThrowError();
		},
	);
});

describe("S3Store.load", () => {
	const s3Store = new S3Store({ bucket, key });

	const mockClient = (body: string, contentType: string) =>
		vi.spyOn(S3Client.prototype, "send").mockImplementation((input) =>
			Promise.resolve<GetObjectCommandOutput>({
				$metadata: {},
				ContentType: contentType,
				Body: {
					transformToByteArray: () =>
						Promise.resolve(Uint8Array.from(Buffer.from(body))),
					transformToString: () => Promise.resolve(body),
					transformToWebStream: () => Promise.resolve(new ReadableStream()),
				} as any,
			}),
		);

	test("should load string payload", async () => {
		const payload = "foo";
		const spy = mockClient(payload, "text/plain");
		const input = mockLoadInput;

		const output = await s3Store.load(input);

		expect(output).toEqual(payload);
		expect(spy).toHaveBeenCalled();

		const request = spy.mock.calls[0][0].input as GetObjectRequest;
		expect(request).toEqual({
			Bucket: "bucket",
			Key: "key",
		});
	});

	test("should load object payload", async () => {
		const payload = mockPayload;
		const spy = mockClient(JSON.stringify(payload), "application/json");
		const input = mockLoadInput;

		const output = await s3Store.load(input);

		expect(output).toEqual(payload);
		expect(spy).toHaveBeenCalled();

		const request = spy.mock.calls[0][0].input as GetObjectRequest;
		expect(request).toEqual({
			Bucket: "bucket",
			Key: "key",
		});
	});

	test("should throw an error for unsupported types", async () => {
		const payload = undefined;
		const spy = mockClient(JSON.stringify(payload), "application/random");
		const input = mockLoadInput;

		const output = s3Store.load(input);

		await expect(output).rejects.toThrowError();
		expect(spy).toHaveBeenCalled();

		const request = spy.mock.calls[0][0].input as GetObjectRequest;
		expect(request).toEqual({
			Bucket: "bucket",
			Key: "key",
		});
	});
});

describe("S3Store.canStore", () => {
	const s3Store = new S3Store({ bucket, key });

	test.each(["foo", { foo: "bar" }])(
		"should return true for payload type: %s",
		async (payload) => {
			const input = { ...mockStoreInput, payload, typeOf: typeof payload };
			const output = s3Store.canStore(input);
			expect(output).toBe(true);
		},
	);

	test.each([null, undefined, 42, true, false, () => {}])(
		"should return false for payload type: %s",
		async (payload) => {
			const input = { ...mockStoreInput, payload, typeOf: typeof payload };
			const output = s3Store.canStore(input);
			expect(output).toBe(false);
		},
	);

	test.each([0, 1_000, 1_000_000, 1_000_000_000, Number.MAX_SAFE_INTEGER])(
		"should return true for options.maxSize > payload size: %s",
		async (byteSize) => {
			const input = { ...mockStoreInput, byteSize };
			const output = s3Store.canStore(input);
			expect(output).toBe(true);
		},
	);

	test.each([0, 1_000, 1_000_000, 1_000_000_000, Number.MAX_SAFE_INTEGER])(
		"should return false for options.maxSize < payload size: %s",
		async (byteSize) => {
			const s3Store = new S3Store({ bucket, key, maxSize: 0 });

			const input = { ...mockStoreInput, byteSize };
			const output = s3Store.canStore(input);
			expect(output).toBe(false);
		},
	);

	test.each([null, undefined, "", 42, true, false, () => {}, {}])(
		"should throw an error for invalid options.bucket: %s",
		async (bucket) => {
			const s3Store = new S3Store({ bucket: bucket as any, key });

			const input = mockStoreInput;

			expect(() => s3Store.canStore(input)).toThrowError();
		},
	);

	test.each([null, undefined, "", 42, true, false, () => {}, {}])(
		"should throw an error for invalid options.key: %s",
		async (key) => {
			const s3Store = new S3Store({ bucket, key: key as any });

			const input = mockStoreInput;

			expect(() => s3Store.canStore(input)).toThrowError();
		},
	);
});

describe("S3Store.store", () => {
	const s3Store = new S3Store({ bucket, key });

	const mockClient = () =>
		vi
			.spyOn(S3Client.prototype, "send")
			.mockImplementation(() => Promise.resolve({}));

	test("should store string payload", async () => {
		const spy = mockClient();
		const payload = "foo";
		const input = { ...mockStoreInput, payload, typeOf: typeof payload };

		const output = await s3Store.store(input);

		expect(output).toEqual(mockReference);
		expect(spy).toHaveBeenCalled();

		const request = spy.mock.calls[0][0].input as PutObjectRequest;
		expect(request).toEqual({
			Bucket: "bucket",
			Key: "key",
			Body: "foo",
			ContentType: "text/plain",
		});
	});

	test("should store object payload", async () => {
		const spy = mockClient();
		const payload = { foo: "bar" };
		const input = { ...mockStoreInput, payload, typeOf: typeof payload };

		const output = await s3Store.store(input);

		expect(output).toEqual(mockReference);
		expect(spy).toHaveBeenCalled();

		const request = spy.mock.calls[0][0].input as PutObjectRequest;
		expect(request).toEqual({
			Bucket: "bucket",
			Key: "key",
			Body: '{"foo":"bar"}',
			ContentType: "application/json",
		});
	});

	test("should throw an error for unsupported types", async () => {
		const spy = mockClient();
		const payload = undefined;
		const input = { ...mockStoreInput, payload, typeOf: typeof payload };

		const output = s3Store.store(input);

		await expect(output).rejects.toThrowError();
		expect(spy).not.toHaveBeenCalled();
	});
});
