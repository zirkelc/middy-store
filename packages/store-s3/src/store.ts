import { randomUUID } from "node:crypto";
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
	type LoadArgs,
	type Logger,
	Sizes,
	type StoreArgs,
	type StoreInterface,
	isObject,
	resolvableFn,
} from "middy-store";
import {
	formatS3Reference,
	isS3Object,
	isS3ObjectArn,
	parseS3ObjectArn,
	parseS3Reference,
} from "./utils.js";

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

export interface S3StoreOptions {
	config?: S3ClientConfig | (() => S3ClientConfig);
	bucket: string | (() => string);
	key?: string | (() => string);
	format?: S3ReferenceFormat;
	maxSize?: number;
	logger?: Logger;
}

export const STORE_NAME = "s3" as const;

export class S3Store implements StoreInterface<unknown, S3Reference> {
	readonly name = STORE_NAME;

	#config: () => S3ClientConfig;
	#bucket: () => string;
	#key: () => string;
	#logger: (...args: any[]) => void;
	#maxSize: number;
	#format: S3ReferenceFormat;

	constructor(opts: S3StoreOptions) {
		this.#maxSize = opts.maxSize ?? Sizes.INFINITY;
		this.#logger = opts.logger ?? (() => {});
		this.#format = opts.format ?? "url-s3-global-path";

		this.#config = resolvableFn(opts.config ?? {});
		this.#bucket = resolvableFn(opts.bucket);
		this.#key = resolvableFn(opts.key ?? randomUUID);
	}

	canLoad(args: LoadArgs<unknown>): boolean {
		this.#logger(`Checking if store can load`);

		if (!isObject(args)) return false;

		const { reference } = args;

		const thisBucket = this.#bucket();
		if (!thisBucket) {
			this.#logger("Invalid bucket", { thisBucket });
			throw new Error(`Invalid bucket: ${thisBucket}`);
		}

		let otherBucket = "";

		if (isS3ObjectArn(reference)) {
			const { bucket } = parseS3ObjectArn(reference);
			otherBucket = bucket;

			this.#logger(`Parsed reference ARN ${reference} to ${bucket}`);
		}

		if (isS3Url(reference)) {
			const { bucket } = parseS3Url(reference);
			otherBucket = bucket;

			this.#logger(`Parsed reference URL ${reference} to bucket ${bucket}`);
		}

		if (isS3Object(reference)) {
			const { bucket } = reference;
			otherBucket = bucket;

			this.#logger(
				`Parsed reference object ${JSON.stringify(reference)} to bucket ${bucket}`,
			);
		}

		const canLoad = thisBucket === otherBucket;
		this.#logger(canLoad ? "Store can load" : "Store cannot load");

		return canLoad;
	}

	async load(args: LoadArgs<S3Reference>): Promise<unknown> {
		this.#logger("Loading payload");

		const config = this.#config();
		const client = new S3Client(config);

		const { reference } = args;
		const { bucket, key } = parseS3Reference(reference);
		const result = await client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);

		const payload = await this.deserializePayload(result);

		return payload;
	}

	canStore(args: StoreArgs<unknown>): boolean {
		this.#logger("Checking if store can store output");

		const { payload, byteSize } = args;

		if (this.#maxSize === 0) return false;
		if (byteSize > this.#maxSize) return false;
		if (payload === null || payload === undefined) return false;

		const thisBucket = this.#bucket();
		if (!thisBucket) {
			this.#logger("Invalid bucket", { thisBucket });
			throw new Error(`Invalid bucket: ${thisBucket}`);
		}

		this.#logger("Store can store");

		return true;
	}

	public async store(args: StoreArgs<unknown>): Promise<S3Reference> {
		this.#logger("Storing payload");

		const bucket = this.#bucket();
		if (!bucket) {
			this.#logger("Invalid bucket", { bucket });
			throw new Error(`Invalid bucket: ${bucket}`);
		}

		const key = this.#key();
		if (!key) {
			this.#logger("Invalid key", { key });
			throw new Error(`Invalid key: ${key}`);
		}

		const { payload } = args;
		this.#logger("Put object to bucket", { bucket, key });

		const config = this.#config();
		const client = new S3Client(config);

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

		const region =
			typeof config.region === "function"
				? await config.region()
				: config.region;

		this.#logger("Stored payload");

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

		// TODO handle other content types like 'application/octet-stream'

		throw new Error(`Unsupported payload type: ${ContentType}`);
	}
}
