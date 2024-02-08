import {
	GetObjectCommand,
	GetObjectCommandOutput,
	PutObjectCommand,
	PutObjectCommandInput,
	S3Client
} from '@aws-sdk/client-s3';
import type { LoadInput, Store, StoreInput, StoreOptions } from "../index.js";

export interface Base64StoreReference {
	service: 'base64';
	base64: string;
}

export type Base4StorePayload = Record<string, unknown>;

export interface Base64StoreOptions<TPaylod = any> extends StoreOptions {
}

export class Base64Store implements Store<Base64StoreReference, Base4StorePayload> {
	readonly service = 'base64';


	constructor(opts?: Base64StoreOptions<Base4StorePayload>) {

	}

	canLoad(input: LoadInput<unknown>): input is LoadInput<Base64StoreReference> {
		if (typeof input.reference !== 'object' || input.reference === null) return false;
		if (!('service' in input.reference)) return false;

		const { service } = input.reference;
		if (service !== this.service) return false;

		const { base64 } = input.reference as Base64StoreReference;
		if (typeof base64 !== 'string' || base64.length === 0)
			throw new Error(`Invalid base64. Must be a string, but received: ${base64}`);

		return true;
	}

	async load(input: LoadInput<Base64StoreReference>): Promise<Base4StorePayload> {
		return JSON.parse(Buffer.from(input.reference.base64, 'base64').toString());
	}

	canStore(input: StoreInput<unknown>): boolean {
		return typeof input.payload === 'object' && input.payload !== null;
	}

	public async store(input: StoreInput<Base4StorePayload>): Promise<Base64StoreReference> {
		const base64 = Buffer.from(JSON.stringify(input.payload)).toString('base64');
		return {
			service: this.service,
			base64
		};
	}
}