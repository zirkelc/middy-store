import { randomBytes, randomUUID } from "node:crypto";
import middy from "@middy/core";
import type { Handler } from "aws-lambda";
import { middyStore } from "middy-store";
import { S3Store } from "middy-store-s3";

const MAX_OUTPUT_SIZE_KB = 256; // https://docs.aws.amazon.com/step-functions/latest/dg/limits.html

const store = new S3Store({
	bucket: process.env.PAYLOAD_BUCKET!,
	key: randomUUID(),
});

type Payload = {
	content: string;
};

type GeneratePayloadInput = any;

type GeneratePayloadOutput = {
	sizeInKb: number;
	payload: Payload;
	iterator: Array<number>;
};

const SIZE = 100 * 1024 * 1024; // 100 MB
const ITERATIONS = 50;

const generatePayloads: Handler<
	GeneratePayloadInput,
	GeneratePayloadOutput
> = async (input, context, callback) => {
	console.log("Generating payload", { input });

	// Generate a large payload
	const content = randomBytes(SIZE).toString("base64");

	const output = {
		...input,
		sizeInKb: Buffer.byteLength(content, "utf8") / 1024,
		payload: {
			content,
		},
		iterator: Array.from({ length: ITERATIONS }, (_, i) => i),
	};

	console.log(`Generated payload: ${output.sizeInKb} KB`);

	return output;
};

export const generatePayloadsHandler = middy()
	.use(
		middyStore({
			// logger: console.log,
			stores: [
				new S3Store({
					// logger: console.log,
					region: "us-east-1",
					bucket: process.env.PAYLOAD_BUCKET!,
					// key: makeEtlKey(),
					format: {
						type: "url",
						format: "s3-region-path",
					},
				}),
			],
			read: true,
			write: {
				selector: "payload",
			},
		}),
	)
	.handler(generatePayloads);

type MapPayloadIteratorInput = GeneratePayloadOutput & {
	index: number;
};
const mapPayloadIterator: Handler<MapPayloadIteratorInput> = async (
	input,
	context,
): Promise<undefined> => {
	console.log(`Iterator index${input.index}`);

	const payload = input.payload;

	console.log(
		`Actual payload size: ${Buffer.byteLength(payload.content, "utf8")} KB`,
	);

	return undefined;
};

export const mapPayloadIteratorHandler = middy()
	.use(
		middyStore({
			// logger: console.log,
			stores: [
				new S3Store({
					// logger: console.log,
					region: "us-east-1",
					bucket: process.env.PAYLOAD_BUCKET!,
					// key: makeEtlKey(),
					format: {
						type: "url",
						format: "s3-region-path",
					},
				}),
			],
			read: true,
			write: {
				selector: "payload",
			},
		}),
	)
	.handler(mapPayloadIterator);
