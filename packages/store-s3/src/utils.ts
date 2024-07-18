import { randomUUID } from "node:crypto";
import { type S3Object, formatS3Url, isS3Url, parseS3Url } from "amazon-s3-url";
import {
	type S3Reference,
	type S3ReferenceFormat,
	STORE_NAME,
} from "./store.js";

export const uuidKey = () => randomUUID();

export const isValidKey = (key: unknown): key is string => {
	return typeof key === "string" && key.length > 0;
};

export const isValidBucket = (bucket: unknown) => {
	return typeof bucket === "string" && bucket.length > 0;
};

export const isS3ObjectArn = (arn: unknown): arn is string => {
	return (
		typeof arn === "string" && arn.startsWith("arn:aws:s3") && arn.includes("/")
	);
};

export const parseS3ObjectArn = (arn: string): S3Object => {
	const [_, bucket, key] = arn.match(/^arn:aws:s3:::([^/]+)\/(.+)$/) ?? [];
	if (!isValidBucket(bucket)) throw new Error(`Invalid S3 ARN: ${arn}`);
	if (!isValidKey(key)) throw new Error(`Invalid S3 ARN: ${arn}`);

	return { bucket, key };
};

export const formatS3ObjectArn = (bucket: string, key: string) => {
	return `arn:aws:s3:::${bucket}/${key}`;
};

export const isS3Object = (obj: unknown): obj is S3Object => {
	return (
		typeof obj === "object" && obj !== null && "bucket" in obj && "key" in obj
	);
};

export const parseS3Reference = (reference: S3Reference): S3Object => {
	if (isS3Object(reference)) return reference;
	if (isS3ObjectArn(reference)) return parseS3ObjectArn(reference);
	if (isS3Url(reference)) return parseS3Url(reference);

	throw new Error(`Invalid S3 reference: ${reference}`);
};

export const formatS3Reference = (
	obj: S3Object,
	format: S3ReferenceFormat,
): S3Reference => {
	if (format?.type === "object") return { ...obj, store: STORE_NAME };
	if (format?.type === "arn") return formatS3ObjectArn(obj.bucket, obj.key);
	if (format?.type === "url") return formatS3Url(obj, format.format);

	throw new Error(`Invalid reference format: ${format}`);
};
