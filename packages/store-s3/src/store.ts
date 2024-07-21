import {
	GetObjectCommand,
	type GetObjectCommandOutput,
	PutObjectCommand,
	type PutObjectCommandInput,
	S3Client,
	type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { type S3UrlFormat, isS3Url, parseS3Url } from "amazon-s3-url";
import {
	type ReadInput,
	type Resolveable,
	type Store,
	type StoreOptions,
	type WriteOutput,
	isObject,
	resolvableFn,
} from "middy-store";
import {
	formatS3Reference,
	isS3Object,
	isS3ObjectArn,
	isValidBucket,
	isValidKey,
	parseS3ObjectArn,
	parseS3Reference,
	uuidKey,
} from "./utils.js";

export type S3Reference = S3ArnReference | S3UriReference | S3ObjectReference;

export type S3ArnReference = string;

export type S3UriReference = string;

export type S3ReferenceFormat =
	| { type: "arn" }
	| { type: "object" }
	| { type: "url"; format: S3UrlFormat };

export interface S3ObjectReference {
	store: "s3";
	bucket: string;
	key: string;
	region?: string;
}

export type Bucket = Resolveable<string>;

export type Region = Resolveable<string>;

// export type KeyMaker<TInput = unknown, TOutput = unknown> =
// 	| string
// 	| ((output: WriteOutput<TInput, TOutput>) => string);

export type KeyMakerArgs<TInput = unknown, TOutput = unknown> = WriteOutput<
	TInput,
	TOutput
>;
export type KeyMaker<TInput = unknown, TOutput = unknown> = Resolveable<
	string,
	[KeyMakerArgs<TInput, TOutput>]
>;

export interface S3StoreOptions<TInput = unknown, TOutput = unknown>
	extends StoreOptions {
	config?: S3ClientConfig;
	region?: Region;
	bucket: Bucket;
	key?: KeyMaker<TInput, TOutput>;
	format?: "arn" | "object" | "url" | S3ReferenceFormat; // https://stackoverflow.com/questions/44400227/how-to-get-the-url-of-a-file-on-aws-s3-using-aws-sdk/44401684#44401684
	logger?: (...args: any[]) => void;
}

export const STORE_NAME = "s3" as const;

export class S3Store<TInput = unknown, TOutput = unknown>
	implements Store<TInput, TOutput, S3Reference>
{
	readonly name = STORE_NAME;

	#config: S3ClientConfig;
	#maxSize: number;
	// #client: S3Client;
	#region: Region | undefined;
	#bucket: Bucket;
	#key: KeyMaker<TInput, TOutput>;
	#format: S3ReferenceFormat;
	#logger: (...args: any[]) => void;

	// onLoad?: (input: LoadInput<S3Reference>) => boolean | GetObjectCommandInput;
	// onStore?: (output: StoreOutput) => boolean | PutObjectCommandInput;

	constructor(opts: S3StoreOptions<TInput, TOutput>) {
		this.#config = opts.config ?? {};
		this.#maxSize = opts.maxSize ?? Number.POSITIVE_INFINITY;
		this.#bucket = opts.bucket;
		this.#key = opts.key ?? uuidKey;
		this.#region = opts.region;

		this.#logger = opts.logger ?? (() => {});

		this.#format =
			opts.format === undefined
				? { type: "url", format: "s3-global-path" }
				: opts.format === "url"
					? { type: "url", format: "s3-global-path" }
					: opts.format === "arn"
						? { type: "arn" }
						: opts.format === "object"
							? { type: "object" }
							: opts.format;
	}

	canRead(input: ReadInput<TInput, unknown>): boolean {
		this.#logger("Checking if store can load input");

		// input must be an object
		if (!isObject(input)) return false;

		// reference must be defined
		if (input.reference === null || input.reference === undefined) return false;

		const reference = input.reference as S3Reference;
		const bucketFn = resolvableFn(this.#bucket);
		const bucket = this.#bucket();

		if (isS3ObjectArn(reference)) {
			const { bucket: otherBucket } = parseS3ObjectArn(reference);
			return otherBucket === bucket;
		}

		if (isS3Url(reference)) {
			const { bucket: otherBucket } = parseS3Url(reference);
			// TODO check region matches config.region?
			return otherBucket === bucket;
		}

		if (isS3Object(reference)) {
			const { bucket: otherBucket } = reference;
			return otherBucket === bucket;
		}

		return false;
	}

	async read(input: ReadInput<TInput, S3Reference>): Promise<unknown> {
		this.#logger("Loading payload");

		const regionFn = resolvableFn(this.#region);
		const region = regionFn();

		const client = new S3Client({
			...this.#config,
			region: region ?? this.#config.region,
		});

		const { bucket, key } = parseS3Reference(input.reference);
		const result = await client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);

		const payload = await this.deserializePayload(result);

		return payload;
	}

	canWrite(output: WriteOutput<TInput, TOutput>): boolean {
		this.#logger("Checking if store can save output");

		// setting store options to false will disable loading completely
		// if (this.#storeOptions === false) return false;

		if (this.#maxSize === 0) return false;
		if (output.byteSize > this.#maxSize) return false;
		if (output.payload === null || output.payload === undefined) return false;

		const bucketFn = resolvableFn(this.#bucket);
		const bucket = bucketFn();
		if (!isValidBucket(bucket)) {
			this.#logger("Invalid bucket", { bucket });
			throw new Error(
				`Invalid bucket. Must be a string, but received: ${bucket}`,
			);
		}

		const keyFn = resolvableFn(this.#key);
		const key = keyFn(output);
		if (!isValidKey(key)) {
			this.#logger("Invalid key", { key });
			throw new Error(`Invalid key. Must be a string, but received: ${key}`);
		}

		this.#logger("Store can save", { bucket, key });

		return true;
	}

	public async write(
		output: WriteOutput<TInput, TOutput>,
	): Promise<S3Reference> {
		this.#logger("Saving payload");

		const regionFn = resolvableFn(this.#region);
		const region = regionFn();

		const bucketFn = resolvableFn(this.#bucket);
		const bucket = bucketFn();

		const keyFn = resolvableFn(this.#key);
		const key = keyFn(output);

		if (
			this.#format.type === "url" &&
			this.#format.format.includes("region") &&
			!region
		) {
			throw new Error(
				`Region is required for region-specific url format: ${this.#format.format}`,
			);
		}

		const { payload } = output;
		this.#logger("Resolved bucket and key", { bucket, key, region });

		const client = new S3Client({
			...this.#config,
			region: region ?? this.#config.region,
		});

		try {
			await client.send(
				new PutObjectCommand({
					...this.serizalizePayload(payload),
					Bucket: bucket,
					Key: key,
				}),
			);
		} catch (error) {
			this.#logger("Error during put object", { error });
			throw error;
		}

		this.#logger("Sucessfully saved payload");

		return formatS3Reference({ bucket, key, region }, this.#format);
	}

	private serizalizePayload(payload: unknown): Partial<PutObjectCommandInput> {
		if (typeof payload === "string")
			return {
				Body: payload,
				ContentType: "text/plain",
			};

		if (typeof payload === "object")
			return {
				Body: JSON.stringify(payload),
				ContentType: "application/json",
			};

		throw new Error(`Unsupported payload type: ${typeof payload}`);
	}

	private async deserializePayload(
		result: GetObjectCommandOutput,
	): Promise<unknown> {
		const { Body, ContentType } = result;

		if (ContentType === "text/plain") {
			const payload = await Body?.transformToString("utf-8");
			if (payload === undefined) throw new Error("Payload is undefined");

			return payload as unknown;
		}

		if (ContentType === "application/json") {
			const payload = await Body?.transformToString("utf-8");
			if (payload === undefined) throw new Error("Payload is undefined");

			return JSON.parse(payload) as unknown;
		}

		// if (ContentType?.startsWith('application/octet-stream')) {
		// 	const payload = await Body?.transformToString('utf-8');
		// 	const json = tryParseJSON(payload);
		// 	if (json) return json as TPaylod;

		// 	// content is not json, let the flow continue
		// }

		throw new Error(`Unsupported payload type: ${ContentType}`);
	}
}
