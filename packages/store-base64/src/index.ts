import {
	LoadInput,
	Store,
	StoreOutput,
	StoreOptions,
	tryParseJSON,
} from "middy-input-output-store";

export interface Base64StoreReference {
	store: "base64";
	base64: string;
}

export type Base4StorePayload = any;

export interface Base64StoreOptions<TPaylod = any> extends StoreOptions { }

export class Base64Store
	implements Store<Base64StoreReference, Base4StorePayload>
{
	readonly name = "base64" as const;

	constructor(opts?: Base64StoreOptions<Base4StorePayload>) { }

	canLoad(input: LoadInput<unknown>): input is LoadInput<Base64StoreReference> {
		if (typeof input.reference !== "object" || input.reference === null)
			return false;
		if (!("store" in input.reference)) return false;

		const { store } = input.reference;
		if (store !== this.name) return false;

		const { base64 } = input.reference as Base64StoreReference;
		if (typeof base64 !== "string" || base64.length === 0)
			throw new Error(
				`Invalid base64. Must be a string, but received: ${base64}`,
			);

		return true;
	}

	async load(
		input: LoadInput<Base64StoreReference>,
	): Promise<Base4StorePayload> {
		const { base64 } = input.reference;
		const str = Buffer.from(base64, "base64").toString("utf8");
		const payload = tryParseJSON(str);

		return payload === false ? str : payload;
	}

	canStore(output: StoreOutput<unknown>): boolean {
		return typeof output.payload === "object" && output.payload !== null;
	}

	public async store(
		output: StoreOutput<Base4StorePayload>,
	): Promise<Base64StoreReference> {
		const { payload } = output;
		const str = typeof payload === "object" ? JSON.stringify(payload) : payload;
		const base64 = Buffer.from(str).toString("base64");

		return {
			store: this.name,
			base64,
		};
	}
}
