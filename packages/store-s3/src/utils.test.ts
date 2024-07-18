import { describe, expect, test } from "vitest";
import { STORE_NAME } from "./store.js";
import {
	formatS3ObjectArn,
	formatS3Reference,
	isS3Object,
	isS3ObjectArn,
	isValidBucket,
	isValidKey,
	parseS3ObjectArn,
	parseS3Reference,
	uuidKey,
} from "./utils.js";

const nonStringValues = [null, undefined, "", 42, true, false, {}];

describe("uuidKey", () => {
	test("should generate a valid UUID key", () => {
		const key = uuidKey();
		expect(typeof key).toBe("string");
		expect(key).toMatch(
			/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
		);
	});
});

describe("isValidKey", () => {
	test.each(["foo", "foo/bar", "foo/bar/baz"])(
		"should return true for a valid key: %s",
		(key) => {
			expect(isValidKey(key)).toBe(true);
		},
	);

	test.each([...nonStringValues])(
		"should return false for an invalid key: %s",
		(key) => {
			expect(isValidKey(key)).toBe(false);
		},
	);
});

describe("isValidBucket", () => {
	test.each(["bucket"])(
		"should return true for a valid bucket: %s",
		(bucket) => {
			expect(isValidBucket(bucket)).toBe(true);
		},
	);

	test.each([...nonStringValues])(
		"should return false for an invalid bucket: %s",
		(bucket) => {
			expect(isValidBucket(bucket)).toBe(false);
		},
	);
});

describe("isS3ObjectArn", () => {
	test.each([
		"arn:aws:s3:::bucket/foo",
		"arn:aws:s3:::bucket/foo/bar",
		"arn:aws:s3:::bucket/foo/bar/baz",
	])("should return true for a valid S3 object ARN: %s", (arn) => {
		expect(isS3ObjectArn(arn)).toBe(true);
	});

	test.each([...nonStringValues, "arn:aws:s3:::", "arn:aws:s3:::my-bucket"])(
		"should return false for an invalid S3 object ARN: %s",
		(arn) => {
			const result = isS3ObjectArn(arn);
			expect(result).toBe(false);
		},
	);
});

describe("parseS3ObjectArn", () => {
	test.each([
		"arn:aws:s3:::bucket/foo",
		"arn:aws:s3:::bucket/foo/bar",
		"arn:aws:s3:::bucket/foo/bar/baz",
	])("should parse a valid S3 ARN: %s", (arn) => {
		expect(parseS3ObjectArn(arn)).toEqual({
			bucket: "bucket",
			key: arn.substring(arn.indexOf("/") + 1),
		});
	});

	test.each([...nonStringValues, "arn:aws:s3:::my-bucket"])(
		"should throw an error for an invalid S3 ARN: %s",
		(arn) => {
			expect(() => parseS3ObjectArn(arn as any)).toThrowError();
		},
	);
});

describe("formatS3ObjectArn", () => {
	test.each([
		{ bucket: "bucket", key: "foo" },
		{ bucket: "bucket", key: "foo/bar" },
		{ bucket: "bucket", key: "foo/bar/baz" },
	])("should format a valid S3 object ARN: %s", ({ bucket, key }) => {
		expect(formatS3ObjectArn(bucket, key)).toBe(
			`arn:aws:s3:::${bucket}/${key}`,
		);
	});
});

describe("isS3Object", () => {
	test.each([
		{ bucket: "bucket", key: "foo" },
		{ bucket: "bucket", key: "foo/bar" },
		{ bucket: "bucket", key: "foo/bar/baz" },
	])("should return true for a valid S3 object: %s", (obj) => {
		expect(isS3Object(obj)).toBe(true);
	});

	test.each([...nonStringValues, { bucket: "bucket" }, { key: "foo" }])(
		"should return false for an invalid S3 object: %s",
		(obj) => {
			expect(isS3Object(obj)).toBe(false);
		},
	);
});

describe("parseS3Reference", () => {
	test("should parse a valid S3 object reference", () => {
		const reference = { bucket: "bucket", key: "foo", store: STORE_NAME };
		expect(parseS3Reference(reference)).toEqual(reference);
	});

	test("should parse a valid S3 ARN reference", () => {
		const reference = "arn:aws:s3:::bucket/foo";
		expect(parseS3Reference(reference)).toEqual({
			bucket: "bucket",
			key: "foo",
		});
	});

	test("should parse a valid S3 URL reference", () => {
		const reference = "s3://bucket/foo";
		expect(parseS3Reference(reference)).toEqual({
			bucket: "bucket",
			key: "foo",
		});
	});

	test.each([
		...nonStringValues,
		{ bucket: "bucket" },
		{ key: "foo" },
		"invalid-reference",
	])("should throw an error for an invalid S3 reference: %s", (reference) => {
		expect(() => parseS3Reference(reference as any)).toThrowError();
	});
});

describe("formatS3Reference", () => {
	const obj = { bucket: "bucket", key: "foo" };
	const { bucket, key } = obj;

	test("should format a valid S3 object reference", () => {
		expect(formatS3Reference(obj, { type: "object" })).toEqual({
			...obj,
			store: STORE_NAME,
		});
	});

	test("should format a valid S3 ARN reference", () => {
		expect(formatS3Reference(obj, { type: "arn" })).toBe(
			`arn:aws:s3:::${bucket}/${key}`,
		);
	});

	test("should format a valid S3 URL reference", () => {
		expect(
			formatS3Reference(obj, { type: "url", format: "s3-global-path" }),
		).toBe(`s3://${bucket}/${key}`);
	});

	// test.each([
	// 	...nonStringValues,
	// 	{ bucket: "my-bucket" },
	// 	{ key: "my-key" },
	// 	{ bucket: "my-bucket", key: "my-key", extra: "extra" },
	// 	{ type: "invalid" },
	// ])("should throw an error for an invalid reference format: %s", (format) => {
	// 	expect(() => formatS3Reference({ bucket: "my-bucket", key: "my-key" }, format)).toThrowError();
	// });
});
