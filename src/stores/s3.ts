import {
	GetObjectCommand,
	GetObjectCommandOutput,
	PutObjectCommand,
	PutObjectCommandInput,
	S3Client
} from '@aws-sdk/client-s3';
import type { LoadInput, Store, StoreInput, StoreOptions, StorePayload, StoreReference } from "..";

export interface S3StoreReference extends StoreReference {
	service: 's3';
	bucket: string;
	key: string;
	uri: string;
}

export interface S3StoreOptions<TPaylod extends StorePayload> extends StoreOptions {
	bucket: string | ((input: StoreInput<TPaylod>) => string);
	key: string | ((input: StoreInput<TPaylod>) => string);
	// uriFormat?: 's3' | 's3+http' | 's3+https'; // https://stackoverflow.com/questions/44400227/how-to-get-the-url-of-a-file-on-aws-s3-using-aws-sdk/44401684#44401684
}

export class S3Store<TPayload extends StorePayload> implements Store<S3StoreReference, TPayload> {
	readonly service = 's3';
	readonly maxSize = Number.POSITIVE_INFINITY;

	#client: S3Client;
	#bucket: string | ((input: StoreInput<TPayload>) => string);
	#key: string | ((input: StoreInput<TPayload>) => string);

	constructor(opts: S3StoreOptions<TPayload>) {
		this.maxSize = opts.maxSize ?? Number.POSITIVE_INFINITY;
		this.#client = new S3Client({});
		this.#bucket = opts.bucket;
		this.#key = opts.key;
	}

	canLoad({ reference }: LoadInput<S3StoreReference>): boolean {
		if (reference.service !== this.service) return false;

		if (!this.isValidBucket(reference.bucket))
			throw new Error(`Invalid bucket. Must be a string, but received: ${reference.bucket}`);

		if (!this.isValidKey(reference.key))
			throw new Error(`Invalid key. Must be a string, but received: ${reference.key}`);

		return true;
	}

	async load({ reference }: LoadInput<S3StoreReference>): Promise<TPayload> {
		const { bucket, key } = reference;
		const result = await this.#client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

		const payload = await this.deserializePayload(result);

		return payload;
	}

	canStore({ byteSize, typeOf }: StoreInput<TPayload>): boolean {
		return byteSize <= this.maxSize;
	}

	public async store({ payload }: StoreInput<TPayload>): Promise<S3StoreReference> {
		const bucket = typeof this.#bucket === 'function' ? this.#bucket(payload) : this.#bucket;
		if (!this.isValidBucket(bucket))
			throw new Error(`Invalid bucket. Must be a string, but received: ${bucket}`);

		const key = typeof this.#key === 'function' ? this.#key(payload) : this.#key
		if (!this.isValidKey(key))
			throw new Error(`Invalid key. Must be a string, but received: ${key}`);

		if (!this.isValidPayload(payload))
			throw new Error(`Invalid payload. Must be string or object, but received type: ${typeof payload}`);


		await this.#client.send(new PutObjectCommand({
			...this.serizalizePayload(payload),
			Bucket: bucket,
			Key: key,
		}));

		return {
			service: this.service,
			bucket,
			key,
			uri: this.formatUri(bucket, key),
		};
	}

	private isValidKey(key: unknown) {
		return typeof key !== 'string' || key.length === 0
	}

	private isValidBucket(bucket: unknown) {
		return typeof bucket === 'string' && bucket.length > 0;
	}

	private isValidPayload(payload: unknown) {
		return typeof payload === 'string' || typeof payload === 'object';
	}

	private serizalizePayload(payload: TPayload): Partial<PutObjectCommandInput> {
		if (typeof payload === 'string')
			return {
				Body: payload,
				ContentType: 'text/plain',
			};

		if (typeof payload === 'object')
			return {
				Body: JSON.stringify(payload),
				ContentType: 'application/json',
			};

		throw new Error(`Unsupported payload type: ${typeof payload}`);
	}

	private async deserializePayload(result: GetObjectCommandOutput): Promise<TPayload> {
		const { Body, ContentType } = result;

		if (ContentType === 'text/plain') {
			const payload = await Body?.transformToString('utf-8');
			if (payload === undefined) throw new Error('Payload is undefined');

			return payload as TPayload;
		}

		if (ContentType === 'application/json') {
			const payload = await Body?.transformToString('utf-8');
			if (payload === undefined) throw new Error('Payload is undefined');

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