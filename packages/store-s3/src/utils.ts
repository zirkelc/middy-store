import { S3Object } from "./store.js";

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

export const isS3Uri = (uri: unknown): uri is string => {
	return typeof uri === "string" && uri.startsWith("s3://");
};

export const parseS3Uri = (uri: string): S3Object => {
	const [_, bucket, key] = uri.match(/^s3:\/\/([^/]+)\/(.+)$/) ?? [];
	if (!isValidBucket(bucket)) throw new Error(`Invalid S3 URI: ${uri}`);
	if (!isValidKey(key)) throw new Error(`Invalid S3 URI: ${uri}`);

	return { bucket, key };
};

export const isS3Object = (obj: unknown): obj is S3Object => {
	return (
		typeof obj === "object" && obj !== null && "bucket" in obj && "key" in obj
	);
};

export const isMatch = (pattern: string | RegExp, test: string) => {
	if (pattern instanceof RegExp) {
		return pattern.test(test);
	}

	return pattern === test;
};

// Define a type that can either be a function returning type T, or a direct value of type T
type ValueOrFunction<T> = ((...args: any[]) => T) | T;

// Overload for a function with parameters
export function coerceFunction<T, Args extends any[]>(
	input: T | ((...args: Args) => T),
): (...args: Args) => T {
	return typeof input === "function"
		? (input as (...args: Args) => T)
		: (...args: Args) => input;
}
// export const resolveOption = <T,>(options: T)
