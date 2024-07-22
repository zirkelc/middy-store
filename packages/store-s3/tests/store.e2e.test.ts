import { randomBytes, randomUUID } from "node:crypto";
import {
	CreateBucketCommand,
	GetObjectCommand,
	type GetObjectOutput,
	HeadBucketCommand,
	S3Client,
	type S3ClientConfig,
	waitUntilBucketExists,
} from "@aws-sdk/client-s3";
import middy from "@middy/core";
import type { Context } from "aws-lambda";
import { MIDDY_STORE, middyStore } from "middy-store";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { type KeyMakerArgs, S3Store } from "../dist/index.js";

const bucket = "middy-store-s3";
const config: S3ClientConfig = {
	region: "us-east-1",
	forcePathStyle: true, // If you want to use virtual host addressing of buckets, you can remove `forcePathStyle: true`.
	endpoint: "http://localhost:4566",
	credentials: {
		accessKeyId: "test",
		secretAccessKey: "test",
	},
};
const client = new S3Client(config);

// check if localstack is running
const getLocalstackHealth = async () => {
	try {
		const response = await fetch("http://localhost:4566/_localstack/health");
		const result = (await response.json()) as {
			services: Record<string, string>;
		};

		return response.ok && result.services.s3 === "running";
	} catch (error) {
		return false;
	}
};

const isLocalstackRunning = await getLocalstackHealth();
if (!isLocalstackRunning) {
	console.warn(
		"Localstack is not running. Please start it with `localstack start`.",
	);
}

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

const getObject = async (key: string): Promise<GetObjectOutput> => {
	return await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
};

function generateRandomString(byteLength: number) {
	let random = "";
	while (Buffer.byteLength(random, "utf8") !== byteLength) {
		random = randomBytes(byteLength).toString("base64");
		// Encode in URL format to avoid special characters and trim to approximate size
		random = random.replace(/[+\/]/g, "").substring(0, byteLength);

		// Adjust by cutting off extra bytes if necessary
		while (Buffer.byteLength(random, "utf8") > byteLength) {
			random = random.substring(0, random.length - 1);
		}
	}
	return random;
}

const context: Context = {
	callbackWaitsForEmptyEventLoop: true,
	functionVersion: "$LATEST",
	functionName: "foo-bar-function",
	memoryLimitInMB: "128",
	logGroupName: "/aws/lambda/foo-bar-function",
	logStreamName: "2021/03/09/[$LATEST]abcdef123456abcdef123456abcdef123456",
	invokedFunctionArn:
		"arn:aws:lambda:eu-west-1:123456789012:function:foo-bar-function",
	awsRequestId: "c6af9ac6-7b61-11e6-9a41-93e812345678",
	getRemainingTimeInMillis: () => 60_000,
	done: () => console.log("Done!"),
	fail: () => console.log("Failed!"),
	succeed: () => console.log("Succeeded!"),
};

const payload = {
	foo: {
		bar: [generateRandomString(128 * 1024), generateRandomString(128 * 1024)],
	},
};

const mockKey = vi.fn<(args: KeyMakerArgs) => string>();

const s3Store = new S3Store({
	config,
	bucket,
	key: mockKey,
	format: "arn",
});

describe.runIf(isLocalstackRunning)("S3Store", () => {
	test("should write and read full payload", async () => {
		const key = randomUUID();
		mockKey.mockReturnValue(key);

		const store = middyStore({
			stores: [s3Store],
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
			write: {
				selector: "foo.bar",
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
			write: {
				selector: "foo.bar[0]",
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
		mockKey.mockImplementation((args) => `${key}-${args.index}`);

		const store = middyStore({
			stores: [s3Store],
			write: {
				selector: "foo.bar[*]",
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
