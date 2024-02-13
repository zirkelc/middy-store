import middy from '@middy/core'
import type { Handler, APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { store } from 'middy-input-output-store';
import { Base64Store } from 'middy-input-output-store-base64';

const lambdaHandler: Handler<APIGatewayProxyEventV2> = async (input, context) => {
	console.log('input in handler', input)

	return input;
}

// const store = new Base64Store();

export const handler = middy()
	.use(store({
		logger: console.log,
		maxSize: 0,
		stores: [
			new Base64Store(),
		]
	}))
	.handler(lambdaHandler);

const context = {} as Context;
const input = {
	'@store': {
		store: 'base64',
		base64: 'SGVsbG8gV29ybGQ=' // Hello World
	}
};

console.log('input before handler', input);
const output = await handler(input, context);
console.log('output after handler', output);