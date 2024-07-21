import { ReadableStream } from "node:stream/web";
import {
	type GetObjectCommandOutput,
	type GetObjectRequest,
	type PutObjectRequest,
	S3Client,
} from "@aws-sdk/client-s3";
import type { ReadInput, WriteOutput } from "middy-store";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	type KeyMaker,
	type S3ObjectReference,
	type S3Reference,
	type S3ReferenceFormat,
	S3Store,
} from "../src/store.js";

const bucket = "bucket";
const key = "key";
const region = "eu-west-1";

const mockArnReference = `arn:aws:s3:::${bucket}/${key}`;

const mockUrlReference = `s3://${bucket}/${key}`;

const mockUrlReferenceWithRegion = `s3://https://${bucket}.s3.${region}.amazonaws.com/${key}`;

const mockObjectReference: S3ObjectReference = {
	store: "s3",
	bucket,
	key,
};

const mockObjectReferenceWithRegion: S3ObjectReference = {
	...mockObjectReference,
	region,
};

const mockPayloadWithReference = {
	"@middy-store": mockObjectReference,
};

const mockPayload = {
	foo: "bar",
};

const mockLoadInput: ReadInput<typeof mockPayloadWithReference, S3Reference> = {
	input: mockPayloadWithReference,
	reference: mockObjectReference,
};

const mockStoreOutput: WriteOutput<typeof mockPayload, typeof mockPayload> = {
	input: mockPayload,
	output: mockPayload,
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
	index: 0,
};

beforeAll(() => {
	vi.resetAllMocks();
});

describe("S3Store.canLoad", () => {
	const s3Store = new S3Store({ bucket, key });

	test("should return true for payload", async () => {
		const input = mockLoadInput;

		const output = s3Store.canRead(input);

		expect(output).toBe(true);
	});

	test("should return true if reference.bucket matches options.bucket", async () => {
		const bucket = "bucket";

		const input = {
			...mockLoadInput,
			reference: { ...mockObjectReference, bucket },
		};

		const output = s3Store.canRead(input);

		expect(output).toBe(true);
	});

	test("should return false if reference.bucket doesn't match options.bucket", async () => {
		const bucket = "other-bucket";

		const input = {
			...mockLoadInput,
			reference: { ...mockObjectReference, bucket },
		};

		const output = s3Store.canRead(input);

		expect(output).toBe(false);
	});

	test.each(["foo"])(
		"should return true for reference.key: %s",
		async (key) => {
			const input = {
				...mockLoadInput,
				reference: { ...mockObjectReference, key },
			};

			const output = s3Store.canRead(input);

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
		const output = s3Store.canRead(input as any);

		expect(output).toBe(false);
	});
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

		const output = await s3Store.read(input);

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

		const output = await s3Store.read(input);

		expect(output).toEqual(payload);
		expect(spy).toHaveBeenCalled();

		const request = spy.mock.calls[0][0].input as GetObjectRequest;
		expect(request).toEqual({
			Bucket: "bucket",
			Key: "key",
		});
	});

	test(`should load from ARN reference`, async () => {
		const payload = mockPayload;
		const spy = mockClient(JSON.stringify(payload), "application/json");
		const input = { ...mockLoadInput, reference: mockArnReference };

		const output = await s3Store.read(input);

		expect(output).toEqual(payload);
	});

	test(`should load from URI reference`, async () => {
		const payload = mockPayload;
		const spy = mockClient(JSON.stringify(payload), "application/json");
		const input = { ...mockLoadInput, reference: mockUrlReference };

		const output = await s3Store.read(input);

		expect(output).toEqual(payload);
	});

	test(`should load from object reference`, async () => {
		const payload = mockPayload;
		const spy = mockClient(JSON.stringify(payload), "application/json");
		const input = { ...mockLoadInput, reference: mockObjectReference };

		const output = await s3Store.read(input);

		expect(output).toEqual(payload);
	});

	test("should throw an error for unsupported types", async () => {
		const payload = undefined;
		const spy = mockClient(JSON.stringify(payload), "application/random");
		const input = mockLoadInput;

		const output = s3Store.read(input);

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

	test.each(["foo", { foo: "bar" }, 42, true, false])(
		"should return true for payload type: %s",
		async (payload) => {
			const input = { ...mockStoreOutput, payload };
			const output = s3Store.canWrite(input);
			expect(output).toBe(true);
		},
	);

	test.each([null, undefined])(
		"should return false for payload type: %s",
		async (payload) => {
			const input = { ...mockStoreOutput, payload };
			const output = s3Store.canWrite(input);
			expect(output).toBe(false);
		},
	);

	test.each([0, 1_000, 1_000_000, 1_000_000_000, Number.MAX_SAFE_INTEGER])(
		"should return true for options.maxSize > payload size: %s",
		async (byteSize) => {
			const input = { ...mockStoreOutput, byteSize };
			const output = s3Store.canWrite(input);
			expect(output).toBe(true);
		},
	);

	test.each([0, 1_000, 1_000_000, 1_000_000_000, Number.MAX_SAFE_INTEGER])(
		"should return false for options.maxSize < payload size: %s",
		async (byteSize) => {
			const s3Store = new S3Store({ bucket, key, maxSize: 0 });

			const input = { ...mockStoreOutput, byteSize };
			const output = s3Store.canWrite(input);
			expect(output).toBe(false);
		},
	);

	test.each([null, undefined, "", 42, true, false, () => {}, {}])(
		"should throw an error for invalid options.bucket: %s",
		async (bucket) => {
			const s3Store = new S3Store({ bucket: bucket as any, key });

			const input = mockStoreOutput;

			expect(() => s3Store.canWrite(input)).toThrowError();
		},
	);

	test.each([null, undefined, "", 42, true, false, () => {}, {}])(
		"should throw an error for invalid options.key: %s",
		async (key) => {
			const s3Store = new S3Store({ bucket, key: () => key as any });

			const input = mockStoreOutput;

			expect(() => s3Store.canWrite(input)).toThrowError();
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
		const input = { ...mockStoreOutput, payload };

		const output = await s3Store.write(input);

		expect(output).toEqual(mockUrlReference);
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
		const input = { ...mockStoreOutput, payload };

		const output = await s3Store.write(input);

		expect(output).toEqual(mockUrlReference);
		expect(spy).toHaveBeenCalled();

		const request = spy.mock.calls[0][0].input as PutObjectRequest;
		expect(request).toEqual({
			Bucket: "bucket",
			Key: "key",
			Body: '{"foo":"bar"}',
			ContentType: "application/json",
		});
	});

	test.each([undefined])(
		"should throw an error for unsupported types: %s",
		async (payload) => {
			const spy = mockClient();
			const input = { ...mockStoreOutput, payload };

			const output = s3Store.write(input);

			await expect(output).rejects.toThrowError();
			expect(spy).not.toHaveBeenCalled();
		},
	);

	test.each<{
		key: KeyMaker<typeof mockPayload, typeof mockPayload>;
		result: string;
	}>([
		{ key: "foo", result: "foo" },
		{ key: () => "foo", result: "foo" },
		{
			key: ({ output }) => `output-${output.foo}`,
			result: `output-${mockStoreOutput.output.foo}`,
		},
		{
			key: ({ input }) => `input-${input.foo}`,
			result: `input-${mockStoreOutput.input.foo}`,
		},
		{
			key: ({ byteSize }) => `byteSize-${byteSize}`,
			result: `byteSize-${mockStoreOutput.byteSize}`,
		},
		{
			key: ({ index }) => `index-${index}`,
			result: `index-${mockStoreOutput.index}`,
		},
	])("should generate object key: $result", async ({ key, result }) => {
		const spy = mockClient();
		const s3Store = new S3Store({ bucket, key, format: "object" });
		const input = mockStoreOutput;

		const output = await s3Store.write(input);

		expect(spy).toHaveBeenCalled();

		const s3ObjectReference = output as S3ObjectReference;
		expect(s3ObjectReference.key).toEqual(result);
	});

	test.each<{
		format: S3ReferenceFormat["type"];
		region?: string;
		reference: S3Reference;
	}>([
		{ format: "arn", reference: mockArnReference },
		{ format: "arn", region, reference: mockArnReference },
		{ format: "url", reference: mockUrlReference },
		{ format: "url", region, reference: mockUrlReference },
		{ format: "object", reference: mockObjectReference },
		{ format: "object", region, reference: mockObjectReferenceWithRegion },
	])(
		`should return reference as $format`,
		async ({ format, region, reference }) => {
			const spy = mockClient();
			const s3Store = new S3Store({ bucket, key, region, format });
			const input = mockStoreOutput;

			const output = await s3Store.write(input);

			expect(spy).toHaveBeenCalled();
			expect(output).toEqual(reference);
		},
	);
});