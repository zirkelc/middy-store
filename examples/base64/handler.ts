import middy from "@middy/core";
import type { APIGatewayProxyEventV2, Context, Handler } from "aws-lambda";
import { loadInput, storeOutput } from "middy-store-";
import { Base64Store } from "middy-store-base64";

const lambdaHandler: Handler<APIGatewayProxyEventV2> = async (
	input,
	context,
) => {
	console.log("input in handler", input);

	return input;
};

const store = new Base64Store();

export const handler = middy()
	.use(
		loadInput({
			// logger: console.log,
			stores: [store],
		}),
	)
	.use(
		storeOutput({
			// logger: console.log,
			stores: [store],
		}),
	)
	.handler(lambdaHandler);

const payload = {
	foo: "bar",
};
const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
console.log("base64", base64);

const context = {} as Context;
const input = {
	"@store": {
		store: "base64",
		base64: "eyJmb28iOiJiYXIifQ==", // {"foo": "bar"}
	},
};

console.log("input before handler", input);
const output = await handler(input, context);
console.log("output after handler", output);
