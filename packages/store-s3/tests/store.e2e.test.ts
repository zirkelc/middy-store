import { randomUUID } from "node:crypto";
import {
	CreateBucketCommand,
	HeadBucketCommand,
	S3Client,
	type S3ClientConfig,
	waitUntilBucketExists,
} from "@aws-sdk/client-s3";
import middy from "@middy/core";
import { LocalstackContainer } from "@testcontainers/localstack";
import { MIDDY_STORE, middyStore } from "middy-store";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { S3Store } from "../dist/index.js";
import { context, randomStringInBytes } from "./test-utils.js";

const localstack = await new LocalstackContainer(
	"localstack/localstack:3",
).start();

const bucket = "middy-store-s3";
const config: S3ClientConfig = {
	region: "us-east-1",
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
	foo: {
		bar: [randomStringInBytes(128 * 1024), randomStringInBytes(128 * 1024)],
	},
};

const mockKey = vi.fn<() => string>();

const s3Store = new S3Store({
	config,
	bucket,
	key: mockKey,
	format: "arn",
});

describe("S3Store", () => {
	test("should write and read full payload", async () => {
		const key = randomUUID();
		mockKey.mockReturnValue(key);

		const store = middyStore({
			stores: [s3Store],
			storeOpts: {
				size: 0,
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
		const key = randomUUID();
		mockKey.mockReturnValue(key);

		const store = middyStore({
			stores: [s3Store],
			storeOpts: {
				selector: "foo.bar",
				size: 0,
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
			foo: {
				bar: { [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key}` },
			},
		});

		await readHandler(output, context);
	});

	test("should write and read partial payload at foo.bar[0]", async () => {
		const key = randomUUID();
		mockKey.mockReturnValue(key);

		const store = middyStore({
			stores: [s3Store],
			storeOpts: {
				selector: "foo.bar[0]",
				size: 0,
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
			foo: {
				bar: [
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key}` },
					payload.foo.bar[1],
				],
			},
		});

		await readHandler(output, context);
	});

	test("should write and read multiple payloads at foo.bar[*]", async () => {
		const key = randomUUID();
		let index = 0;
		mockKey.mockImplementation(() => `${key}-${index++}`);

		const store = middyStore({
			stores: [s3Store],
			storeOpts: {
				selector: "foo.bar[*]",
				size: 0,
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
			foo: {
				bar: [
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key}-0` },
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key}-1` },
				],
			},
		});

		await readHandler(output, context);
	});
});
