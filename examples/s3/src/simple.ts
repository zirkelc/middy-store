import { randomBytes, randomUUID } from "node:crypto";
import middy from "@middy/core";
import { type Context, Handler } from "aws-lambda";
import { middyStore } from "middy-store";
import { S3Store } from "middy-store-s3";

const context = {} as Context;

type Payload = {
	random: string;
};

const handler1 = middy()
	.use(
		middyStore<{}, Payload>({
			stores: [
				new S3Store({
					config: { region: "us-east-1" },
					bucket: "bucket",
					key: () => randomUUID(),
				}),
			],
		}),
	)
	.handler(async (input) => {
		return {
			random: randomBytes(1024 * 1024).toString("base64"),
		};
	});

const handler2 = middy()
	.use(
		middyStore<Payload, {}>({
			stores: [
				new S3Store({
					config: { region: "us-east-1" },
					bucket: "bucket",
					key: () => randomUUID(),
				}),
			],
		}),
	)
	.handler(async (input) => {
		console.log(
			`Size: ${Buffer.from(input.random, "base64").byteLength / 1024 / 1024} MB`,
		);
	});

// First handler generates a random string of size 1MB
// middy-store has stored the payload in S3 and returned it as output
const output = await handler1({}, context);

console.log(output);

// Second handler receives the payload from the first handler
// middy-store has loaded the payload from S3 and passed it as input to the handler
await handler2(output, context);
