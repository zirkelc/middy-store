import middy from "@middy/core";
import { Options as MiddyOptions } from "@middy/util";
import get from "lodash.get";
import set from "lodash.set";
import toPath from "lodash.topath";
import { T, s } from "vitest/dist/reporters-MmQN-57K.js";
import {
	calculateByteSize,
	findAllReferences,
	replacePayloadByPath,
	replaceReferenceByPath,
	selectPayloadByPath,
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

export type InputSelector<TInput> = Path | ((args: { input: TInput }) => any);
export type InputReplacer<TInput> = Path | ((args: { input: TInput }) => any);

export type OutputSelector<TInput, TOutput> =
	| Path
	| ((args: { input: TInput; output: TOutput }) => any);
export type OutputReplacer<TInput, TOutput> =
	| Path
	| ((args: {
			input: TInput;
			output: TOutput;
			reference: MiddyStore<any>;
	  }) => any);

export type StoreOptions = {
	maxSize?: number;
};

export type StoreOutput = {
	input: any;
	output: any;
	payload: any;
	byteSize: number;
};

export type LoadInput<TReference> = {
	input: any;
	reference: TReference;
};

export interface Store {
	name: string;
	canLoad(input: LoadInput<unknown>): boolean;
	load(input: LoadInput<unknown>): Promise<Payload>;
	canStore(output: StoreOutput): boolean;
	store(output: StoreOutput): Promise<Reference>;
}

interface MiddlewareOptions {
	stores: [Store, ...Store[]];
	logger?: (...args: any[]) => void;
	passThrough?: boolean;
}

export interface LoadInputMiddlewareOptions<TInput = unknown>
	extends MiddlewareOptions {
	// selector?: InputSelector<TInput>; // TODO
	// replacer?: InputReplacer<TInput>; // TODO
}

export interface StoreOutputMiddlewareOptions<
	TInput = unknown,
	TOutput = unknown,
> extends MiddlewareOptions {
	/**
	 * Selects the payload that should be saved in the store.
	 * If no selector is specified, the entire output will be saved in the store.
	 * Then entire output will be replaced with a reference to the stored payload.
	 *
	 * If a selector is specified, only this part of the output will be saved in the store.
	 * By default, the selected payload will be replaced with a reference to the stored payload.
	 * This behavior can be changed by specifying a custom replacer.
	 *
	 * The selector can be a string path or an array of string paths.
	 * It uses Lodash's get function {@link https://lodash.com/docs/4.17.15#get | _.get() } to select the payload from the output.
	 *
	 * Examples:
	 * ```
	 * selector: 'a[0].b.c'; // selects the payload at the path 'a[0].b.c'
	 * selector: ['a', '0', 'b', 'c']; // selects the payload at the path 'a[0].b.c'
	 * ```
	 */
	selector?: OutputSelector<TInput, TOutput>;
	/**
	 * Replaces the payload with a reference to the stored payload.
	 * If no replacer is specified, the reference will be placed at the path specified by the selector.
	 *
	 * If a replacer is specified, the reference will be placed at the specified path instead of the path specified by the selector.
	 *
	 * The replacer can be a string path or an array of string paths.
	 * It uses Lodash's set function {@link https://lodash.com/docs/4.17.15#set | _.set() } to place the reference in the output.
	 *
	 * If the replace path ends with array brackets, the reference will be pushed to the array instead of being set as a property.
	 * This allows to aggregate multiple references in an array if the Lambda function is called multiple times.
	 *
	 * Examples:
	 * ```
	 * replacer: 'x.y.z'; // places the reference at the path 'x.y.z'
	 * replacer: ['x', 'y', 'z']; // places the reference at the path 'x.y.z'
	 * replacer: 'x.y.z[]'; // pushes the reference to the array at the path 'x.y.z'
	 * ```
	 */
	replacer?: OutputReplacer<TInput, TOutput>;
	maxSize?: number; // TODO as function with full input and output
}

const DEFAULT_MAX_SIZE = 256 * 1024; // 256KB
const DEFAULT_OUTPUT_SELECTOR = "";
// const DEFAULT_REPLACER: Replacer = [];
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

export const loadInput = <TInput = unknown, TOutput = any>(
	opts: LoadInputMiddlewareOptions<TInput>,
): middy.MiddlewareObj<TInput, TOutput> => {
	const { stores, passThrough } = opts;
	const logger = opts.logger ?? DEFAULT_DUMMY_LOGGER;
	// TODO implement selector
	// const selector = opts.selector ?? DEFAULT_SELECTOR;
	// TODO implement replacer
	// const replacer = opts.replacer ?? selector;

	const before: middy.MiddlewareFn = async (request) => {
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
		const references = findAllReferences(input);
		if (!references || references.length === 0) {
			logger(`No reference found in input`);
			return;
		}

		logger(`Found ${references.length} references in input`, { references });

		for (const { reference, path } of references) {
			logger(`Process reference at ${path.join(".")}`);
			const loadInput = {
				input, // TODO Object.freeze(input)?
				reference,
			};

			// find a store that can load the reference
			const store = stores.find((store) => store.canLoad(loadInput));
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
			const payload = await store.load(loadInput);

			logger(`Loaded payload from store "${store.name}"`, {
				input,
				path,
				payload,
			});

			// replace the reference with the payload
			request.event = replaceReferenceByPath(input, path, payload);

			logger(`Replaced reference with payload`, { path, payload });
		}
	};

	return {
		before,
	};
};

export const storeOutput = <TInput = unknown, TOutput = any>(
	opts: StoreOutputMiddlewareOptions<TInput, TOutput>,
): middy.MiddlewareObj<TInput, TOutput> => {
	const { stores, passThrough } = opts;
	const selector = opts.selector ?? DEFAULT_OUTPUT_SELECTOR;
	const replacer = opts.replacer ?? selector;
	const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
	const logger = opts.logger ?? DEFAULT_DUMMY_LOGGER;

	const after: middy.MiddlewareFn = async (request) => {
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
		const byteSize = calculateByteSize(output);
		if (maxSize > 0 && byteSize < maxSize) {
			logger(
				`Output size of ${byteSize} bytes is less than max size of ${maxSize}, skipping store`,
			);
			return;
		}

		logger(
			`Output size of ${byteSize} bytes exceeds max size of ${maxSize} bytes, storing in store`,
		);

		// select payload to be stored
		// if no selector is specified, store the entire response
		// if a selector is specified, use it to select the payload to be stored
		const payload =
			typeof selector === "function"
				? selector({ input, output })
				: selectPayloadByPath({ output, path: selector });

		const storeOutput = {
			input, // TODO Object.freeze(input)?
			output, // TODO Object.freeze(output)?
			payload,
			byteSize: calculateByteSize(payload),
		};

		logger(`Selected payload`, {
			// path,
			payload,
			byteSize: storeOutput.byteSize,
		});

		// find a store that can store the payload
		// if there are multiple stores, store the response in the first store that accepts the response
		// if no store accepts the response, leave the response untouched
		const store = stores.find((store) => store.canStore(storeOutput));
		if (!store) {
			if (passThrough) {
				logger(`No store was found to store payload, passthrough output`);
				return;
			}

			logger(`No store was found to store payload, throwing error`);
			throw new Error(`No store can store payload`);
		}

		logger(`Found store "${store.name}" to store payload`);

		// store the payload in the store
		const reference: MiddyStore<any> = {
			[MIDDY_STORE]: await store.store(storeOutput),
		};

		logger(`Stored payload in store "${store.name}"`);

		// replace the response with a reference to the stored response
		request.response =
			typeof replacer === "function"
				? replacer({ input, output, reference })
				: replacePayloadByPath({
						output,
						reference,
						path: replacer,
				  });

		logger(`Replaced payload with reference`, {
			reference,
			output: request.response,
		});
	};

	return {
		after,
	};
};

// export const middleware = <
// 	TEvent extends Record<string, any>,
// 	TResult extends Record<string, any>,
// >(
// 	opts: MiddlewareOptions,
// ): middy.MiddlewareObj<TEvent, TResult> => {
// 	const { stores, passThrough } = opts;
// 	const selector = opts.selector ?? DEFAULT_SELECTOR;
// 	const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
// 	const logger = opts.logger ?? DEFAULT_DUMMY_LOGGER;

// 	const before: middy.MiddlewareFn = async (request) => {
// 		const { event: input, context } = request;

// 		if (
// 			input === null ||
// 			input === undefined ||
// 			typeof input !== "object" ||
// 			Object.keys(input).length === 0
// 		) {
// 			logger(`Input must be an object, skipping store`);
// 			return;
// 		}

// 		// check if the event contains a reference to a stored payload
// 		// if it does, load the payload from the store
// 		// if it doesn't, leave the event untouched
// 		const result = findReference(input);
// 		if (!result) {
// 			logger(`No reference found in input`);
// 			return;
// 		}

// 		const { reference, path } = result;
// 		logger(`Found reference in input, loading from store`, { reference, path });

// 		const loadInput = { reference };

// 		// find a store that can load the reference
// 		const store = stores.find((store) => store.canLoad(loadInput));
// 		if (!store) {
// 			if (passThrough) {
// 				logger(`No store was found to load reference, passthrough input`);
// 				return;
// 			}

// 			logger(`No store was found to load reference, throwing error`);
// 			throw new Error(
// 				`No store can load reference: ${JSON.stringify(reference)}`,
// 			);
// 		}

// 		logger(`Found store "${store.name}" to load reference`);

// 		// load the payload from the store
// 		const payload = await store.load(loadInput);

// 		logger(`Loaded payload from store "${store.name}"`, {
// 			input,
// 			path,
// 			payload,
// 		});

// 		// replace the reference with the payload
// 		request.event = replaceReferenceWithPayload(input, path, payload);

// 		logger(`Replaced reference with payload`, { path, payload });
// 	};

// 	const after: middy.MiddlewareFn = async (request) => {
// 		const { response: output } = request;

// 		if (
// 			output === null ||
// 			output === undefined ||
// 			typeof output !== "object" ||
// 			Object.keys(output).length === 0
// 		) {
// 			logger(`Output must be an object, skipping store`);
// 			return;
// 		}

// 		// check if response size exceeds the maximum allowed size
// 		// if it does, store the response in the store
// 		// if it doesn't, leave the response untouched
// 		// if maxSize is 0, always store the response in the store
// 		const byteSize = calculateByteSize(output);
// 		if (maxSize > 0 && byteSize < maxSize) {
// 			logger(
// 				`Output size of ${byteSize} bytes is less than max size of ${maxSize}, skipping store`,
// 			);
// 			return;
// 		}

// 		logger(
// 			`Output size of ${byteSize} bytes exceeds max size of ${maxSize} bytes, storing in store`,
// 		);

// 		// select payload to be stored
// 		// if no selector is specified, store the entire response
// 		// if a selector is specified, use it to select the payload to be stored
// 		const { payload, path } = selectPayload(output, selector);

// 		const storeInput = {
// 			payload,
// 			byteSize: calculateByteSize(payload),
// 			typeOf: typeof payload,
// 		};

// 		logger(`Selected payload`, {
// 			path,
// 			byteSize: storeInput.byteSize,
// 			typeOf: storeInput.typeOf,
// 		});

// 		// find a store that can store the payload
// 		// if there are multiple stores, store the response in the first store that accepts the response
// 		// if no store accepts the response, leave the response untouched
// 		const store = stores.find((store) => store.canStore(storeInput));
// 		if (!store) {
// 			if (passThrough) {
// 				logger(`No store was found to store payload, passthrough output`);
// 				return;
// 			}

// 			logger(`No store was found to store payload, throwing error`);
// 			throw new Error(`No store can store payload`);
// 		}

// 		logger(`Found store "${store.name}" to store payload`);

// 		// store the payload in the store
// 		const reference = await store.store(storeInput);

// 		logger(`Stored payload in store "${store.name}"`);

// 		// replace the response with a reference to the stored response
// 		request.response = replacePayloadWithReference(output, path, reference);

// 		logger(`Replaced payload with reference`, { path, reference });
// 	};

// 	return {
// 		before,
// 		after,
// 	};
// };
