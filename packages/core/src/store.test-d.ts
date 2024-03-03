import middy from "@middy/core";
import { APIGatewayProxyEventV2, Context, Handler } from "aws-lambda";
import set from "lodash.set";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	LoadInput,
	LoadInputMiddlewareOptions,
	Store,
	StoreOutput,
	StoreOutputMiddlewareOptions,
	loadInput,
	storeOutput,
} from "./store.js";

const context = {} as Context;

const mockStore: Store<any, any> = {
	name: "mock",
	canLoad: vi.fn(),
	load: vi.fn(),
	canStore: vi.fn(),
	store: vi.fn(),
};

type Input = {
	foo: string;
};

// const useLoadInput = middy<Input>()
// 	.use(loadInput<Input>({ stores: [mockStore], selector: (args) => args.input.foo }))
// 	.handler(async (input, context) => {
// 		return input;
// 	});

// const useStoreOutput = (options: StoreOutputMiddlewareOptions) =>
// 	middy()
// 		.use(storeOutput(options))
// 		.handler(async (input, context) => {
// 			return input;
// 		});
