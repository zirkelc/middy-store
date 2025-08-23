import type { MiddlewareObj } from "@middy/core";
import type { Paths } from "ts-essentials";
import {
	calculateByteSize,
	createReference,
	formatPath,
	generatePayloadPaths,
	generateReferencePaths,
	isObject,
	isString,
	replaceByPath,
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

export type Logger = (message?: any, ...optionalParams: any[]) => void;

export type Selector<TObject> = TObject extends Record<string, any>
	? Paths<TObject, { anyArrayIndexAccessor: "*" }>
	: string;

const kb = (kb: number) => kb * 1024;
const mb = (mb: number) => mb * 1024 * 1024;
const gb = (gb: number) => gb * 1024 * 1024 * 1024;

/**
 * Size limits for input and output of AWS services.
 */
export const Sizes = {
	/**
	 * Convert kilobytes to bytes.
	 */
	kb,
	/**
	 * Convert megabytes to bytes.
	 */
	mb,
	/**
	 * Convert gigabytes to bytes.
	 */
	gb,

	/**
	 * Always write the output to the store.
	 */
	ZERO: 0,
	/**
	 * Never write the output to the store.
	 */
	INFINITY: Number.POSITIVE_INFINITY,
	/**
	 * The maximum size for Step Functions payloads is 262144 bytes.
	 * @see https://docs.aws.amazon.com/step-functions/latest/dg/limits-overview.html
	 */
	STEP_FUNCTIONS: 262_144, // 262144 bytes
	/**
	 * The maximum size for synchronous Lambda invocations is 6MB.
	 * @see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
	 */
	LAMBDA_SYNC: mb(6), // 6MB,
	/**
	 * The maximum size for asynchronous Lambda payloads is 256KB.
	 * @see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
	 */
	LAMBDA_ASYNC: kb(256), // 256KB,
};

// TODO add metadata object which will be passed to the store and load methods

export type StoreArgs<TPayload> = {
	// TODO add output to StoreArgs OR metadata?
	payload: TPayload;
	byteSize: number;
};

export type LoadArgs<TReference> = {
	// TODO add input to LoadArgs OR metadata?
	reference: TReference;
};

export interface StoreInterface<TPayload = unknown, TReference = unknown> {
	name: string;
	canLoad: (args: LoadArgs<unknown>) => boolean;
	load: (args: LoadArgs<TReference>) => Promise<TPayload>;
	canStore: (args: StoreArgs<TPayload>) => boolean;
	store: (args: StoreArgs<TPayload>) => Promise<TReference>;
}

// TODO add option to clone instead of mutate input/output
export interface MiddyStoreOptions<TInput = unknown, TOutput = unknown> {
	stores: Array<StoreInterface<any, any>>;
	loadingOptions?: LoadingOptions<TInput>;
	storingOptions?: StoringOptions<TInput, TOutput>;
	logger?: Logger;
}

export interface LoadingOptions<TInput> {
	/**
	 * Skip loading the payload from the Store, even if the input contains a reference.
	 */
	skip?: boolean;

	/**
	 * Pass the input through if no store was found to load the reference.
	 */
	passThrough?: boolean;

	// selector?: Selector<TInput>; // TODO

	// TODO metadata here?
}

export interface StoringOptions<TInput, TOutput> {
	// TODO metadata here?

	/**
	 * Skip storing the payload in the Store, even if the output exceeds the maximum size.
	 */
	skip?: boolean;

	/**
	 * Pass the output through if no store was found to store the payload.
	 */
	passThrough?: boolean;

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
	 * If the selector ends withs `.*` and the selected payload is an array,
	 * then each element of the array will be saved in the store separately.
	 * That means each element of the array will be replaced with a reference to the stored payload.
	 *
	 * Example:
	 * ```
	 * const payload = {
	 * 	a: {
	 * 		b: [{ foo: 'foo' }, { bar: 'bar' }, { baz: 'baz' }],
	 * 	},
	 * };
	 *
	 * selector: undefined; // selects the entire output as the payload
	 * selector: 'a'; // selects the payload at the path 'a'
	 * selector: 'a.b'; // selects the payload at the path 'a.b'
	 * selector: 'a.b.0'; // selects the payload at the path 'a.b.0'
	 * selector: 'a.b.*'; // selects the payloads at the paths 'a.b.0', 'a.b.1', 'a.b.2', etc.
	 * ```
	 *
	 * Note: If you use a selector that selects multiple payloads, make sure you configure your store
	 * to generate unique keys for each payload. Otherwise, the store will overwrite the previous payload.
	 */
	selector?: Selector<TOutput>;

	/**
	 * Specifies the minimum **byte size** at which the output should be saved in the store.
	 * The `Sizes` object contains predefined sizes for AWS services.
	 * If the output exceeds the specified size, it will be saved in the store.
	 * If the output is smaller than the specified size, it will be left untouched.
	 * If the output should always be saved in the store, set the size to `Sizes.ZERO`.
	 * If the output should never be saved in the store, set the size to `Sizes.INFINITY`.
	 */
	minSize?: number;
}

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
	const { stores, loadingOptions, storingOptions } = opts;
	const logger = opts.logger ?? DUMMY_LOGGER;

	// let request: Request<TInput, TOutput> | undefined;

	const middleware: MiddlewareObj<TInput, TOutput> = {
		before: async (request) => {
			// setting read to false will skip the store
			if (loadingOptions?.skip) {
				logger(`Loading is disabled, skipping Store`);
				return;
			}

			const input = request.event;

			if (!isObject(input)) {
				logger(`Input must be an object, skipping store`);
				return;
			}

			let index = 0;
			for (const path of generateReferencePaths({ input, path: "" })) {
				logger(`Process reference at ${path}`);

				const reference = selectByPath({
					source: input,
					path: formatPath({ path, key: MIDDY_STORE }),
				});
				const loadArgs: LoadArgs<unknown> = {
					reference,
				};

				// find a store that can load the reference
				const store = stores.find((store) => store.canLoad(loadArgs));
				if (!store) {
					if (loadingOptions?.passThrough) {
						logger(`No store was found to load reference, passthrough input`);

						// replace the middy-store reference with the raw reference
						request.event = replaceByPath({
							source: input,
							value: reference,
							path,
						}) as TInput;

						continue;
					}

					logger(`No store was found to load reference, throwing error`);
					throw new Error(
						`No store can load reference: ${JSON.stringify(reference)}`,
					);
				}

				logger(`Found store "${store.name}" to load reference`);

				// load the payload from the store
				const payload = await store.load(loadArgs);

				logger(`Loaded payload from store "${store.name}"`, {
					input,
					path,
					payload,
				});

				// replace the reference with the payload
				request.event = replaceByPath({
					source: input,
					value: payload,
					path,
				}) as TInput;

				logger(`Replaced reference with payload`, { path, payload });

				index++;
			}
		},

		after: async (request) => {
			// setting write to false will skip the store
			if (storingOptions?.skip) {
				logger(`Storing is disabled, skipping Store`);
				return;
			}

			const selector = storingOptions?.selector;
			const minSize = storingOptions?.minSize ?? Sizes.STEP_FUNCTIONS;

			const output = request.response;

			if (!isObject(output) && !isString(output)) {
				logger(`Output must be a string or an object, skipping store`);
				return;
			}

			// check if response size exceeds the minimum size upon which the response should be stored
			const byteSize = calculateByteSize(output);

			if (minSize === Sizes.INFINITY) {
				logger(
					`Output size of ${byteSize} bytes is less than ${minSize} bytes, skipping store`,
				);
				return;
			}

			if (minSize < byteSize) {
				logger(
					`Output size of ${byteSize} bytes is greater than ${minSize} bytes, save in store`,
				);
			} else {
				logger(
					`Output size of ${byteSize} bytes is less than ${minSize} bytes, skipping store`,
				);
				return;
			}

			if (isString(output) && selector) {
				logger(`Output is a string, ignoring selector`);
			}

			let index = 0;
			for (const path of generatePayloadPaths({ output, selector })) {
				logger(`Process payload at ${path}`);

				const payload = selectByPath({ source: output, path });

				const storeArgs: StoreArgs<unknown> = {
					payload,
					byteSize: calculateByteSize(payload),
				};

				logger(`Selected payload`, {
					path,
					payload,
					byteSize: storeArgs.byteSize,
				});

				// find a store that can store the payload
				// if there are multiple stores, store the response in the first store that accepts the response
				// if no store accepts the response, leave the response untouched
				const store = stores.find((store) => store.canStore(storeArgs));
				if (!store) {
					if (storingOptions?.passThrough) {
						logger(`No store was found to save payload, passthrough output`);
						return;
					}

					logger(`No store was found to save payload, throwing error`);
					throw new Error(`No store can save payload`);
				}

				logger(`Found store "${store.name}" to save payload`);

				// store the payload in the store
				const reference: MiddyStore<unknown> = createReference(
					await store.store(storeArgs),
				);

				logger(`Saved payload in store "${store.name}"`);

				// replace the response with a reference to the stored response
				request.response = replaceByPath({
					source: output,
					value: reference,
					path,
				}) as TOutput;

				logger(`Replaced payload with reference`, {
					reference,
					output: request.response,
				});

				index++;
			}
		},
	};

	// const earlyReturn = (output: TOutput) => {
	// 	middleware.after!({});
	// };

	return middleware;
};
