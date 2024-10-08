import { describe, expect, test } from "vitest";
import { STORE_NAME } from "../src/store.js";
import {
	formatS3ObjectArn,
	formatS3Reference,
	isS3Object,
	isS3ObjectArn,
	parseS3ObjectArn,
	parseS3Reference,
} from "../src/utils.js";

const nonStringValues = [null, undefined, "", 42, true, false, {}];

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
		expect(formatS3Reference(obj, "object")).toEqual({
			...obj,
			store: STORE_NAME,
		});
	});

	test("should format a valid S3 ARN reference", () => {
		expect(formatS3Reference(obj, "arn")).toBe(`arn:aws:s3:::${bucket}/${key}`);
	});

	test("should format a valid S3 URL reference", () => {
		expect(formatS3Reference(obj, "url-s3-global-path")).toBe(
			`s3://${bucket}/${key}`,
		);
	});
});
