import type { MiddlewareObj } from "@middy/core";
import {
	calculateByteSize,
	formatPath,
	generatePayloadPaths,
	generateReferencePaths,
	isObject,
	replaceByPath,
	resolvableFn,
	selectByPath,
} from "./utils.js";

// https://middy.js.org/docs/writing-middlewares/configurable-middlewares

export const MIDDY_STORE = "@middy-store";

export type MiddyStore<TReference> = {
	[MIDDY_STORE]: TReference;
};

export type Resolveable<TResolved, TArgs extends any[] = []> =
	| TResolved
	| ((...args: TArgs) => TResolved);

export type Payload<TPayload = any> = TPayload;
export type Reference<TReference = any> = TReference;

// https://lodash.com/docs/4.17.15#get
export type Path = string;

// TODO build selector paths based on TInput like React Hook Forms
export type OutputSelector<TInput, TOutput> = Path;
// export type OutputReplacer<TInput, TOutput> = Path;

export const MaxOutputSize = {
	/**
	 * Always write the output to the store.
	 */
	ALWAYS: 0,
	/**
	 * The maximum size for Step Functions payloads is 256KB.
	 * @see https://docs.aws.amazon.com/step-functions/latest/dg/limits-overview.html
	 */
	STEP_FUNCTIONS: 256 * 1024, // 256KB
	/**
	 * The maximum size for synchronous Lambda invocations is 6MB.
	 * @see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
	 */
	LAMBDA_SYNC: 6 * 1024 * 1024, // 6MB,
	/**
	 * The maximum size for asynchronous Lambda payloads is 256KB.
	 * @see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
	 */
	LAMBDA_ASYNC: 256 * 1024, // 256KB,
};

export type OutputSize<TInput, TOutput> =
	| number
	| ((args: { input: TInput; output: TOutput }) => number);

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

// TODO add option to clone instead of mutate input/output
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
	 * If the selector ends withs `[*]` and the selected payload is an array,
	 * then each element of the array will be saved in the store separately.
	 * That means each element of the array will be replaced with a reference to the stored payload.
	 *
	 * Example:
	 * ```
	 * const payload = {
	 * 	a: {
	 * 		b: [{ foo: 'foo' }, { bar: 'bar }, { baz: 'baz' }],
	 * 	},
	 * };
	 *
	 * selector: ''; // selects the entire output as the payload
	 * selector: 'a'; // selects the payload at the path 'a'
	 * selector: 'a.b[0]'; // selects the payload at the path 'a.b[0]'
	 * selector: 'a.b[*]'; // selects the payloads at the paths 'a.b[0], 'a.b[1]', 'a.b[2]', etc.
	 * ```
	 *
	 * Note: If you use a selector that selects multiple payloads, make sure you configure your store
	 * to generate unique keys for each payload. Otherwise, the store will overwrite the previous payload.
	 */
	selector?: OutputSelector<TInput, TOutput>;

	/**
	 * Specifies the size at which the output payload should be saved in the store.
	 * If the output payload exceeds the specified size, it will be saved in the store.
	 * If the output payload is smaller than the specified size, it will be left untouched.
	 * If the output payload should always be saved in the store, set the size to 0.
	 */
	size?: OutputSize<TInput, TOutput>;
}

const ROOT_SELECTOR = "";
const DUMMY_LOGGER = (...args: any[]) => {};

/**
 * Takes a payload and checks if it exceeds the maximum allowed size (e.g. 256KB for Step Functions).
 * If it does, it will store the payload in a store (e.g. S3 or DynamoDB) and replaces the payload with a reference to the stored payload.
 * If the payload is smaller than the maximum allowed size, it will not be changed.
 *
 * If only certain parts of the payload should be stored, you can specify a selector that will be used
 * to extract the part of the payload which should be stored.
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
): MiddlewareObj<TInput, TOutput> => {
	const { stores, passThrough } = opts;
	const logger = opts.logger ?? DUMMY_LOGGER;

	return {
		// onReadInput
		before: async (request) => {
			// setting read to false will skip the store
			if (opts.read === false) {
				logger(`Read is disabled, skipping store`);
				return;
			}

			// setting read to enable or disable the store
			// true or undefined are identical and will enable the store
			// false will disable the store
			const readOptions = opts.read === true || !opts.read ? {} : opts.read;

			const { event: input, context } = request;

			if (!isObject(input) || Object.keys(input).length === 0) {
				logger(`Input must be an object, skipping store`);
				return;
			}

			let index = 0;
			for (const path of generateReferencePaths({ input, path: "" })) {
				logger(`Process reference at ${path}`);

				const reference = selectByPath(input, formatPath(path, MIDDY_STORE));
				const readInput = {
					input,
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
		},

		// onWriteOutput
		after: async (request) => {
			// setting write to false will skip the store
			if (opts.write === false) {
				logger(`Write is disabled, skipping store`);
				return;
			}

			// setting write will enable or disable the store
			// true or undefined are identical and will enable the store
			// false will disable the store
			const writeOptions =
				opts.write === true || opts.write === undefined ? {} : opts.write;
			const selector = writeOptions.selector ?? ROOT_SELECTOR;
			const size = resolvableFn(
				writeOptions.size ?? MaxOutputSize.STEP_FUNCTIONS,
			);

			const { response: output, event: input } = request;

			if (!isObject(output) || Object.keys(output).length === 0) {
				logger(`Output must be an object, skipping store`);
				return;
			}

			// check if response size exceeds the maximum allowed size
			// if it does, store the response in the store
			// if it doesn't, leave the response untouched
			// if maxSize is 0, always store the response in the store
			const maxSize = size({ input, output });
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

			let index = 0;
			for (const path of generatePayloadPaths({ output, selector })) {
				logger(`Process payload at ${path}`);

				const payload = selectByPath(output, path);

				const storeOutput: WriteOutput<TInput, TOutput> = {
					input,
					output,
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

				logger(`Replaced payload with reference`, {
					reference,
					output: request.response,
				});

				index++;
			}
		},
	};
};
