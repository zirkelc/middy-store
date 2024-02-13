import middy from "@middy/core";
import { Context, Handler } from "aws-lambda";
import { before } from "node:test";
import { describe, expect, test, vi } from "vitest";
import { S3Store, S3StoreReference } from "./store.js";
import { LoadInput, StoreInput } from "middy-input-output-store";

const bucket = "bucket";
const key = "key";
const uri = "s3://bucket/key";

const mockReference: S3StoreReference = {
	store: "s3",
	bucket,
	key,
	uri,
};

const mockPayloadWithReference = {
	"@store": mockReference,
};

const mockPayload = {
	foo: "bar",
};

const mockLoadInput: LoadInput = {
	reference: mockReference,
};

const mockStoreInput: StoreInput = {
	payload: mockPayload,
	byteSize: Buffer.byteLength(JSON.stringify(mockPayload)),
	typeOf: typeof mockPayload,
};

before(() => {
	vi.resetAllMocks();
});

describe("S3Store.canLoad", () => {
	const s3Store = new S3Store({ bucket, key });

	test("should return true for payload", async () => {
		const input = mockLoadInput;

		const output = s3Store.canLoad(input);

		expect(output).toBe(true);
	});

	test.each([
		null,
		undefined,
		"foo",
		42,
		true,
		false,
		() => { },
		{},
		{ reference: null },
		{ reference: "" },
		{
			reference: {},
		},
		{
			reference: {
				store: "foo",
			},
		},
	])("should return false for payload: %s", async (input) => {
		const output = s3Store.canLoad(input as any);

		expect(output).toBe(false);
	});

	test.each([null, undefined, "foo", 42, true, false, () => { }, {}])(
		"should throw an error for bucket and key: %s",
		async (input) => {
			expect(() =>
				s3Store.canLoad({
					reference: { store: "s3", bucket: input, key },
				} as any),
			).toThrowError();
			expect(() =>
				s3Store.canLoad({
					reference: { store: "s3", bucket, key: input },
				} as any),
			).toThrowError();
		},
	);
});
