import middy from '@middy/core'
import store from '../../src/index'
import type { Handler } from 'aws-lambda'
import { S3Store } from '../../src/stores/s3';

const lambdaHandler: Handler = (event, context) => {

}

export const handler = middy()
	.use(store({
		stores: [
			new S3Store({
				bucket: 'my-bucket',
				key: 'my-key',
			})]
	}))
	.handler(lambdaHandler);