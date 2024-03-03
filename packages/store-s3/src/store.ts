import {
	GetObjectCommand,
	GetObjectCommandOutput,
	PutObjectCommand,
	PutObjectCommandInput,
	S3Client,
	S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { LoadInput, Store, StoreOptions, StoreOutput } from "middy-store";
import {
	coerceFunction,
	isMatch,
	isS3Arn,
	isS3Object,
	isS3Uri,
	isValidBucket,
	isValidKey,
	parseS3Arn,
	parseS3Uri,
} from "./utils.js";

export interface S3StoreReference {
	store: "s3";
	bucket: string;
	key: string;
	uri: string;
}

export type S3Object = {
	bucket: string;
	key: string;
};

type LoadInputOptions = {
	bucket: string | RegExp | ((input: LoadInput) => string | RegExp);
	key: string | RegExp | ((input: LoadInput) => string | RegExp);
};

type StoreOutputOptions = {
	bucket: string | ((output: StoreOutput) => string);
	key: string | ((output: StoreOutput) => string);
	format?: "ARN" | "URI" | "OBJECT";
};

export interface S3StoreOptions<TPaylod = any> extends StoreOptions {
	config?: S3ClientConfig;
	// bucket: string | ((output: StoreOutput) => string); // TODO optional?
	// key: string | ((output: StoreOutput) => string); // TODO pass full output and payload to this function to allow dynamic keys
	// format?: 'ARN' | 'URI' | 'OBJECT'; // https://stackoverflow.com/questions/44400227/how-to-get-the-url-of-a-file-on-aws-s3-using-aws-sdk/44401684#44401684
	logger?: (...args: any[]) => void;

	/**
	 *
	 */
	load?: true | false | LoadInputOptions;

	store?: false | StoreOutputOptions;
}

const MATCH_ALL = () => /.*/;

export class S3Store<TPayload = any>
	implements Store<S3StoreReference, TPayload>
{
	readonly name = "s3" as const;

	#maxSize: number;
	#client: S3Client;
	// #bucket: (output: StoreOutput) => string;
	// #key: (output: StoreOutput) => string;
	#logger: (...args: any[]) => void;

	#loadOptions: true | false | LoadInputOptions;
	#storeOptions: false | StoreOutputOptions;

	// #storeBucket: (output: StoreOutput) => string;
	// #storeKey: (output: StoreOutput) => string;

	constructor(opts: S3StoreOptions<TPayload>) {
		this.#maxSize = opts.maxSize ?? Number.POSITIVE_INFINITY;
		// this.#bucket =
		// 	typeof opts.bucket === "string"
		// 		? () => opts.bucket as string
		// 		: opts.bucket;
		// this.#key =
		// 	typeof opts.key === "string"
		// 		? () => opts.key as string
		// 		: opts.key;

		// if load options undefined, default to true
		this.#loadOptions = opts.load ?? false;
		// this.#loadOptions = opts.load ?? {
		// 	bucket: () => WILDCARD,
		// 	key: () => WILDCARD,
		// };
		// if store options undefined, default to false
		this.#storeOptions = opts.store ?? false;

		// if (opts.store === false || opts.store === undefined) {
		// 	this.#storeBucket = () => '';
		// 	this.#storeKey = () => '';
		// } else {
		// 	const { bucket, key } = opts.store;
		// 	this.#storeBucket =
		// 		typeof bucket === "function"
		// 			? bucket
		// 			: () => bucket;

		// 	this.#storeKey =
		// 		typeof key === "function"
		// 			? key
		// 			: () => key;
		// }

		this.#client = new S3Client({
			...opts.config,
		});

		this.#logger = opts.logger ?? (() => {});
	}

	canLoad(input: LoadInput<unknown>): boolean {
		this.#logger("Checking if store can load");

		// setting load options to false will disable loading completely
		if (this.#loadOptions === false) return false;

		// input must be an object
		if (input === null || input === undefined || typeof input !== "object")
			return false;

		// reference must be an object
		const { reference } = input;
		if (
			reference === null ||
			reference === undefined ||
			typeof reference !== "object"
		)
			return false;

		// resolve bucket and key from options
		// options set to true is shortcut for match-all regex pattern
		const bucketFn =
			this.#loadOptions === true
				? MATCH_ALL
				: coerceFunction(this.#loadOptions.bucket);
		const keyFn =
			this.#loadOptions === true
				? MATCH_ALL
				: coerceFunction(this.#loadOptions.key);

		const bucket = bucketFn(input);
		const key = keyFn(input);

		if (isS3Arn(reference)) {
			const { bucket: refBucket, key: refkey } = parseS3Arn(reference);

			return isMatch(bucket, refBucket) && isMatch(key, refkey);
		}

		if (isS3Uri(reference)) {
			const { bucket: refBucket, key: refkey } = parseS3Uri(reference);

			return isMatch(bucket, refBucket) && isMatch(key, refkey);
		}

		if (isS3Object(reference)) {
			const { bucket: refBucket, key: refkey } = reference;

			return isMatch(bucket, refBucket) && isMatch(key, refkey);
		}

		// const { store, bucket, key } = reference as S3StoreReference;

		// if (store !== this.name) return false;

		// // validate bucket and key
		// if (!this.isValidBucket(bucket))
		// 	throw new Error(
		// 		`Invalid bucket. Must be a string, but received: ${bucket}`,
		// 	);

		// if (!this.isValidKey(key))
		// 	throw new Error(`Invalid key. Must be a string, but received: ${key}`);

		return false;
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

		// setting store options to false will disable loading completely
		if (this.#storeOptions === false) return false;

		if (output.payload === null) return false;
		if (this.#maxSize === 0) return false;
		if (output.byteSize > this.#maxSize) return false;

		// resolve bucket and key from options
		// if buccket and key are not defined, default to WILDCARD regex pattern to match anything
		const bucketFn = coerceFunction(this.#storeOptions.bucket); // typeof this.#storeOptions.bucket === 'function' ? this.#storeOptions.bucket(output) : this.#storeOptions.bucket;
		const keyFn = coerceFunction(this.#storeOptions.key); //=== 'function' ? this.#storeOptions.key(output) : this.#storeOptions.key;

		const bucket = bucketFn(output);
		if (!isValidBucket(bucket)) {
			this.#logger("Invalid bucket", { bucket });
			throw new Error(
				`Invalid bucket. Must be a string, but received: ${bucket}`,
			);
		}

		const key = keyFn(output);
		if (!isValidKey(key)) {
			this.#logger("Invalid key", { key });
			throw new Error(`Invalid key. Must be a string, but received: ${key}`);
		}

		this.#logger("Store can store", { bucket, key });

		return true;
	}

	public async store(output: StoreOutput<TPayload>): Promise<S3StoreReference> {
		this.#logger("Storing payload", { output });

		if (this.#storeOptions === false) {
			throw new Error("Store options are disabled");
		}

		// const bucket = this.#bucket(output);
		// const key = this.#key(output);
		// const bucket = typeof this.#storeOptions.bucket === 'function' ? this.#storeOptions.bucket(output) : this.#storeOptions.bucket;
		// const key = typeof this.#storeOptions.key === 'function' ? this.#storeOptions.key(output) : this.#storeOptions.key;
		const bucketFn = coerceFunction(this.#storeOptions.bucket); // typeof this.#storeOptions.bucket === 'function' ? this.#storeOptions.bucket(output) : this.#storeOptions.bucket;
		const keyFn = coerceFunction(this.#storeOptions.key);

		const bucket = bucketFn(output);
		const key = keyFn(output);
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
