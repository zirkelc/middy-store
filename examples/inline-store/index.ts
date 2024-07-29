import { randomBytes } from "node:crypto";
import middy from "@middy/core";
import type { Context } from "aws-lambda";
import { type StoreInterface, middyStore } from "middy-store";

const context = {} as Context;

type Payload = {
	random: string;
};

const store: StoreInterface<object, string> = {
	name: "base64",
	canLoad: ({ reference }) => {
		return (
			typeof reference === "string" &&
			reference.startsWith("data:text/plain;base64,")
		);
	},
	load: async ({ reference }) => {
		const base64 = reference.replace("data:text/plain;base64,", "");
		return JSON.parse(Buffer.from(base64, "base64").toString());
	},
	canStore: ({ payload }) => {
		return typeof payload === "string";
	},
	store: async ({ payload }) => {
		const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
		return `data:text/plain;base64,${base64}`;
	},
};

const handler1 = middy()
	.use(
		middyStore({
			stores: [store],
		}),
	)
	.handler(async (input) => {
		return {
			random: randomBytes(1 * 1024 * 1024 * 1024).toString("hex"),
		};
	});

const handler2 = middy<Payload>()
	.use(
		middyStore({
			stores: [store],
		}),
	)
	.handler(async (input) => {
		console.log(
			`Size: ${Buffer.from(input.random, "hex").byteLength / 1024 / 1024} MB`,
		);
	});

const output = await handler1(null, context);

console.log(output);

await handler2(output, context);
