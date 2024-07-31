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
	uuidKey,
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
	config: S3ClientConfig | (() => S3ClientConfig);
	bucket: string | (() => string);
	key?: string | (() => string);
	format?: S3ReferenceFormat;
	maxSize?: number;
	logger?: Logger;
}

export const STORE_NAME = "s3" as const;

export class S3Store implements StoreInterface<unknown, S3Reference> {
	readonly name = STORE_NAME;

	#config: S3ClientConfig;
	#maxSize: number;
	// #client: S3Client;
	// #region: ResolvedFn<string>;
	#bucket: string;
	#key: () => string;
	#format: S3ReferenceFormat;
	#logger: (...args: any[]) => void;

	constructor(opts: S3StoreOptions) {
		this.#maxSize = opts.maxSize ?? Number.POSITIVE_INFINITY;
		this.#logger = opts.logger ?? (() => {});
		this.#format = opts.format ?? "url-s3-global-path";
		this.#key = resolvableFn(opts.key ?? uuidKey);

		// resolve to function and invoke it
		this.#config = resolvableFn(opts.config)();
		this.#bucket = resolvableFn(opts.bucket)();

		if (!this.#config.region) {
			this.#logger(`Invalid config: region is missing`, {
				config: this.#config,
			});
			throw new Error(`Invalid config: region is missing`);
		}

		if (!this.#bucket) {
			this.#logger("Invalid bucket", { bucket: this.#bucket });
			throw new Error(`Invalid bucket`);
		}
	}

	canLoad(args: LoadArgs<unknown>): boolean {
		this.#logger("Checking if store can load input");

		if (!isObject(args)) return false;

		const { reference } = args;

		if (isS3ObjectArn(reference)) {
			const { bucket: otherBucket } = parseS3ObjectArn(reference);
			return otherBucket === this.#bucket;
		}

		if (isS3Url(reference)) {
			const { bucket: otherBucket } = parseS3Url(reference);
			// TODO check region matches config.region?
			return otherBucket === this.#bucket;
		}

		if (isS3Object(reference)) {
			const { bucket: otherBucket } = reference;
			return otherBucket === this.#bucket;
		}

		return false;
	}

	async load(args: LoadArgs<S3Reference>): Promise<unknown> {
		this.#logger("Loading payload");

		const client = new S3Client(this.#config);

		const { reference } = args;
		const { bucket, key } = parseS3Reference(reference);
		const result = await client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);

		const payload = await this.deserializePayload(result);

		return payload;
	}

	canStore(args: StoreArgs<unknown>): boolean {
		this.#logger("Checking if store can save output");

		const { payload, byteSize } = args;

		if (this.#maxSize === 0) return false;
		if (byteSize > this.#maxSize) return false;
		if (payload === null || payload === undefined) return false;

		this.#logger("Store can save");

		return true;
	}

	public async store(args: StoreArgs<unknown>): Promise<S3Reference> {
		this.#logger("Writing payload");

		const bucket = this.#bucket;
		const region =
			typeof this.#config.region === "function"
				? await this.#config.region()
				: this.#config.region;

		const key = this.#key();
		if (!key) {
			this.#logger("Invalid key", { key });
			throw new Error(`Invalid key`);
		}

		if (
			this.#format.startsWith("url") &&
			this.#format.includes("region") &&
			!region
		) {
			throw new Error(
				`Region is required for region-specific url format: ${this.#format}`,
			);
		}

		const { payload } = args;
		this.#logger("Put object to bucket", { bucket, key });

		const client = new S3Client(this.#config);

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

		this.#logger("Wrote payload");

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
