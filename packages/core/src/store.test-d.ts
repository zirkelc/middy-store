import middy from "@middy/core";
import { APIGatewayProxyEventV2, Context, Handler } from "aws-lambda";
import set from "lodash.set";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	ReadInput,
	ReadStoreOptions,
	Store,
	WriteOutput,
	WriteStoreOptions,
} from "./store.js";

const context = {} as Context;

const mockStore: Store = {
	name: "mock",
	canRead: vi.fn(),
	read: vi.fn(),
	canWrite: vi.fn(),
	write: vi.fn(),
};

type Input = {
	foo: string;
};
