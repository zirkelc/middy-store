/**
 * Runs this example with:
 *
 * cd ./examples/custom-store
 * npm install
 * npm start
 */
import middy from "@middy/core";
import type { Context } from "aws-lambda";
import { Sizes, type StoreInterface, middyStore } from "middy-store";

const context = {} as Context;

const store: StoreInterface<string, string> = {
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
			storingOptions: {
				/* Always store the payload */
				minSize: Sizes.ZERO,
			},
		}),
	)
	.handler(async (input) => {
		/* Return a large string */
		return `Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.`;
	});

const handler2 = middy<string>()
	.use(
		middyStore({
			stores: [store],
		}),
	)
	.handler(async (input) => {
		console.log(input);
	});

/* Output contains the reference */
const output = await handler1(null, context);

/* Prints: { '@middy-store': 'data:text/plain;base64,IkxvcmVtIGlwc3VtIGRvbG9yIHNpdC...' } */
console.log(output);

/* Prints: Lorem ipsum dolor sit amet... */
await handler2(output, context);
