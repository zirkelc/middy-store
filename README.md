# Middleware middy-store

`middy-store` is a middleware for Middy to automatically store and load payloads from and to a Store like Amazon S3.

## Motivation

When working with AWS, tehre are certain limits to be aware of. For example, AWS Lambda has a payload limit of 6MB for synchronous invocations and 256KB for asynchronous invocations. AWS Step Functions allows for a maximum input or output size of 256KB of data as a UTF-8 encoded string. That means if you return large payloads from your Lambda, you need to check the size of your payload and save it temporarily in persistent storage like Amazon S3. Then you have to return the object URL or ARN to the payload in S3. The next Lambda has to check if there is a URL or ARN in the payload and load the payload from S3. This results in a lot of boilerplate code to check the size and store and load the payload, which has to be repeated in every Lambda. Even more problematic is if instead of saving the full output from a Lambda, you only want to save a part of the output to S3 and keep the rest intact. This is often teh case with Step Fucntions when some of the payload is used for the control flow, for example for `Choice` or `Map` states. The rpobem here is that the first Lambda saves a partial paylooad to S3 and the next Lambda has to load the partial payload from S3 and merge it with the rest of the payload. That means you have to make sur ethat the types are consistent across multiple functions. This is of course very error prone.

# How it works

`middy-store` is a middleware for Middy. It receievs the input for a Lambda function before the handler is called, and it receives the output after the handler has finished. Let's start with the output: `middy-store` receives the output from the handler function and checks the size of the entire payload. To calculate the size, it optionally strigifes the payload and uses `Buffer.byteLength()` to calculate the UTF-8 encoded size of the payload. If the size is larger than a certain threshold, the payload is stored in a Store like Amazon S3. The reference to the stored payload (e.g. S3 URL or ARN) is then returned as the output instead of the original payload. 

The next Lambda function receives this output as its input. `middy-store` will then check if there is a reference to a stored payload in the input. If there is a reference, the original payload is loaded from the Store and returned as the ionput to the handler function. The handler function can then use the payload as if it was passed directly to the Lambda function.

Here's an example to illustrate how `middy-store` works:

```ts
// ./src/functions/handler1.ts
export const handler1 = middy()
	.use(
		middyStore({
			stores: [new S3Store({ /* S3 options */ })],
		})
	)
	.handler(async (input) => {
		// output 1MB of random data as base64 encoded string
		return randomBytes(1024 * 1024).toString('base64');
	});

// ./src/functions/handler2.ts
export const handler2 = middy()
	.use(
		middyStore({
			stores: [new S3Store({ /* S3 options */ })],
		})
	)
	.handler(async (input) => {
		// input is the 1MB of random data
		return console.log(`Size: ${Buffer.from(input, "base64").byteLength / 1024 / 1024} MB`,);
	});


// The output is now a reference to the stored payload in S3
const output1 = await handler1({});

// Print the reference object
// { "@middy-store": "s3://my-bucket/my-key"}
console.log(output); 

// Pass the output as input to the next Lambda
const output2 = await handler2(output1);
```

## What is a Store?
In general, a Store is any service that allows you to write and read abriraty payloads like objects, for example Amazon S3 or other persistent storages. But also databases like DynamoDB can act as a Store. 
The Store receives a payload from the Lambda function and stores it in a persistent storage and it loads the payload from the storage and returns it to the Lambda function. 

`middy-store` interacts with a Store through a `Store` interface which every Store has to implement. 
The interface defines the functions `canWrite` and `write` to store payloads, and `canRead` and `read` to laod payloads. 
The `canWrite` and `canRead` act as guardrails to check if the Store can write or read a certain payload. 
For example, the maximum item size in DynamoDB is 400KB, so if the payload is larger than that, `canWrite` should return `false`.

The `write` function receives a payload, stores it it's persistent storage and returns a reference to the stored payload.
The reference is a unique ID to identify the stored payload within the underlying service. 
For example, in Amazon S3 the reference is the S3 URI in the format `s3://<bucket>/<...keys>` to the object in the bucket.
Other Amazon services might use ARNs or other identifiers.

The `read` function receives the reference to a stored payload, loads the payload from the persistent storage and returns it.
