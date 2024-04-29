import middy from "@middy/core";
import {
	MAX_SIZE_STEPFUNCTIONS,
	calculateByteSize,
	formatPath,
	generatePayloadPaths,
	generateReferencePaths,
	replaceByPath,
	selectByPath,
	sizeToNumber,
} from "./utils.js";

// https://middy.js.org/docs/writing-middlewares/configurable-middlewares

export const MIDDY_STORE = "@middy-store";

export type MiddyStore<TReference> = {
	[MIDDY_STORE]: TReference;
};

export type Payload<TPayload = any> = TPayload;
export type Reference<TReference = any> = TReference;

// https://lodash.com/docs/4.17.15#get
export type Path = string;

// TODO: add support for payload[]
export type InputSelector<TInput> = Path | ((args: { input: TInput }) => any);
export type InputReplacer<TInput> = Path | ((args: { input: TInput }) => any);

// TODO: add support for payload[]
export type OutputSelector<TInput, TOutput> = Path;
//| ((args: { input: TInput; output: TOutput }) => any);
export type OutputReplacer<TInput, TOutput> = Path;
// | ((args: {
// 	input: TInput;
// 	output: TOutput;
// 	reference: MiddyStore<any>;
// }) => any);

export type Size =
	| number
	| "always"
	| "never"
	| "stepfunctions"
	| "lambda-sync"
	| "lambda-async";

export type OutputSize<TInput, TOutput> =
	| Size
	| ((args: { input: TInput; output: TOutput }) => Size);

export type StoreOptions = {
	maxSize?: number;
};

export type WriteOutput<TInput = unknown, TOutput = unknown> = {
	input: TInput;
	output: TOutput;
	payload: any;
	byteSize: number;
	index: number; // if there are multiple payloads
};

export type ReadInput<TInput = unknown, TReference = unknown> = {
	input: TInput;
	reference: TReference;
};

// export interface Store<TInput = unknown, TOutput = unknown> {
// 	name: string;
// 	canLoad?: (input: LoadInput<TInput>) => boolean;
// 	load?: (input: LoadInput<TInput>) => Promise<Payload>;
// 	canStore?: (output: StoreOutput<TInput, TOutput>) => boolean;
// 	store?: (output: StoreOutput<TInput, TOutput>) => Promise<Reference>;
// }

export interface Store<
	TInput = unknown,
	TOutput = unknown,
	TReference = unknown,
> extends ReadableStore<TInput, TOutput, TReference>,
		WritableStore<TInput, TOutput, TReference> {
	name: string;
}

export interface ReadableStore<
	TInput = unknown,
	TOutput = unknown,
	TReference = unknown,
> {
	name: string;
	canRead: (input: ReadInput<TInput, TReference | unknown>) => boolean;
	read: (input: ReadInput<TInput, TReference>) => Promise<Payload>;
}

export interface WritableStore<
	TInput = unknown,
	TOutput = unknown,
	TReference = unknown,
> {
	name: string;
	canWrite: (output: WriteOutput<TInput, TOutput>) => boolean;
	write: (output: WriteOutput<TInput, TOutput>) => Promise<TReference>;
}

export interface MiddyStoreOptions<TInput = unknown, TOutput = unknown> {
	stores: Array<
		| Store<TInput, TOutput>
		| ReadableStore<TInput, TOutput>
		| WritableStore<TInput, TOutput>
	>;
	read?: boolean | ReadStoreOptions<TInput>;
	write?: boolean | WriteStoreOptions<TInput, TOutput>;
	logger?: (...args: any[]) => void;
	passThrough?: boolean;
}

export interface ReadStoreOptions<TInput> {
	// selector?: InputSelector<TInput>; // TODO
}

export interface WriteStoreOptions<TInput, TOutput> {
	/**
	 * Selects the payload that should be saved in the store.
	 *
	 * If no selector is specified, the entire output will be saved in the store.
	 * Then, the entire output will be replaced with a reference to the stored payload.
	 * This is the same behavior as if the selector is undefined or an an empty string.
	 *
	 * If a selector is specified, only this part of the output will be saved in the store.
	 * Then, the selected payload will be replaced with a reference to the stored payload.
	 * It uses Lodash's get function {@link https://lodash.com/docs/4.17.15#get | _.get() } to select the payload from the output.
	 *
	 * If the selector ends withs `[*]` and the selected payload is an array, then each element of the array will be saved in the store separately.
	 * That means each element of the array will be replaced with a reference to the stored payload.
	 *
	 * Examples:
	 * ```
	 * selector: ''; // selects the entire output as the payload
	 * selector: 'a'; // selects the payload at the path 'a'
	 * selector: 'a.b[0]'; // selects the payload at the path 'a.b[0]'
	 * selector: 'a.b[*]; // selects the payloads at the paths 'a.b[0], 'a.b[1]', 'a.b[2]', etc.
	 * ```
	 */
	selector?: OutputSelector<TInput, TOutput>;

	size?: OutputSize<TInput, TOutput>;
}

const DEFAULT_OUTPUT_SELECTOR = "";
const DEFAULT_DUMMY_LOGGER = (...args: any[]) => {};

/**
 * Takes an input payload and checks if it exceeds the maximum allowed size of 256KB.
 * If it does, it will store the payload in a store (S3 or DynamoDB) and replace the entire
 * payload with a reference to the stored payload.
 * If the payload is smaller than the maximum allowed size, it will be left untouched.
 *
 * If certain parts of the payload should be preserved, you can specify a selector that will
 * be used to extract the parts that should be preserved in the output.
 * The selector can be an array of strings or a function that receives the output and returns
 * the parts that should be preserved. If the selector is an array of strings,
 * each element is considered a path to the part that should be preserved.
 * Lodash's get function is called for each element of the array.
 *
 * The full payload will always be stored in the store, even if a selector is specified.
 * That means the payload from the store will always be the input for the next state.
 * The selector is only to create temporary payloads to control the flow of the state machine between states.
 */

export const middyStore = <TInput = unknown, TOutput = unknown>(
	opts: MiddyStoreOptions<TInput, TOutput>,
): middy.MiddlewareObj<TInput, TOutput> => {
	const { stores, passThrough } = opts;
	const logger = opts.logger ?? DEFAULT_DUMMY_LOGGER;

	const onReadInput: middy.MiddlewareFn = async (request) => {
		// setting read to false will skip the store
		if (opts.read === false) {
			logger(`Read is disabled, skipping store`);
			return;
		}

		// setting read to true or not setting it at all will enable the store
		const readOptions = opts.read === true || !opts.read ? {} : opts.read;

		const { event: input, context } = request;

		if (
			input === null ||
			input === undefined ||
			typeof input !== "object" ||
			Object.keys(input).length === 0
		) {
			logger(`Input must be an object, skipping store`);
			return;
		}

		// check if the event contains a reference to a stored payload
		// if it does, load the payload from the store
		// if it doesn't, leave the event untouched
		// const references = findAllReferences(input);
		// if (!references || references.length === 0) {
		// 	logger(`No reference found in input`);
		// 	return;
		// }

		// logger(`Found ${references.length} references in input`, { references });
		let index = 0;
		for (const path of generateReferencePaths({ input, path: "" })) {
			logger(`Process reference at ${path}`);

			const reference = selectByPath(input, formatPath(path, MIDDY_STORE));
			const readInput = {
				input, // TODO Object.freeze(input)?
				reference,
			};

			// find a store that can load the reference
			const store = stores.find(
				(store): store is ReadableStore =>
					"canRead" in store && "read" in store && store.canRead(readInput),
			);
			if (!store) {
				if (passThrough) {
					logger(`No store was found to load reference, passthrough input`);
					return;
				}

				logger(`No store was found to load reference, throwing error`);
				throw new Error(
					`No store can load reference: ${JSON.stringify(reference)}`,
				);
			}

			logger(`Found store "${store.name}" to load reference`);

			// load the payload from the store
			const payload = await store.read(readInput);

			logger(`Loaded payload from store "${store.name}"`, {
				input,
				path,
				payload,
			});

			// replace the reference with the payload
			request.event = replaceByPath(input, payload, path);

			logger(`Replaced reference with payload`, { path, payload });

			index++;
		}
	};

	const onWriteOutput: middy.MiddlewareFn = async (request) => {
		// setting write to false will skip the store
		if (opts.write === false) {
			logger(`Write is disabled, skipping store`);
			return;
		}

		// setting write to true or not setting it at all will enable the store
		const writeOptions = opts.write === true || !opts.write ? {} : opts.write;
		const selector = writeOptions.selector ?? DEFAULT_OUTPUT_SELECTOR;
		// const replacer = writeOptions.replacer ?? selector;
		const size = writeOptions.size ?? MAX_SIZE_STEPFUNCTIONS;

		const { response: output, event: input } = request;

		if (
			output === null ||
			output === undefined ||
			typeof output !== "object" ||
			Object.keys(output).length === 0
		) {
			logger(`Output must be an object, skipping store`);
			return;
		}

		// check if response size exceeds the maximum allowed size
		// if it does, store the response in the store
		// if it doesn't, leave the response untouched
		// if maxSize is 0, always store the response in the store
		const maxSize = sizeToNumber(
			typeof size === "function" ? size({ input, output }) : size,
		);
		const byteSize = calculateByteSize(output);
		if (maxSize > 0 && byteSize < maxSize) {
			logger(
				`Output size of ${byteSize} bytes is less than max size of ${maxSize}, skipping store`,
			);
			return;
		}

		logger(
			`Output size of ${byteSize} bytes exceeds max size of ${maxSize} bytes, save in store`,
		);

		// select payload to be saved
		// if no selector is specified, save the entire response
		// if a selector is specified, use it to select the payload to be save
		// const payload =
		// 	typeof selector === "function"
		// 		? selector({ input, output })
		// 		: selectPayloadByPath({ output, path: selector });

		let index = 0;
		for (const path of generatePayloadPaths({ output, selector })) {
			logger(`Process payload at ${path}`);

			const payload = selectByPath(output, path);

			const storeOutput: WriteOutput<TInput, TOutput> = {
				input, // TODO Object.freeze(input)?
				output, // TODO Object.freeze(output)?
				payload,
				byteSize: calculateByteSize(payload),
				index,
			};

			logger(`Selected payload`, {
				path,
				payload,
				byteSize: storeOutput.byteSize,
			});

			// find a store that can store the payload
			// if there are multiple stores, store the response in the first store that accepts the response
			// if no store accepts the response, leave the response untouched
			const store = stores.find(
				(store): store is WritableStore =>
					"canWrite" in store &&
					"write" in store &&
					store.canWrite(storeOutput),
			);
			if (!store) {
				if (passThrough) {
					logger(`No store was found to save payload, passthrough output`);
					return;
				}

				logger(`No store was found to save payload, throwing error`);
				throw new Error(`No store can save payload`);
			}

			logger(`Found store "${store.name}" to save payload`);

			// store the payload in the store
			const reference: MiddyStore<any> = {
				[MIDDY_STORE]: await store.write(storeOutput),
			};

			logger(`Saved payload in store "${store.name}"`);

			// replace the response with a reference to the stored response
			request.response = replaceByPath(output, reference, path);
			// request.response =
			// 	typeof replacer === "function"
			// 		? replacer({ input, output, reference })
			// 		: replacePayloadByPath({
			// 			output,
			// 			reference,
			// 			path: replacer,
			// 		});

			logger(`Replaced payload with reference`, {
				reference,
				output: request.response,
			});

			index++;
		}
	};

	return {
		before: onReadInput,
		after: onWriteOutput,
	};
};
