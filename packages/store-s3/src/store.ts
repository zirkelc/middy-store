import {
	GetObjectCommand,
	GetObjectCommandOutput,
	PutObjectCommand,
	PutObjectCommandInput,
	S3Client,
	S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { LoadInput, Store, StoreOptions, StoreOutput } from "middy-store";

export interface S3StoreReference {
	store: "s3";
	bucket: string;
	key: string;
	uri: string;
}

export interface S3StoreOptions<TPaylod = any> extends StoreOptions {
	config?: S3ClientConfig;
	bucket: string | (() => string);
	key: string | (() => string); // TODO pass full output and payload to this function to allow dynamic keys
	// uriFormat?: 's3' | 's3+http' | 's3+https'; // https://stackoverflow.com/questions/44400227/how-to-get-the-url-of-a-file-on-aws-s3-using-aws-sdk/44401684#44401684
	logger?: (...args: any[]) => void;
}

export class S3Store<TPayload = any>
	implements Store<S3StoreReference, TPayload>
{
	readonly name = "s3" as const;

	#maxSize: number;
	#client: S3Client;
	#bucket: () => string;
	#key: () => string;
	#logger: (...args: any[]) => void;

	constructor(opts: S3StoreOptions<TPayload>) {
		this.#maxSize = opts.maxSize ?? Number.POSITIVE_INFINITY;
		this.#bucket =
			typeof opts.bucket === "string"
				? () => opts.bucket as string
				: opts.bucket;
		this.#key =
			typeof opts.key === "string" ? () => opts.key as string : opts.key;

		this.#client = new S3Client({
			...opts.config,
		});

		this.#logger = opts.logger ?? (() => {});
	}

	canLoad(input: LoadInput<unknown>): boolean {
		if (input === null || input === undefined || typeof input !== "object")
			return false;

		const { reference } = input;
		if (
			reference === null ||
			reference === undefined ||
			typeof reference !== "object"
		)
			return false;

		const { store, bucket, key } = reference as S3StoreReference;
		if (store !== this.name) return false;

		if (!this.isValidBucket(bucket))
			throw new Error(
				`Invalid bucket. Must be a string, but received: ${bucket}`,
			);

		if (!this.isValidKey(key))
			throw new Error(`Invalid key. Must be a string, but received: ${key}`);

		return true;
	}

	async load(input: LoadInput<S3StoreReference>): Promise<TPayload> {
		const { bucket, key } = input.reference;
		const result = await this.#client.send(
			new GetObjectCommand({ Bucket: bucket, Key: key }),
		);

		const payload = await this.deserializePayload(result);

		return payload;
	}

	canStore(output: StoreOutput<unknown>): boolean {
		this.#logger("Checking if store can store", { output });

		if (output.payload === null) return false;
		if (this.#maxSize === 0) return false;
		if (output.byteSize > this.#maxSize) return false;
		if (output.typeOf !== "string" && output.typeOf !== "object") return false;

		const bucket = this.#bucket();
		if (!this.isValidBucket(bucket)) {
			this.#logger("Invalid bucket", { bucket });
			throw new Error(
				`Invalid bucket. Must be a string, but received: ${bucket}`,
			);
		}

		const key = this.#key();
		if (!this.isValidKey(key)) {
			this.#logger("Invalid key", { key });
			throw new Error(`Invalid key. Must be a string, but received: ${key}`);
		}

		this.#logger("Store can store", { bucket, key });

		return true;
	}

	public async store(output: StoreOutput<TPayload>): Promise<S3StoreReference> {
		this.#logger("Storing payload", { output });

		const bucket = this.#bucket();
		const key = this.#key();
		const { payload } = output;
		this.#logger("Resolved bucket and key", { bucket, key });

		try {
			await this.#client.send(
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

		this.#logger("Sucessfully stored payload", { bucket, key });

		return {
			store: this.name,
			bucket,
			key,
			uri: this.formatUri(bucket, key),
		};
	}

	private isValidKey(key: unknown) {
		return typeof key === "string" && key.length > 0;
	}

	private isValidBucket(bucket: unknown) {
		return typeof bucket === "string" && bucket.length > 0;
	}

	private serizalizePayload(payload: TPayload): Partial<PutObjectCommandInput> {
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
	): Promise<TPayload> {
		const { Body, ContentType } = result;

		if (ContentType === "text/plain") {
			const payload = await Body?.transformToString("utf-8");
			if (payload === undefined) throw new Error("Payload is undefined");

			return payload as TPayload;
		}

		if (ContentType === "application/json") {
			const payload = await Body?.transformToString("utf-8");
			if (payload === undefined) throw new Error("Payload is undefined");

			return JSON.parse(payload) as TPayload;
		}

		// if (ContentType?.startsWith('application/octet-stream')) {
		// 	const payload = await Body?.transformToString('utf-8');
		// 	const json = tryParseJSON(payload);
		// 	if (json) return json as TPaylod;

		// 	// content is not json, let the flow continue
		// }

		throw new Error(`Unsupported payload type: ${ContentType}`);
	}

	private formatUri(bucket: string, key: string) {
		return `s3://${bucket}/${key}`;
	}
}
