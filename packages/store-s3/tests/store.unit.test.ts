import { randomUUID } from "node:crypto";
import { ReadableStream } from "node:stream/web";
import {
	type GetObjectCommandOutput,
	type GetObjectRequest,
	type PutObjectRequest,
	S3Client,
} from "@aws-sdk/client-s3";
import type { LoadArgs, StoreArgs } from "middy-store";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	type S3ObjectReference,
	type S3Reference,
	type S3ReferenceFormat,
	S3Store,
	type S3StoreOptions,
} from "../src/store.js";

const config = { region: "us-east-1" };
const bucket = "bucket";
const key = "key";

const mockArnReference = `arn:aws:s3:::${bucket}/${key}`;

const mockUrlReference = `s3://${bucket}/${key}`;

const mockUrlReferenceWithRegion = `s3://https://${bucket}.s3.${config.region}.amazonaws.com/${key}`;

const mockObjectReference: S3ObjectReference = {
	store: "s3",
	bucket,
	key,
};

const mockObjectReferenceWithRegion: S3ObjectReference = {
	...mockObjectReference,
	region: config.region,
};

const mockPayloadWithReference = {
	"@middy-store": mockObjectReference,
};

const mockPayload = {
	foo: "bar",
};

const mockLoadInput: LoadArgs<S3Reference> = {
	reference: mockObjectReference,
};

const mockStoreOutput: StoreArgs<typeof mockPayload> = {
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
};

beforeAll(() => {
	vi.resetAllMocks();
});

describe("S3Store.constructor", () => {
	test("should resolve options", async () => {
		// config
		expect(() => new S3Store({ config, bucket })).toBeDefined();
		expect(() => new S3Store({ config: () => config, bucket })).toBeDefined();

		// bucket
		expect(() => new S3Store({ config, bucket })).toBeDefined();
		expect(
			() => new S3Store({ config, bucket: () => randomUUID() }),
		).toBeDefined();

		// key
		expect(() => new S3Store({ config, bucket, key })).toBeDefined();
		expect(
			() => new S3Store({ config, bucket, key: () => randomUUID() }),
		).toBeDefined();

		// config error
		expect(() => new S3Store({ config: {}, bucket })).toThrow();
		expect(() => new S3Store({ config: () => ({}), bucket })).toThrow();
		expect(() => new S3Store({ config: null as any, bucket })).toThrow();
		expect(() => new S3Store({ config: () => null as any, bucket })).toThrow();

		// bucket error
		expect(() => new S3Store({ config, bucket: "" })).toThrow();
		expect(() => new S3Store({ config, bucket: () => "" })).toThrow();
		expect(() => new S3Store({ config, bucket: null as any })).toThrow();
		expect(() => new S3Store({ config, bucket: () => null as any })).toThrow();
	});
});
describe("S3Store.canLoad", () => {
	test("should check reference", async () => {
		const s3Store = new S3Store({ config, bucket, key });

		expect(s3Store.canLoad({ reference: mockArnReference })).toBe(true);
		expect(s3Store.canLoad({ reference: mockObjectReference })).toBe(true);
		expect(s3Store.canLoad({ reference: mockUrlReference })).toBe(true);
		expect(s3Store.canLoad({ reference: mockUrlReferenceWithRegion })).toBe(
			true,
		);

		expect(s3Store.canLoad(null as any)).toBe(false);
		expect(s3Store.canLoad(undefined as any)).toBe(false);
		expect(s3Store.canLoad("" as any)).toBe(false);
		expect(s3Store.canLoad({} as any)).toBe(false);
		expect(s3Store.canLoad({ reference: null })).toBe(false);
		expect(s3Store.canLoad({ reference: undefined })).toBe(false);
		expect(s3Store.canLoad({ reference: "" })).toBe(false);
		expect(s3Store.canLoad({ reference: {} })).toBe(false);
		expect(s3Store.canLoad({ reference: { store: null } })).toBe(false);
		expect(s3Store.canLoad({ reference: { store: "" } })).toBe(false);
		expect(s3Store.canLoad({ reference: { store: "foo" } })).toBe(false);
	});

	test("should check if bucket match", async () => {
		const s3Store = new S3Store({ config, bucket, key });
		const other = "other-bucket";

		expect(s3Store.canLoad({ reference: `arn:aws:s3:::${other}/${key}` })).toBe(
			false,
		);
		expect(
			s3Store.canLoad({ reference: { ...mockObjectReference, bucket: other } }),
		).toBe(false);
		expect(s3Store.canLoad({ reference: `s3://${other}/${key}` })).toBe(false);
		expect(
			s3Store.canLoad({
				reference: `s3://https://${other}.s3.${config.region}.amazonaws.com/${key}`,
			}),
		).toBe(false);
	});
});

describe("S3Store.load", () => {
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

	test("should deserialize content by type", async () => {
		const s3Store = new S3Store({ config, bucket, key });

		mockClient("foo", "text/plain");
		await expect(() =>
			s3Store.load({ reference: mockUrlReference }),
		).resolves.toEqual("foo");

		mockClient(JSON.stringify({ foo: "bar" }), "application/json");
		await expect(() =>
			s3Store.load({ reference: mockUrlReference }),
		).resolves.toEqual({
			foo: "bar",
		});

		mockClient("foo", "unsupported/type");
		await expect(() =>
			s3Store.load({ reference: mockUrlReference }),
		).rejects.toThrowError();
	});

	test(`should get object by reference`, async () => {
		const s3Store = new S3Store({ config, bucket, key });
		const spy = mockClient(JSON.stringify({ foo: "bar" }), "application/json");

		spy.mockClear();
		await s3Store.load({ reference: mockArnReference });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
		});

		spy.mockClear();
		await s3Store.load({ reference: mockObjectReference });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
		});

		spy.mockClear();
		await s3Store.load({ reference: mockUrlReference });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
		});

		spy.mockClear();
		await s3Store.load({ reference: mockUrlReferenceWithRegion });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
		});
	});
});

describe("S3Store.canStore", () => {
	test("should check payload", async () => {
		const s3Store = new S3Store({ config, bucket, key });
		const byteSize = 1_000;

		expect(s3Store.canStore({ byteSize, payload: {} })).toBe(true);
		expect(s3Store.canStore({ byteSize, payload: [] })).toBe(true);
		expect(s3Store.canStore({ byteSize, payload: { foo: "bar" } })).toBe(true);
		expect(s3Store.canStore({ byteSize, payload: "foo" })).toBe(true);
		expect(s3Store.canStore({ byteSize, payload: 42 })).toBe(true);
		expect(s3Store.canStore({ byteSize, payload: true })).toBe(true);
		expect(s3Store.canStore({ byteSize, payload: false })).toBe(true);

		expect(s3Store.canStore({ byteSize, payload: null })).toBe(false);
		expect(s3Store.canStore({ byteSize, payload: undefined })).toBe(false);
	});

	test("should check byte size", async () => {
		const s3Store1 = new S3Store({ config, bucket, key });
		const payload = { foo: "bar" };

		expect(s3Store1.canStore({ byteSize: 0, payload })).toBe(true);
		expect(s3Store1.canStore({ byteSize: 1_000, payload })).toBe(true);
		expect(s3Store1.canStore({ byteSize: 1_000_000, payload })).toBe(true);
		expect(s3Store1.canStore({ byteSize: 1_000_000_000, payload })).toBe(true);
		expect(
			s3Store1.canStore({ byteSize: Number.MAX_SAFE_INTEGER, payload }),
		).toBe(true);

		const s3Store2 = new S3Store({ config, bucket, key, maxSize: 0 });
		expect(s3Store2.canStore({ byteSize: 0, payload })).toBe(false);
		expect(s3Store2.canStore({ byteSize: 1_000, payload })).toBe(false);
		expect(s3Store2.canStore({ byteSize: 1_000_000, payload })).toBe(false);
		expect(s3Store2.canStore({ byteSize: 1_000_000_000, payload })).toBe(false);
		expect(
			s3Store2.canStore({ byteSize: Number.MAX_SAFE_INTEGER, payload }),
		).toBe(false);
	});
});

describe("S3Store.store", () => {
	const s3Store = new S3Store({ config, bucket, key });

	const mockClient = () =>
		vi
			.spyOn(S3Client.prototype, "send")
			.mockImplementation(() => Promise.resolve({}));

	test("should serialize content by type", async () => {
		const s3Store = new S3Store({ config, bucket, key });
		const byteSize = 1_000;

		await expect(() =>
			s3Store.store({ byteSize, payload: "foo" }),
		).resolves.toEqual("foo");

		await expect(() =>
			s3Store.store({ byteSize, payload: { foo: "bar" } }),
		).resolves.toEqual({
			foo: "bar",
		});

		await expect(() =>
			s3Store.store({ byteSize, payload: undefined }),
		).rejects.toThrowError();
	});

	test("should put object and return reference", async () => {
		const spy = mockClient();
		const byteSize = 1_000;

		spy.mockClear();
		await s3Store.store({ byteSize, payload: "foo" });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
			Body: "foo",
			ContentType: "text/plain",
		});

		spy.mockClear();
		await s3Store.store({ byteSize, payload: { foo: "bar" } });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
			Body: '{"foo":"bar"}',
			ContentType: "application/json",
		});

		await expect(() =>
			s3Store.store({ byteSize, payload: undefined }),
		).rejects.toThrowError();
	});

	test("should format reference", async () => {
		const s3Store = new S3Store({ config, bucket });
		const byteSize = 1_000;
		const payload = { foo: "bar" };

		await expect(() =>
			new S3Store({ config, bucket, key, format: "arn" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual(mockArnReference);

		await expect(() =>
			new S3Store({ config, bucket, key, format: "object" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual(mockObjectReference);

		await expect(() =>
			new S3Store({ config, bucket, key, format: "url-s3-global-path" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual(mockUrlReference);

		await expect(() =>
			new S3Store({ config, bucket, key, format: "url-s3-region-path" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual(mockUrlReferenceWithRegion);
	});
});
