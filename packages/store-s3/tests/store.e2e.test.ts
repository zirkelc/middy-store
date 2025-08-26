import { randomUUID } from "node:crypto";
import {
	CreateBucketCommand,
	GetObjectCommand,
	HeadBucketCommand,
	S3Client,
	type S3ClientConfig,
	waitUntilBucketExists,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import middy from "@middy/core";
import { LocalstackContainer } from "@testcontainers/localstack";
import { MIDDY_STORE, middyStore } from "middy-store";
import { context, randomStringInBytes } from "middy-store/internal";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { S3Store } from "../src/index.js";

const localstack = await new LocalstackContainer(
	"localstack/localstack:3",
).start();

const bucket = "middy-store-s3";
const region = "eu-central-1";
const config: S3ClientConfig = {
	region,
	forcePathStyle: true, // If you want to use virtual host addressing of buckets, you can remove `forcePathStyle: true`.
	endpoint: localstack.getConnectionUri(),
	credentials: {
		accessKeyId: "test",
		secretAccessKey: "test",
	},
};
const client = new S3Client(config);

beforeAll(async () => {
	try {
		await client.send(new HeadBucketCommand({ Bucket: bucket }));
	} catch (error) {
		await client.send(new CreateBucketCommand({ Bucket: bucket }));
		await waitUntilBucketExists(
			{ client: client, maxWaitTime: 300 },
			{ Bucket: bucket },
		);
	}
});

const payload = {
	id: randomUUID(),
	foo: {
		bar: [randomStringInBytes(128 * 1024), randomStringInBytes(128 * 1024)],
	},
};

const mockKeyFn = vi.fn<() => string>();
const mockKey = () => {
	const key = randomUUID();
	mockKeyFn.mockReturnValueOnce(key);
	return key;
};

const s3Store = new S3Store({
	config,
	bucket,
	key: mockKeyFn,
	format: "arn",
});

const resolveRegion = async (store: S3Store) => {
	// biome-ignore lint/complexity/useLiteralKeys: use bracket notation to access private properties
	const client = store["getClient"]();

	return typeof client.config.region === "function"
		? await client.config.region()
		: client.config.region;
};

// Map to store original localhost URLs and their S3 counterparts
const urlMapping = new Map<string, string>();

// Helper function to transform localhost URL to S3 URL format
const transformToS3Url = (localhostUrl: string): string => {
	try {
		const url = new URL(localhostUrl);
		const pathParts = url.pathname.split("/").filter(Boolean);
		if (pathParts.length >= 2) {
			const [bucket, ...keyParts] = pathParts;
			const key = keyParts.join("/");

			// Create S3 URL format: https://bucket.s3.region.amazonaws.com/key?...
			const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${key}${url.search}`;

			// Store mapping for later use in fetch
			urlMapping.set(s3Url, localhostUrl);

			return s3Url;
		}
	} catch (error) {
		// If URL parsing fails, return original
		return localhostUrl;
	}
	return localhostUrl;
};

// Mock getSignedUrl to return S3-formatted URLs
vi.mock("@aws-sdk/s3-request-presigner", async () => {
	const actual = await vi.importActual<
		typeof import("@aws-sdk/s3-request-presigner")
	>("@aws-sdk/s3-request-presigner");
	return {
		...actual,
		getSignedUrl: vi
			.fn()
			.mockImplementation(async (client, command, options) => {
				// Call the real getSignedUrl function
				const localhostUrl = await actual.getSignedUrl(
					client,
					command,
					options,
				);
				// Transform to S3 format
				return transformToS3Url(localhostUrl);
			}),
	};
});

// Mock global fetch to redirect S3 URLs back to localhost
const originalFetch = global.fetch;
global.fetch = vi.fn().mockImplementation(async (url, ...args) => {
	const urlStr = typeof url === "string" ? url : url.toString();

	const localhostUrl = urlMapping.get(urlStr);
	// If this is a mapped S3 URL, use the original localhost URL
	if (localhostUrl) {
		return originalFetch(localhostUrl, ...args);
	}

	// Otherwise, use the original URL
	return originalFetch(url, ...args);
});

describe("S3Store", () => {
	describe("should infer region from S3 client", async () => {
		test("from config: { region }", async () => {
			const store = new S3Store({
				bucket,
				config: { region },
			});

			await expect(resolveRegion(store)).resolves.toEqual(region);
		});

		test("from config: () => { region }", async () => {
			const store = new S3Store({
				bucket,
				config: () => ({ region }),
			});

			await expect(resolveRegion(store)).resolves.toEqual(region);
		});

		// test("from process.env.AWS_DEFAULT_REGION", async () => {
		// 	process.env.AWS_DEFAULT_REGION = "eu-central-1";
		// 	const store = new S3Store({
		// 		bucket,
		// 	});

		// 	await expect(resolveRegion(store)).resolves.toEqual(region);
		// });

		test("from process.env.AWS_REGION", async () => {
			process.env.AWS_REGION = "eu-central-1";
			const store = new S3Store({
				bucket,
			});

			await expect(resolveRegion(store)).resolves.toEqual(region);
		});
	});

	test("should generate key from payload", async () => {
		const s3Store = new S3Store<typeof payload>({
			config,
			bucket,
			key: ({ payload }) => payload.id,
			format: "arn",
		});

		const store = middyStore({
			stores: [s3Store],
			storingOptions: {
				minSize: 0,
			},
		});

		const writeHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				return structuredClone(payload);
			});

		const output = await writeHandler(null, context);

		expect(output).toBeDefined();
		expect(output).not.toEqual(payload);
		expect(output).toEqual({
			[MIDDY_STORE]: `arn:aws:s3:::${bucket}/${payload.id}`,
		});
	});

	test("should write and read full payload", async () => {
		const key = mockKey();

		const store = middyStore({
			stores: [s3Store],
			storingOptions: {
				minSize: 0,
			},
		});

		const writeHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				return structuredClone(payload);
			});

		const readHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				expect(input).toEqual(payload);
			});

		const output = await writeHandler(null, context);

		expect(output).toBeDefined();
		expect(output).not.toEqual(payload);
		expect(output).toEqual({
			[MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key}`,
		});

		await readHandler(output, context);
	});

	test("should write and read partial payload at foo.bar", async () => {
		const key = mockKey();

		const store = middyStore({
			stores: [s3Store],
			storingOptions: {
				selector: "foo.bar",
				minSize: 0,
			},
		});

		const writeHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				return structuredClone(payload);
			});

		const readHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				expect(input).toEqual(payload);
			});

		const output = await writeHandler(null, context);

		expect(output).toBeDefined();
		expect(output).not.toEqual(payload);
		expect(output).toEqual({
			id: payload.id,
			foo: {
				bar: { [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key}` },
			},
		});

		await readHandler(output, context);
	});

	test("should write and read partial payload at foo.bar[0]", async () => {
		const key = mockKey();

		const store = middyStore({
			stores: [s3Store],
			storingOptions: {
				selector: "foo.bar[0]",
				minSize: 0,
			},
		});

		const writeHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				return structuredClone(payload);
			});

		const readHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				expect(input).toEqual(payload);
			});

		const output = await writeHandler(null, context);

		expect(output).toBeDefined();
		expect(output).not.toEqual(payload);
		expect(output).toEqual({
			id: payload.id,
			foo: {
				bar: [
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key}` },
					payload.foo.bar[1],
				],
			},
		});

		await readHandler(output, context);
	});

	test("should write and read multiple payloads at foo.bar.*", async () => {
		const key1 = mockKey();
		const key2 = mockKey();

		const store = middyStore({
			stores: [s3Store],
			storingOptions: {
				selector: "foo.bar.*",
				minSize: 0,
			},
		});

		const writeHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				return structuredClone(payload);
			});

		const readHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				expect(input).toEqual(payload);
			});

		const output = await writeHandler(null, context);

		expect(output).toBeDefined();
		expect(output).not.toEqual(payload);
		expect(output).toEqual({
			id: payload.id,
			foo: {
				bar: [
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key1}` },
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key2}` },
				],
			},
		});

		await readHandler(output, context);
	});

	test("should write and read full payload with presigned URLs", async () => {
		const key = mockKey();

		const presignedS3Store = new S3Store({
			config,
			bucket,
			key: mockKeyFn,
			presigned: true, // Enable presigned URLs
		});

		const store = middyStore({
			stores: [presignedS3Store],
			storingOptions: {
				minSize: 0,
			},
		});

		const writeHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				return structuredClone(payload);
			});

		const readHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				expect(input).toEqual(payload);
			});

		const output = await writeHandler(null, context);

		expect(output).toBeDefined();
		expect(output).not.toEqual(payload);

		// The output should contain a presigned URL instead of an ARN
		const presignedUrlReference = output[MIDDY_STORE];
		expect(presignedUrlReference).toMatch(
			/^https:\/\/.*\.s3\..*\.amazonaws\.com\/.*\?.*X-Amz-Signature=.*$/,
		);
		expect(presignedUrlReference).toMatch(/X-Amz-Expires=3600/); // Default 1 hour expiration

		// Verify the presigned URL can be loaded
		await readHandler(output, context);
	});

	test("should write and read payload with custom presigned URL expiration", async () => {
		const key = mockKey();

		const presignedS3Store = new S3Store({
			config,
			bucket,
			key: mockKeyFn,
			presigned: { expiresIn: 7200 }, // 2 hours
		});

		const store = middyStore({
			stores: [presignedS3Store],
			storingOptions: {
				minSize: 0,
			},
		});

		const writeHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				return structuredClone(payload);
			});

		const readHandler = middy()
			.use(store)
			.handler(async (input: unknown) => {
				expect(input).toEqual(payload);
			});

		const output = await writeHandler(null, context);

		expect(output).toBeDefined();
		expect(output).not.toEqual(payload);

		// The output should contain a presigned URL with custom expiration
		const presignedUrlReference = output[MIDDY_STORE];
		expect(presignedUrlReference).toMatch(
			/^https?:\/\/.*\?.*X-Amz-Signature=.*$/,
		);
		expect(presignedUrlReference).toMatch(/X-Amz-Expires=7200/); // 2 hours

		// Verify the presigned URL can be loaded
		await readHandler(output, context);
	});

	describe("deleteAfterLoad", () => {
		test("should delete object after successful load", async () => {
			const s3Store = new S3Store<typeof payload>({
				config,
				bucket,
				key: mockKey,
				format: "arn",
			});

			// Store a payload first
			const storeHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
						storingOptions: {
							minSize: 0,
						},
					}),
				)
				.handler(async (input: unknown) => {
					return structuredClone(payload);
				});

			const storedOutput = await storeHandler(null, context);
			expect(storedOutput).toBeDefined();
			expect(storedOutput[MIDDY_STORE]).toBeDefined();

			// Now load the payload with deleteAfterLoad enabled
			const loadHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
						loadingOptions: {
							deleteAfterLoad: true,
						},
					}),
				)
				.handler(async (input: unknown) => {
					expect(input).toEqual(payload);
					return { processed: true };
				});

			// Should load successfully
			await expect(loadHandler(storedOutput, context)).resolves.toEqual({
				processed: true,
			});

			// Verify the object is deleted by trying to load it again
			const verifyHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
						loadingOptions: {
							passThrough: true, // Don't fail, just passthrough if not found
						},
					}),
				)
				.handler(async (input: unknown) => {
					return input;
				});

			// Verify the object is actually deleted by checking directly with S3 client
			const reference = storedOutput[MIDDY_STORE] as string;
			const arnMatch = reference.match(/arn:aws:s3:::([^\/]+)\/(.+)$/);
			if (arnMatch) {
				const [, bucketName, objectKey] = arnMatch;
				const checkAfterDelete = new GetObjectCommand({
					Bucket: bucketName,
					Key: objectKey,
				});
				await expect(client.send(checkAfterDelete)).rejects.toThrow();
			}
		});

		test("should handle multiple references deletion", async () => {
			const s3Store = new S3Store<any>({
				config,
				bucket,
				key: mockKey,
				format: "arn",
			});

			const payload1 = { id: "test1", data: randomStringInBytes(1024) };
			const payload2 = { id: "test2", data: randomStringInBytes(1024) };

			// Store two payloads
			const storeHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
						storingOptions: {
							minSize: 0,
						},
					}),
				)
				.handler(async (input: any) => {
					if (input?.type === "first") {
						return payload1;
					}
					return payload2;
				});

			const stored1 = await storeHandler({ type: "first" }, context);
			const stored2 = await storeHandler({ type: "second" }, context);

			// Create input with multiple references
			const multiInput = {
				first: stored1,
				second: stored2,
			};

			// Load and delete both references
			const loadHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
						loadingOptions: {
							deleteAfterLoad: true,
						},
					}),
				)
				.handler(async (input: any) => {
					expect(input.first).toEqual(payload1);
					expect(input.second).toEqual(payload2);
					return { processed: "both" };
				});

			// Should load and delete both successfully
			await expect(loadHandler(multiInput, context)).resolves.toEqual({
				processed: "both",
			});

			// Verify both objects are deleted by attempting to load them again
			const verifyHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
					}),
				)
				.handler(async (input: any) => {
					return input;
				});

			// Verify both objects are deleted by checking directly with S3 client
			const ref1 = stored1[MIDDY_STORE] as string;
			const ref2 = stored2[MIDDY_STORE] as string;

			const arnMatch1 = ref1.match(/arn:aws:s3:::([^\/]+)\/(.+)$/);
			const arnMatch2 = ref2.match(/arn:aws:s3:::([^\/]+)\/(.+)$/);

			if (arnMatch1) {
				const [, bucketName, objectKey] = arnMatch1;
				const checkAfterDelete = new GetObjectCommand({
					Bucket: bucketName,
					Key: objectKey,
				});
				await expect(client.send(checkAfterDelete)).rejects.toThrow();
			}

			if (arnMatch2) {
				const [, bucketName, objectKey] = arnMatch2;
				const checkAfterDelete = new GetObjectCommand({
					Bucket: bucketName,
					Key: objectKey,
				});
				await expect(client.send(checkAfterDelete)).rejects.toThrow();
			}
		});

		test("should not delete if function fails", async () => {
			const s3Store = new S3Store<typeof payload>({
				config,
				bucket,
				key: mockKey,
				format: "arn",
			});

			// Store a payload first
			const storeHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
						storingOptions: {
							minSize: 0,
						},
					}),
				)
				.handler(async (input: unknown) => {
					return structuredClone(payload);
				});

			const storedOutput = await storeHandler(null, context);

			// Create handler that fails after loading
			const failingHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
						loadingOptions: {
							deleteAfterLoad: true,
						},
					}),
				)
				.handler(async (input: unknown) => {
					expect(input).toEqual(payload);
					throw new Error("Function failed");
				});

			// Should fail and not delete the object
			await expect(failingHandler(storedOutput, context)).rejects.toThrow(
				"Function failed",
			);

			// Verify the object still exists by loading it again
			const verifyHandler = middy()
				.use(
					middyStore({
						stores: [s3Store],
					}),
				)
				.handler(async (input: unknown) => {
					expect(input).toEqual(payload);
					return { verified: true };
				});

			await expect(verifyHandler(storedOutput, context)).resolves.toEqual({
				verified: true,
			});
		});
	});
});
