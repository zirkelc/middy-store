import { ReadableStream } from "node:stream/web";
import { type GetObjectCommandOutput, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { type S3ObjectReference, S3Store } from "../src/store.js";

const region = "us-east-1";
const config = { region };
const bucket = "bucket";
const key = "key";

const arnReference = `arn:aws:s3:::${bucket}/${key}`;

const urlReference = `s3://${bucket}/${key}`;

const urlRegionalReference = `s3://s3.${config.region}.amazonaws.com/${bucket}/${key}`;

const objectReference: S3ObjectReference = {
	store: "s3",
	bucket,
	key,
};

beforeAll(() => {
	vi.resetAllMocks();
});

describe("S3Store.canLoad", () => {
	test("should check reference", async () => {
		const s3Store = new S3Store({ config, bucket, key });

		expect(s3Store.canLoad({ reference: arnReference })).toBe(true);
		expect(s3Store.canLoad({ reference: objectReference })).toBe(true);
		expect(s3Store.canLoad({ reference: urlReference })).toBe(true);
		expect(s3Store.canLoad({ reference: urlRegionalReference })).toBe(true);

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

	describe("should deserialize content by type", () => {
		const s3Store = new S3Store({ config, bucket, key });
		test("text/plain", async () => {
			mockClient("foo", "text/plain");
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual(
				"foo",
			);

			mockClient("foo", "text/plain;charset=utf-8");
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual(
				"foo",
			);
		});

		test("application/json", async () => {
			mockClient(JSON.stringify({ foo: "bar" }), "application/json");
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual({
				foo: "bar",
			});

			mockClient(
				JSON.stringify({ foo: "bar" }),
				"application/json;charset=utf-8",
			);
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual({
				foo: "bar",
			});
		});

		test("unsupported type", async () => {
			mockClient("foo", "unsupported/type");
			await expect(async () =>
				s3Store.load({ reference: urlReference }),
			).rejects.toThrowError();
		});
	});

	test(`should get object by reference`, async () => {
		const s3Store = new S3Store({ config, bucket, key });
		const spy = mockClient(JSON.stringify({ foo: "bar" }), "application/json");

		spy.mockClear();
		await s3Store.load({ reference: arnReference });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
		});

		spy.mockClear();
		await s3Store.load({ reference: objectReference });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
		});

		spy.mockClear();
		await s3Store.load({ reference: urlReference });
		expect(spy.mock.calls[0][0].input).toEqual({
			Bucket: "bucket",
			Key: "key",
		});

		spy.mockClear();
		await s3Store.load({ reference: urlRegionalReference });
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

	test("should put object and return reference", async () => {
		const byteSize = 1_000;
		const payload = { foo: "bar" };

		await expect(
			new S3Store({ config, bucket, key, format: "arn" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual(`arn:aws:s3:::${bucket}/${key}`);

		await expect(
			new S3Store({ config, bucket, key, format: "object" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual({ store: "s3", bucket, key, region });

		await expect(
			new S3Store({ config, bucket, key, format: "url-s3-global-path" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual(`s3://${bucket}/${key}`);

		await expect(
			new S3Store({ config, bucket, key, format: "url-s3-region-path" }).store({
				byteSize,
				payload,
			}),
		).resolves.toEqual(
			`s3://s3.${config.region}.amazonaws.com/${bucket}/${key}`,
		);
	});
});
