import {
	type ReadInput,
	type Store,
	type StoreOptions,
	type WriteOutput,
	isObject,
	tryParseJSON,
} from "middy-store";

export interface Base64StoreReference {
	store: "base64";
	base64: string;
}

export type Base4StorePayload = any;

export interface Base64StoreOptions<TInput = unknown, TOutput = unknown>
	extends StoreOptions {}

export class Base64Store<TInput = unknown, TOutput = unknown>
	implements Store<TInput, TOutput, Base64StoreReference>
{
	readonly name = "base64" as const;

	constructor(opts?: Base64StoreOptions<TInput, TOutput>) {}

	canRead(input: ReadInput<TInput, unknown>): boolean {
		// input must be an object
		if (!isObject(input)) return false;

		// reference must be defined
		if (input.reference === null || input.reference === undefined) return false;

		const reference = input.reference as Base64StoreReference;
		if (reference.store !== this.name) return false;

		if (
			!reference.base64 ||
			typeof reference.base64 !== "string" ||
			reference.base64.length === 0
		)
			throw new Error(
				`Invalid base64. Must be a string, but received: ${reference.base64}`,
			);

		return true;
	}

	async read(
		input: ReadInput<TInput, Base64StoreReference>,
	): Promise<Base4StorePayload> {
		const reference = input.reference as Base64StoreReference;
		const decoded = Buffer.from(reference.base64, "base64").toString("utf8");
		const parsed = tryParseJSON(decoded);

		return parsed === false ? decoded : parsed;
	}

	canWrite(output: WriteOutput<TInput, TOutput>): boolean {
		return typeof output.payload === "object" && output.payload !== null;
	}

	public async write(
		output: WriteOutput<TInput, TOutput>,
	): Promise<Base64StoreReference> {
		const { payload } = output;
		const stringified =
			typeof payload === "object" ? JSON.stringify(payload) : payload;
		const base64 = Buffer.from(stringified).toString("base64");

		return {
			store: this.name,
			base64,
		};
	}
}
