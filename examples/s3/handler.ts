import middy from '@middy/core'
import store from '../../src/index.js'
import type { Handler, APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { S3Store } from '../../src/stores/s3.js';
import { Base64Store } from '../../src/stores/test.js';

const context: Context = {
	callbackWaitsForEmptyEventLoop: true,
	functionVersion: '$LATEST',
	functionName: 'foo-bar-function',
	memoryLimitInMB: '128',
	logGroupName: '/aws/lambda/foo-bar-function',
	logStreamName: '2021/03/09/[$LATEST]abcdef123456abcdef123456abcdef123456',
	invokedFunctionArn: 'arn:aws:lambda:eu-west-1:123456789012:function:foo-bar-function',
	awsRequestId: 'c6af9ac6-7b61-11e6-9a41-93e812345678',
	getRemainingTimeInMillis: () => 60_000,
	done: () => console.log('Done!'),
	fail: () => console.log('Failed!'),
	succeed: () => console.log('Succeeded!'),
};

const lambdaHandler: Handler<APIGatewayProxyEventV2> = async (event, context) => {
	console.log('Event', { event })

	return event;
}

export const handler = middy()
	.use(store({
		logger: console.log,
		maxSize: 0,
		stores: [
			new Base64Store(),
			// new S3Store({
			// 	bucket: 'my-bucket',
			// 	key: 'my-key',
			// })
		]
	}))
	.handler(lambdaHandler);

const event = {
	input: {
		'@store': {
			service: 'base64',
			base64: 'eyJzdGF0dXNDb2RlIjoyMDAsImJvZHkiOiJ7XCJtZXNzYWdlXCI6XCJIZWxsbyBmcm9tIExhbWJkYSFcIixcImV2ZW50XCI6e30sXCJjb250ZXh0XCI6e1wiY2FsbGJhY2tXYWl0c0ZvckVtcHR5RXZlbnRMb29wXCI6dHJ1ZSxcImZ1bmN0aW9uVmVyc2lvblwiOlwiJExBVEVTVFwiLFwiZnVuY3Rpb25OYW1lXCI6XCJmb28tYmFyLWZ1bmN0aW9uXCIsXCJtZW1vcnlMaW1pdEluTUJcIjpcIjEyOFwiLFwibG9nR3JvdXBOYW1lXCI6XCIvYXdzL2xhbWJkYS9mb28tYmFyLWZ1bmN0aW9uXCIsXCJsb2dTdHJlYW1OYW1lXCI6XCIyMDIxLzAzLzA5L1skTEFURVNUXWFiY2RlZjEyMzQ1NmFiY2RlZjEyMzQ1NmFiY2RlZjEyMzQ1NlwiLFwiaW52b2tlZEZ1bmN0aW9uQXJuXCI6XCJhcm46YXdzOmxhbWJkYTpldS13ZXN0LTE6MTIzNDU2Nzg5MDEyOmZ1bmN0aW9uOmZvby1iYXItZnVuY3Rpb25cIixcImF3c1JlcXVlc3RJZFwiOlwiYzZhZjlhYzYtN2I2MS0xMWU2LTlhNDEtOTNlODEyMzQ1Njc4XCJ9fSJ9'
		}
	}
};

const response = await handler(event, context);
console.log(response);