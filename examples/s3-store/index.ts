import { randomBytes, randomUUID } from "node:crypto";
/**
 * Runs this example with:
 *
 * cd ./examples/custom-store
 * npm install
 * npm start
 */
import {
	CreateBucketCommand,
	HeadBucketCommand,
	S3Client,
	waitUntilBucketExists,
} from "@aws-sdk/client-s3";
import middy from "@middy/core";
import type { Context } from "aws-lambda";
import { Sizes, middyStore } from "middy-store";
import { S3Store } from "middy-store-s3";

const context = {} as Context;

type Payload = {
	id: string;
	random: string;
};

/**
 * Configure your bucket and region.
 */
const bucket = "my-bucket"; // TODO: Replace with your bucket name
const region = "us-east-1"; // TODO: Replace with your region

/**
 * Create the bucket if it does not exist.
 * Remove this block if you use an existing bucket.
 */
const client = new S3Client({ region });
try {
	await client.send(new HeadBucketCommand({ Bucket: bucket }));
} catch (error) {
	await client.send(new CreateBucketCommand({ Bucket: bucket }));
	await waitUntilBucketExists(
		{ client: client, maxWaitTime: 300 },
		{ Bucket: bucket },
	);
}

const s3Store = new S3Store<Payload>({
	/* Config is optional */
	config: { region },
	/* Bucket is required */
	bucket,
	/* Key is optional and defaults to randomUUID() */
	key: ({ payload }) => payload.id,
});

const handler1 = middy()
	.use(
		middyStore<{}, Payload>({
			stores: [s3Store],
		}),
	)
	.handler(async (input) => {
		return {
			/* Generate a random ID to be used as the key in S3 */
			id: randomUUID(),
			/* Generate a random payload of size 512kb */
			random: randomBytes(Sizes.kb(512) /* 512kb */).toString("hex"),
		};
	});

const handler2 = middy()
	.use(
		middyStore<Payload, {}>({
			stores: [s3Store],
		}),
	)
	.handler(async (input) => {
		/* Print the size of the payload */
		console.log(
			`Size: ${Buffer.from(input.random, "hex").byteLength / 1024}kb`,
		);
	});

/**
 * First handler generates a random payload and returns it.
 * middy-store will store the payload in Amazon S3 and replace the payload with a reference.
 */
const output = await handler1({}, context);

/**
 * The output is a reference to the stored payload.
 * Prints: { '@middy-store': 's3://my-bucket/...' }
 */
console.log(output);

/**
 * Second handler receives the output from the first handler.
 * middy-store will load the payload from Amazon S3 and replace the reference with the payload.
 */
await handler2(output, context);
