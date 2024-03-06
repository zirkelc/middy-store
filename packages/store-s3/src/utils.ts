import { randomUUID } from "crypto";
import { S3Object, formatS3Url, isS3Url, parseS3Url } from "amazon-s3-url";
import { S3Reference, S3ReferenceFormat } from "./store.js";

export const uuidKey = () => randomUUID();

export const isValidKey = (key: unknown): key is string => {
	return typeof key === "string" && key.length > 0;
};

export const isValidBucket = (bucket: unknown) => {
	return typeof bucket === "string" && bucket.length > 0;
};

export const isS3Arn = (arn: unknown): arn is string => {
	return typeof arn === "string" && arn.startsWith("arn:aws:s3");
};

export const parseS3Arn = (arn: string): S3Object => {
	const [_, bucket, key] = arn.match(/^arn:aws:s3:::([^/]+)\/(.+)$/) ?? [];
	if (!isValidBucket(bucket)) throw new Error(`Invalid S3 ARN: ${arn}`);
	if (!isValidKey(key)) throw new Error(`Invalid S3 ARN: ${arn}`);

	return { bucket, key };
};

export const formatS3Arn = (bucket: string, key: string) => {
	return `arn:aws:s3:::${bucket}/${key}`;
};

// export const isS3Uri = (uri: unknown): uri is string => {
// 	return typeof uri === "string" && uri.startsWith("s3://");
// };

// export const parseS3Uri = (uri: string): S3Object => {
// 	const [_, bucket, key] = uri.match(/^s3:\/\/([^/]+)\/(.+)$/) ?? [];
// 	if (!isValidBucket(bucket)) throw new Error(`Invalid S3 URI: ${uri}`);
// 	if (!isValidKey(key)) throw new Error(`Invalid S3 URI: ${uri}`);

// 	return { bucket, key };
// };

// export const formatS3Uri = (bucket: string, key: string) => {
// 	return `s3://${bucket}/${key}`;
// };

export const isS3Object = (obj: unknown): obj is S3Object => {
	return (
		typeof obj === "object" && obj !== null && "bucket" in obj && "key" in obj
	);
};

export const parseS3Reference = (reference: S3Reference): S3Object => {
	if (isS3Object(reference)) return reference;
	if (isS3Arn(reference)) return parseS3Arn(reference);
	if (isS3Url(reference)) return parseS3Url(reference);

	throw new Error(`Invalid S3 reference: ${reference}`);
};

export const formatS3Reference = (
	obj: S3Object,
	format: S3ReferenceFormat,
): S3Reference => {
	if (format.type === "object") return { ...obj, store: "s3" };
	if (format.type === "arn") return formatS3Arn(obj.bucket, obj.key);
	if (format.type === "url") return formatS3Url(obj, format.format);

	throw new Error(`Invalid reference format: ${format}`);
};

export function coerceFunction<T, Args extends any[]>(
	input: T | ((...args: Args) => T),
): (...args: Args) => T {
	return typeof input === "function"
		? (input as (...args: Args) => T)
		: (...args: Args) => input;
}
