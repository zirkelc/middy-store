import middy from "@middy/core";
import get from "lodash.get";
import set from "lodash.set";
import toPath from "lodash.topath";
import {
	calculateByteSize,
	findReference,
	replacePayloadWithReference,
	replaceReferenceWithPayload,
	selectPayload,
} from "./utils.js";

// https://middy.js.org/docs/writing-middlewares/configurable-middlewares

const REFERENCE_KEY = "@store";
const ROOT_PATH = "";

export type Reference = {
	"@store": any;
};

// https://lodash.com/docs/4.17.15#get
export type Selector = string | string[];

export type StoreOptions = {
	maxSize?: number;
};

export type StoreInput<TPayload = any> = {
	byteSize: number;
	typeOf: string;
	payload: TPayload;
};

export type LoadInput<TReference = any> = {
	reference: TReference;
};

export interface Store<TReference, TPayload> {
	name: string;
	canLoad(input: LoadInput<unknown>): boolean;
	load(input: LoadInput<TReference>): Promise<TPayload>;
	canStore(input: StoreInput<unknown>): boolean;
	store(input: StoreInput<TPayload>): Promise<TReference>;
}

export type MiddlewareOptions = {
	stores: [Store<any, any>, ...Store<any, any>[]];
	selector?: Selector; // multiple selectors?
	maxSize?: number;
	passThrough?: boolean;
	logger?: (...args: any[]) => void;
};

const DEFAULT_MAX_SIZE = 256 * 1024; // 256KB
const DEFAULT_SELECTOR: Selector = [];
const DEFAULT_DUMMY_LOGGER = (...args: any[]) => { };

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

export const store = <
	TEvent extends Record<string, any>,
	TResult extends Record<string, any>,
>(
	opts: MiddlewareOptions,
): middy.MiddlewareObj<TEvent, TResult> => {
	const { stores, passThrough } = opts;
	const selector = opts.selector ?? DEFAULT_SELECTOR;
	const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
	const logger = opts.logger ?? DEFAULT_DUMMY_LOGGER;

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
		const result = findReference(input);
		if (!result) {
			logger(`No reference found in input`);
			return;
		}

		const { reference, path } = result;
		logger(`Found reference in input, loading from store`, { reference, path });

		const loadInput = { reference };

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

		logger(`Loaded payload from store "${store.name}"`);

		// replace the reference with the payload
		request.event = replaceReferenceWithPayload(input, path, payload);

		logger(`Replaced reference with payload`);
	};

	const after: middy.MiddlewareFn = async (request) => {
		const { response: output } = request;

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
		const { payload, path } = selectPayload(output, selector);

		const storeInput = {
			payload,
			byteSize: calculateByteSize(payload),
			typeOf: typeof payload,
		};

		logger(`Selected payload`, {
			path,
			byteSize: storeInput.byteSize,
			typeOf: storeInput.typeOf,
		});

		// find a store that can store the payload
		// if there are multiple stores, store the response in the first store that accepts the response
		// if no store accepts the response, leave the response untouched
		const store = stores.find((store) => store.canStore(storeInput));
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
		const reference = await store.store(storeInput);

		logger(`Stored payload in store "${store.name}"`);

		// replace the response with a reference to the stored response
		request.response = replacePayloadWithReference(output, path, reference);

		logger(`Replaced payload with reference`, { path, reference });
	};

	return {
		before,
		after,
	};
};

export default store;
