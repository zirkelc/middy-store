import { S3Client } from "@aws-sdk/client-s3";
import {
	type S3Object,
	type S3UrlFormat,
	formatS3Url,
	isS3Url,
	parseS3Url,
} from "amazon-s3-url";
import {
	type S3Reference,
	type S3ReferenceFormat,
	STORE_NAME,
} from "./store.js";

export const isS3ObjectArn = (arn: unknown): arn is string => {
	return (
		typeof arn === "string" && arn.startsWith("arn:aws:s3") && arn.includes("/")
	);
};

export const parseS3ObjectArn = (arn: string): S3Object => {
	const [_, bucket, key] = arn.match(/^arn:aws:s3:::([^/]+)\/(.+)$/) ?? [];
	if (!bucket?.trim()) throw new Error(`Invalid S3 ARN: ${arn}`);
	if (!key?.trim()) throw new Error(`Invalid S3 ARN: ${arn}`);

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

export const parseS3Reference = (reference: unknown): S3Object => {
	if (isS3Object(reference)) return reference;
	if (isS3ObjectArn(reference)) return parseS3ObjectArn(reference);
	if (isS3Url(reference)) return parseS3Url(reference);

	throw new Error(`Invalid reference: ${reference}`);
};

export const formatS3Reference = (
	obj: S3Object,
	format: S3ReferenceFormat,
): S3Reference => {
	if (format === "object") return { ...obj, store: STORE_NAME };
	if (format === "arn") return formatS3ObjectArn(obj.bucket, obj.key);
	if (format.startsWith("url")) {
		const s3UrlFormat = format.slice(4) as S3UrlFormat;
		return formatS3Url(obj, s3UrlFormat);
	}

	throw new Error(`Invalid reference format: ${format}`);
};
