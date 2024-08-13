import { randomBytes } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Context } from "aws-lambda";
import type { S3Store } from "../dist/index.js";

export const context: Context = {
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

export function randomStringInBytes(byteLength: number) {
	let random = "";
	while (Buffer.byteLength(random, "utf8") !== byteLength) {
		random = randomBytes(byteLength).toString("base64").slice(0, byteLength);
	}
	return random;
}

export const resolveRegion = async (store: S3Store) => {
	// biome-ignore lint/complexity/useLiteralKeys: use bracket notation to access private properties
	const client = store["getClient"]();

	return typeof client.config.region === "function"
		? await client.config.region()
		: client.config.region;
};
