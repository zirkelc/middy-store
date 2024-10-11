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
import { context, randomStringInBytes } from "middy-store/internal";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { S3Store } from "../dist/index.js";

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
		const key1 = mockKey();
		const key2 = mockKey();

		const store = middyStore({
			stores: [s3Store],
			storingOptions: {
				selector: "foo.bar[*]",
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
			foo: {
				bar: [
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key1}` },
					{ [MIDDY_STORE]: `arn:aws:s3:::${bucket}/${key2}` },
				],
			},
		});

		await readHandler(output, context);
	});
});
