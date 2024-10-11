import { randomUUID } from "node:crypto";
import {
	GetObjectCommand,
	type GetObjectCommandOutput,
	PutObjectCommand,
	type PutObjectCommandInput,
	S3Client,
	type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { S3UrlFormat } from "amazon-s3-url";
import {
	type LoadArgs,
	type Logger,
	Sizes,
	type StoreArgs,
	type StoreInterface,
	isObject,
	resolvableFn,
} from "middy-store";
import { formatS3Reference, parseS3Reference } from "./utils.js";

export type S3Reference = S3ArnReference | S3UriReference | S3ObjectReference;

export type S3ArnReference = string;

export type S3UriReference = string;

export type S3ReferenceFormat = "arn" | "object" | `url-${S3UrlFormat}`;

export interface S3ObjectReference {
	store: "s3";
	bucket: string;
	key: string;
	region?: string;
}

type S3KeyArgs<TPayload> = { payload: TPayload };

/**
 * The options for the `S3Store`.
 */
export interface S3StoreOptions<TPayload = unknown> {
	/**
	 * The S3 client configuration.
	 * Can be a static object or a function that returns the configuration.
	 */
	config?: S3ClientConfig | (() => S3ClientConfig);
	/**
	 * The name of the bucket to store the payload in.
	 * Can be a static string or a function that returns the bucket name.
	 */
	bucket: string | (() => string);
	/**
	 * The key to store the payload in the bucket.
	 * Can be a static string or a function that receives the payload as an argument and returns a string.
	 * Defaults to `randomUUID()`.
	 *
	 * @example
	 * ```typescript
	 * {
	 *   key: ({ payload }) => `${payload.id}`
	 * }
	 * ```
	 */
	key?: string | ((args: S3KeyArgs<TPayload>) => string);
	/**
	 * The format of the S3 reference.
	 * Defaults to the `url-s3-global-path` format: `s3://<bucket>/<...keys>`.
	 */
	format?: S3ReferenceFormat;
	/**
	 * The maximum payload size in bytes that can be stored in S3.
	 * Defaults to `Infinity`.
	 */
	maxSize?: number;
	/**
	 * The logger function to use for logging.
	 * Defaults to no logging.
	 */
	logger?: Logger;
}

export const STORE_NAME = "s3" as const;

export class S3Store<TPayload = unknown>
	implements StoreInterface<TPayload, S3Reference>
{
	readonly name = STORE_NAME;

	#config: () => S3ClientConfig;
	#bucket: () => string;
	#key: (args: S3KeyArgs<TPayload>) => string;
	#logger: (...args: any[]) => void;
	#maxSize: number;
	#format: S3ReferenceFormat;

	constructor(opts: S3StoreOptions<TPayload>) {
		this.#maxSize = opts.maxSize ?? Sizes.INFINITY;
		this.#logger = opts.logger ?? (() => {});
		this.#format = opts.format ?? "url-s3-global-path";

		this.#config = resolvableFn(opts.config ?? {});
		this.#bucket = resolvableFn(opts.bucket);
		this.#key = resolvableFn(opts.key ?? (() => randomUUID()));
	}

	canLoad(args: LoadArgs<unknown>): boolean {
		this.#logger(`Checking if store can load`);

		if (!isObject(args)) return false;

		const { reference } = args;

		try {
			const { bucket } = parseS3Reference(reference);

			this.#logger(`Store can load from bucket ${bucket}`);

			return true;
		} catch (error) {
			this.#logger(`Reference ${reference} is not an S3 reference`);
			return false;
		}
	}

	async load(args: LoadArgs<S3Reference>): Promise<TPayload> {
		this.#logger("Loading payload");

		const client = this.getClient();

		const { reference } = args;
		const { bucket, key } = parseS3Reference(reference);
		this.#logger(`Loading payload from reference ${reference}`);

		const result = await client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);

		const payload = await this.deserializePayload(result);

		this.#logger(`Loaded payload from bucket ${bucket} and key ${key}`);

		return payload as TPayload;
	}

	canStore(args: StoreArgs<unknown>): boolean {
		this.#logger("Checking if store can store output");

		const { payload, byteSize } = args;

		if (this.#maxSize === 0) return false;
		if (byteSize > this.#maxSize) return false;
		if (payload === null || payload === undefined) return false;

		const bucket = this.getBucket();

		this.#logger(`Store can store output to bucket ${bucket}`);

		return true;
	}

	public async store(args: StoreArgs<TPayload>): Promise<S3Reference> {
		this.#logger("Storing payload");

		const { payload } = args;
		const bucket = this.getBucket();
		const key = this.getKey({ payload });
		const client = this.getClient();

		this.#logger(`Storing payload to bucket ${bucket} and key ${key}`);

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

		// S3Client resolves the region if it was not provided by the config object
		const region =
			typeof client.config.region === "function"
				? await client.config.region()
				: client.config.region;

		const reference = formatS3Reference({ bucket, key, region }, this.#format);
		this.#logger(`Stored payload to reference ${reference}`);

		return reference;
	}

	private getBucket(): string {
		const bucket = this.#bucket();
		if (!bucket) {
			this.#logger("Invalid bucket", { bucket });
			throw new Error(`Invalid bucket: ${bucket}`);
		}

		return bucket;
	}

	private getKey(args: S3KeyArgs<TPayload>): string {
		const key = this.#key(args);
		if (!key) {
			this.#logger("Invalid key", { key });
			throw new Error(`Invalid key: ${key}`);
		}

		return key;
	}

	private getClient(): S3Client {
		const config = this.#config();
		const client = new S3Client(config);

		return client;
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

		// TODO check for charset encoding
		if (ContentType?.startsWith("text/plain")) {
			const payload = await Body?.transformToString("utf-8");
			if (payload === undefined) throw new Error("Payload is undefined");

			return payload;
		}

		if (ContentType?.startsWith("application/json")) {
			const payload = await Body?.transformToString("utf-8");
			if (payload === undefined) throw new Error("Payload is undefined");

			return JSON.parse(payload);
		}

		// TODO handle other content types like 'application/octet-stream'

		throw new Error(`Unsupported payload type: ${ContentType}`);
	}
}
