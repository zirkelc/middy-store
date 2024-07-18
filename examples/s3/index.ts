import { randomBytes, randomUUID } from "node:crypto";
import middy from "@middy/core";
import { Handler } from "aws-lambda";
import { middyStore } from "middy-store";
import { S3Store } from "middy-store-s3";

const MAX_OUTPUT_SIZE_KB = 256; // https://docs.aws.amazon.com/step-functions/latest/dg/limits.html

type Input = Record<string, never>;

type Output = {
	id: string;
	foo: {
		bar: {
			baz: string;
		};
	};
};

export const handler = middy()
	.use(
		middyStore<Input, Output>({
			stores: [
				new S3Store({
					bucket: process.env.PAYLOAD_BUCKET!,
					key: ({ output, index }) => `${output.id}/payload-${index}`,
				}),
			],
			write: {
				selector: "foo.bar.baz",
			},
		}),
	)
	.handler(async (input) => {
		console.log("Generating payload", { input });

		const content = randomBytes(MAX_OUTPUT_SIZE_KB * 1024).toString("base64");

		const output: Output = {
			id: randomUUID(),
			foo: {
				bar: {
					baz: content,
				},
			},
		};

		return output;
	});
