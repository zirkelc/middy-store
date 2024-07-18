import { randomBytes, randomUUID } from "node:crypto";
import middy from "@middy/core";
import type { Handler } from "aws-lambda";
import { loadInput, storeOutput } from "middy-store";
import { S3Store } from "middy-store-s3";

const MAX_OUTPUT_SIZE_KB = 256; // https://docs.aws.amazon.com/step-functions/latest/dg/limits.html

const store = new S3Store({
	bucket: process.env.PAYLOAD_BUCKET!,
	key: randomUUID(),
});

type Payload = {
	sizeInKb: number;
	content: string;
};

type GeneratePayloadInput = {
	sizeInKb?: number;
};

type GeneratePayloadOutput = {
	payload: Payload | Payload[];
};

const generatePayload: Handler<GeneratePayloadInput> = async (
	input,
	context,
): Promise<GeneratePayloadOutput> => {
	console.log("Generating payload", { input });

	// Generate a large payload
	const content = randomBytes(
		(input.sizeInKb ?? MAX_OUTPUT_SIZE_KB) * 1024,
	).toString("base64");

	const output = {
		...input,
		payload: {
			sizeInKb: Buffer.byteLength(content, "utf8") / 1024,
			content,
		},
	};

	console.log("Generated payload", { output });

	return output;
};

export const generatePayloadHandler = middy()
	.use(
		storeOutput({
			logger: console.log,
			// maxSize: 0,
			selector: "payload",
			replacer: ({ input, output, reference }) => {
				const payloads = Array.isArray(input.payload) ? input.payload : [];

				output.payload = [...payloads, reference];

				return output;
			},
			stores: [store],
		}),
	)
	.handler(generatePayload);

const printPayload: Handler<GeneratePayloadOutput> = async (
	input,
	context,
): Promise<undefined> => {
	console.log("Printing payload", { input });

	const payload = Array.isArray(input.payload)
		? input.payload
		: [input.payload];

	for (let i = 0; i < payload.length; i++) {
		console.log(`Expected payload size: ${payload[i].sizeInKb} KB`);
		console.log(
			`Actual payload size: ${Buffer.byteLength(
				payload[i].content,
				"utf8",
			)} KB`,
		);
	}

	return undefined;
};

export const printPayloadHandler = middy()
	.use(
		loadInput({
			// logger: console.log,
			// maxSize: 0,
			stores: [store],
		}),
	)
	.handler(printPayload);
