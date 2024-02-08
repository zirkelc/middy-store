import middy from '@middy/core'
import get from 'lodash.get'
import set from 'lodash.set'

// https://middy.js.org/docs/writing-middlewares/configurable-middlewares



type StoreS =
	| {
		service: "s3"
		bucket: string | ((output: any) => string);
		key: string | ((output: any) => string);
	}
	| {
		service: "dynamodb"
		tableName: string | ((output: any) => string);
		key: string | ((output: any) => string);
	};

export type StoreReference = { service: string };
// 	| {
// 		service: "s3"
// 		bucket: string;
// 		key: string;
// 		uri: string;
// 	}
// 	| {
// 		service: "dynamodb"
// 		tableName: string;
// 		key: string;
// 	};

// export type StorePayload = any;

const REFERENCE_KEY = '@store';
const ROOT_PATH = '';

type Reference = {
	'@store': StoreReference;
}

// https://lodash.com/docs/4.17.15#get
type Selector = string | string[];


export type StoreOptions = {
	maxSize?: number;
}

export type StoreInput<TPayload = any> = {
	byteSize: number;
	typeOf: string;
	payload: TPayload;
};

export type LoadInput<TReference = any> = {
	reference: TReference;
};


export interface Store<TReference, TPayload> {
	canLoad(input: LoadInput<unknown>): input is LoadInput<TReference>;
	load(input: LoadInput<TReference>): Promise<TPayload>;
	canStore(input: StoreInput<unknown>): boolean;
	store(input: StoreInput<TPayload>): Promise<StoreReference>;
}

type MiddlewareOptions = {
	stores: Array<Store<any, any>>;
	selector?: Selector; // multiple selectors?
	maxSize?: number;
	passThrough?: boolean;
	logger?: ((message: string) => void);
}

const DEFAULT_MAX_SIZE = 256 * 1024; // 256KB
const DEFAULT_SELECTOR: Selector = "";
const DEFAULT_DUMMY_LOGGER = (message: string) => { };

const defaultOtions: Partial<MiddlewareOptions> = {
	maxSize: 256 * 1024, // 256KB 
}

const calculateByteSize = (payload: any) => {
	if (typeof payload === 'string')
		return Buffer.byteLength(payload);

	if (typeof payload === 'object')
		return Buffer.byteLength(JSON.stringify(payload));

	throw new Error(`Unsupported payload type: ${typeof payload}`);
}

type SelectPayloadResult = {
	payload: any;
	path: string;
};
const selectPayload = (result: any, selector: Selector): SelectPayloadResult => {
	const payload = selector ? get(result, selector) : result;
	const path = Array.isArray(selector) ? selector.join('.') : selector;

	return { payload, path };
}

const replacePayloadWithReference = (result: any, path: string, storeReference: any) => {
	const reference: Reference = { [REFERENCE_KEY]: storeReference };

	return path === ROOT_PATH
		? reference
		: set(result, path, reference);
}

const replaceReferenceWithPayload = (result: any, path: string, storePayload: any) => {
	return path === ROOT_PATH
		? storePayload
		: set(result, path, storePayload);
}

type FindReferenceResult = {
	reference: StoreReference;
	path: string;
};
const findReference = (result: any): FindReferenceResult | undefined => {
	// find reference in result
	// loop recursively through all keys and search for reference key @store
	// return the reference and the path to the reference
	// if no reference is found, return undefined

	const findReferenceIn = (obj: any, path: string): FindReferenceResult | undefined => {
		for (const key in obj) {
			if (obj[key] === null || typeof obj[key] !== 'object') continue;

			const nextPath = path ? `${path}.${key}` : key;

			if (obj[key][REFERENCE_KEY])
				return { reference: obj[key][REFERENCE_KEY], path: nextPath };

			const result = findReferenceIn(obj[key], nextPath);
			if (result) return result;
		}
	}

	return findReferenceIn(result, '');
}

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

const middleware = <TEvent, TResult>(opts: MiddlewareOptions): middy.MiddlewareObj<TEvent, TResult> => {
	const { stores, passThrough } = opts;
	const selector = opts.selector ?? DEFAULT_SELECTOR;
	const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
	const logger = opts.logger ?? DEFAULT_DUMMY_LOGGER;

	const before: middy.MiddlewareFn<TEvent, TResult> = async (request) => {
		const { event: input, context } = request

		// check if the event contains a reference to a stored payload
		// if it does, load the payload from the store
		// if it doesn't, leave the event untouched
		const { reference, path } = findReference(input) ?? { reference: undefined, path: undefined };
		logger(reference ? `Found reference in input at path "${path}"` : `No reference found in input`);
		if (!reference) return;

		const loadInput = { reference };

		// find a store that can load the reference
		const store = stores.find((store) => store.canLoad(loadInput));
		if (!store) {
			logger(passThrough ? `No store was found to load reference, passthrough input` : `No store was found to load reference, throwing error`);

			if (passThrough) return;
			throw new Error(`No store can load reference: ${JSON.stringify(reference)}`);
		}

		logger(`Found store to load reference`);

		// load the payload from the store
		const payload = await store.load(loadInput);

		logger(`Loaded payload`);

		// replace the reference with the payload
		request.event = replaceReferenceWithPayload(input, path, payload);

		logger(`Replaced reference with payload`);
	}

	const after: middy.MiddlewareFn<TEvent, TResult> = async (request) => {
		const { response: output } = request

		// check if response size exceeds the maximum allowed size
		// if it does, store the response in the store
		// if it doesn't, leave the response untouched
		// if maxSize is 0, always store the response in the store
		const byteSize = calculateByteSize(output);
		if (maxSize > 0 && byteSize < maxSize) {
			logger(`Output size of ${byteSize} bytes is less than max size of ${maxSize}, skipping store`);
			return;
		}

		logger(`Output size of ${byteSize} bytes exceeds max size of ${maxSize}`);

		// select payload to be stored
		// if no selector is specified, store the entire response
		// if a selector is specified, use it to select the payload to be stored
		const { payload, path } = selectPayload(output, selector);

		const storeInput = {
			payload,
			byteSize: calculateByteSize(payload),
			typeOf: typeof payload
		};

		logger(`Selected payload at path "${path}" with size ${storeInput.byteSize} bytes and type "${storeInput.typeOf}"`);

		// find a store that can store the payload 
		// if there are multiple stores, store the response in the first store that accepts the response
		// if no store accepts the response, leave the response untouched
		const store = stores.find((store) => store.canStore(storeInput));
		if (!store) {
			logger(passThrough ? `No store was found to store payload, passthrough response` : `No store was found to store payload at ${path}, throwing error`);
			if (passThrough) return;
			throw new Error(`No store can store payload`);
		}

		logger(`Found store to store payload`);

		// store the payload in the store
		const storedPayload = await store.store(storeInput);

		logger(`Stored payload`);

		// replace the response with a reference to the stored response
		request.response = replacePayloadWithReference(output, path, storedPayload);

		logger(`Replaced payload with reference at path "${path}"`);
	}

	// const onError = async (request) => {
	// 	if (request.response === undefined) return
	// 	return customMiddlewareAfter(request)
	// }

	return {
		before,
		after,
		// onError
	}
}

export default middleware