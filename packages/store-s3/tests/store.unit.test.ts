import { ReadableStream } from "node:stream/web";
import {
	DeleteObjectCommand,
	type GetObjectCommandOutput,
	S3Client,
} from "@aws-sdk/client-s3";
import {
	type MockInstance,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
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

const presignedUrlReference = `https://${bucket}.s3.${region}.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20230101%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20230101T000000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=example-signature`;

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
		expect(s3Store.canLoad({ reference: presignedUrlReference })).toBe(true);

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

	describe("deserialize content by type", () => {
		const s3Store = new S3Store({ config, bucket, key });

		test("text/plain", async () => {
			mockClient("foo", "text/plain");
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual(
				"foo",
			);
		});

		test("text/plain; charset=utf-8", async () => {
			mockClient("foo", "text/plain; charset=utf-8");
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual(
				"foo",
			);
		});

		test("application/json", async () => {
			mockClient(JSON.stringify({ foo: "bar" }), "application/json");
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual({
				foo: "bar",
			});
		});

		test("application/json; charset=utf-8", async () => {
			mockClient(
				JSON.stringify({ foo: "bar" }),
				"application/json; charset=utf-8",
			);
			await expect(s3Store.load({ reference: urlReference })).resolves.toEqual({
				foo: "bar",
			});
		});

		test("should throw if content type is unsupported", async () => {
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

	test("should load from presigned URL", async () => {
		const s3Store = new S3Store({ config, bucket, key });
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			headers: {
				get: vi.fn().mockReturnValue("application/json"),
			},
			text: vi.fn().mockResolvedValue(JSON.stringify({ foo: "bar" })),
		});

		// Mock global fetch
		vi.stubGlobal("fetch", mockFetch);

		const result = await s3Store.load({ reference: presignedUrlReference });

		expect(result).toEqual({ foo: "bar" });
		expect(mockFetch).toHaveBeenCalledWith(presignedUrlReference);

		vi.unstubAllGlobals();
	});

	test("should handle presigned URL fetch error", async () => {
		const s3Store = new S3Store({ config, bucket, key });
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			statusText: "Forbidden",
		});

		vi.stubGlobal("fetch", mockFetch);

		await expect(
			s3Store.load({ reference: presignedUrlReference }),
		).rejects.toThrowError("Failed to fetch presigned URL: 403 Forbidden");

		vi.unstubAllGlobals();
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
	const mockClient = () =>
		vi
			.spyOn(S3Client.prototype, "send")
			.mockImplementation(() => Promise.resolve({}));

	describe("build s3 key", () => {
		const byteSize = 1_000;
		const payload = { foo: "bar" };

		test("should use static key", async () => {
			await expect(
				new S3Store<typeof payload>({
					config,
					bucket,
					key: "foo",
				}).store({
					byteSize,
					payload,
				}),
			).resolves.toEqual(`s3://bucket/foo`);
		});

		test("should default to randomUUID", async () => {
			await expect(
				new S3Store<typeof payload>({
					config,
					bucket,
					key: undefined,
				}).store({
					byteSize,
					payload,
				}),
			).resolves.toMatch(/^s3:\/\/bucket\/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/);
		});

		test("should build key from payload", async () => {
			await expect(
				new S3Store<typeof payload>({
					config,
					bucket,
					key: ({ payload }) => Object.keys(payload).join("/"),
				}).store({
					byteSize,
					payload,
				}),
			).resolves.toEqual(`s3://bucket/foo`);
		});

		test("should throw if key is invalid", async () => {
			await expect(() =>
				new S3Store<typeof payload>({
					config,
					bucket,
					key: "",
				}).store({
					byteSize,
					payload,
				}),
			).rejects.toThrowError();

			await expect(() =>
				new S3Store<typeof payload>({
					config,
					bucket,
					key: ({ payload }) => "",
				}).store({
					byteSize,
					payload,
				}),
			).rejects.toThrowError();

			await expect(() =>
				new S3Store<typeof payload>({
					config,
					bucket,
					key: ({ payload }) => null as any,
				}).store({
					byteSize,
					payload,
				}),
			).rejects.toThrowError();

			await expect(() =>
				new S3Store<typeof payload>({
					config,
					bucket,
					key: ({ payload }) => undefined as any,
				}).store({
					byteSize,
					payload,
				}),
			).rejects.toThrowError();
		});
	});

	describe("serialize content by type", () => {
		const s3Store = new S3Store({ config, bucket, key });
		const byteSize = 1_000;
		let spy: MockInstance;

		beforeEach(() => {
			spy = mockClient();
		});

		test("text/plain", async () => {
			await s3Store.store({ byteSize, payload: "foo" });
			expect(spy.mock.calls[0][0].input).toEqual({
				Bucket: "bucket",
				Key: "key",
				Body: "foo",
				ContentType: "text/plain",
			});
		});

		test("application/json", async () => {
			await s3Store.store({ byteSize, payload: { foo: "bar" } });
			expect(spy.mock.calls[0][0].input).toEqual({
				Bucket: "bucket",
				Key: "key",
				Body: '{"foo":"bar"}',
				ContentType: "application/json",
			});
		});

		test("should throw if payload is undefined", async () => {
			await expect(() =>
				s3Store.store({ byteSize, payload: undefined }),
			).rejects.toThrowError();
		});
	});

	describe("reference", () => {
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
				new S3Store({
					config,
					bucket,
					key,
					format: "url-s3-global-path",
				}).store({
					byteSize,
					payload,
				}),
			).resolves.toEqual(`s3://${bucket}/${key}`);

			await expect(
				new S3Store({
					config,
					bucket,
					key,
					format: "url-s3-region-path",
				}).store({
					byteSize,
					payload,
				}),
			).resolves.toEqual(
				`s3://s3.${config.region}.amazonaws.com/${bucket}/${key}`,
			);
		});
	});

	describe("presigned URLs", () => {
		const mockClient = () =>
			vi
				.spyOn(S3Client.prototype, "send")
				.mockImplementation(() => Promise.resolve({}));

		test("should generate presigned URL when enabled", async () => {
			const byteSize = 1_000;
			const payload = { foo: "bar" };

			mockClient();

			const s3Store = new S3Store({
				config,
				bucket,
				key,
				presigned: true,
			});

			const result = await s3Store.store({ byteSize, payload });

			// Just check that it's a valid presigned URL format
			expect(result).toMatch(
				/^https:\/\/.*\.s3\..*\.amazonaws\.com\/.*\?.*X-Amz-Signature=.*$/,
			);
		});

		test("should use expiration from object config", async () => {
			const byteSize = 1_000;
			const payload = { foo: "bar" };

			mockClient();

			const s3Store = new S3Store({
				config,
				bucket,
				key,
				presigned: { expiresIn: 1800 }, // 30 minutes
			});

			const result = await s3Store.store({ byteSize, payload });

			// Check that it's a valid presigned URL format and contains the correct expiration
			expect(result).toMatch(
				/^https:\/\/.*\.s3\..*\.amazonaws\.com\/.*\?.*X-Amz-Signature=.*$/,
			);
			expect(result).toMatch(/X-Amz-Expires=1800/);
		});
	});
});

describe("S3Store.canDelete", () => {
	test("should check if store can delete ARN reference", () => {
		const s3Store = new S3Store({ config, bucket, key });

		expect(s3Store.canDelete({ reference: arnReference })).toBe(true);
	});

	test("should check if store can delete URL reference", () => {
		const s3Store = new S3Store({ config, bucket, key });

		expect(s3Store.canDelete({ reference: urlReference })).toBe(true);
	});

	test("should check if store can delete object reference", () => {
		const s3Store = new S3Store({ config, bucket, key });

		expect(s3Store.canDelete({ reference: objectReference })).toBe(true);
	});

	test("should not delete presigned URL reference", () => {
		const s3Store = new S3Store({ config, bucket, key });

		expect(s3Store.canDelete({ reference: presignedUrlReference })).toBe(false);
	});

	test("should return false for invalid references", () => {
		const s3Store = new S3Store({ config, bucket, key });

		expect(s3Store.canDelete(null as any)).toBe(false);
		expect(s3Store.canDelete(undefined as any)).toBe(false);
		expect(s3Store.canDelete("" as any)).toBe(false);
		expect(s3Store.canDelete({} as any)).toBe(false);
		expect(s3Store.canDelete({ reference: "invalid" })).toBe(false);
	});
});

describe("S3Store.delete", () => {
	let sendSpy: MockInstance;

	const mockClient = () => {
		sendSpy = vi.spyOn(S3Client.prototype, "send");
		sendSpy.mockResolvedValue({});
	};

	beforeEach(() => {
		vi.resetAllMocks();
	});

	test("should delete object using ARN reference", async () => {
		mockClient();

		const s3Store = new S3Store({ config, bucket, key });

		await s3Store.delete({ reference: arnReference });

		expect(sendSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					Bucket: bucket,
					Key: key,
				},
			}),
		);
	});

	test("should delete object using URL reference", async () => {
		mockClient();

		const s3Store = new S3Store({ config, bucket, key });

		await s3Store.delete({ reference: urlReference });

		expect(sendSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					Bucket: bucket,
					Key: key,
				},
			}),
		);
	});

	test("should delete object using object reference", async () => {
		mockClient();

		const s3Store = new S3Store({ config, bucket, key });

		await s3Store.delete({ reference: objectReference });

		expect(sendSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					Bucket: bucket,
					Key: key,
				},
			}),
		);
	});

	test("should handle S3 delete errors", async () => {
		const deleteError = new Error("Delete failed");
		sendSpy = vi.spyOn(S3Client.prototype, "send");
		sendSpy.mockRejectedValue(deleteError);

		const s3Store = new S3Store({ config, bucket, key });

		await expect(
			s3Store.delete({ reference: objectReference }),
		).rejects.toThrow("Delete failed");

		expect(sendSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					Bucket: bucket,
					Key: key,
				},
			}),
		);
	});
});
