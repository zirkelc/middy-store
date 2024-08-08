# Middleware `middy-store` for Middy

`middy-store` is a middleware for Middy that automatically stores and loads payloads from and to a store, like Amazon S3.

## Installation
You will need [@middy/core](https://www.npmjs.com/package/@middy/core) >= v5 to use `middy-store`.

```sh
npm install @middy/core middy-store middy-store-s3 
```

## Motivation

When working with AWS, there are certain limits to be aware of. For example, AWS Lambda has a payload limit of 6MB for synchronous invocations and 256KB for asynchronous invocations. AWS Step Functions allows for a maximum input or output size of 256KB of data as a UTF-8 encoded string. This means that if you return large payloads from your Lambda, you need to check the size of your payload and save it temporarily in persistent storage, such as Amazon S3. Then you have to return the object URL or ARN to the payload in S3. The next Lambda must check if there is a URL or ARN in the payload and load the payload from S3. This results in a lot of boilerplate code to check the size, store, and load the payload, which has to be repeated in every Lambda. An even more problematic scenario is when, instead of saving the full output from a Lambda, you only want to save a part of the output to S3 and keep the rest intact. This is often the case with Step Functions when some of the payload is used for the control flow, for example, for `Choice` or `Map` states. The problem here is that the first Lambda saves a partial payload to S3, and the next Lambda has to load the partial payload from S3 and merge it with the rest of the payload. This means you have to ensure that the types are consistent across multiple functions, which is, of course, very error-prone.

## How it works

`middy-store` is a middleware for Middy. It receives the input for a Lambda function before the handler is called, and it receives the output after the handler has finished. Let's start with the output: `middy-store` receives the output from the handler function and checks the size of the entire payload. To calculate the size, it optionally stringifies the payload and uses `Buffer.byteLength()` to calculate the UTF-8 encoded size of the payload. If the size is larger than a certain threshold, the payload is stored in a store like Amazon S3. The reference to the stored payload (e.g., S3 URL or ARN) is then returned as the output instead of the original payload.

The next Lambda function receives this output as its input. `middy-store` will then check if there is a reference to a stored payload in the input. If there is a reference, the original payload is loaded from the store and returned as the input to the handler function. The handler function can then use the payload as if it was passed directly to the Lambda function.

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
    return console.log(`Size: ${Buffer.from(input, "base64").byteLength / 1024 / 1024} MB`);
  });

// ./src/workflow.ts
// The output is now a reference to the stored payload in S3
const output1 = await handler1({});

// Print the returned reference
// { "@middy-store": "s3://my-bucket/my-key"}
console.log(output1); 

// Pass the output as input to the next Lambda
const output2 = await handler2(output1);
```

### What's a Store?

In general, a store is any service that allows you to write and read arbitrary objects, for example, Amazon S3 or other persistent storage. But also databases like DynamoDB can act as a store. The store receives a payload from the Lambda function, serializes and stores it in persistent storage, or it loads the payload from storage, deserializes it, and returns it to the Lambda function.

`middy-store` interacts with a store through a `StoreInterface` interface which every store has to implement. The interface defines the functions `canStore()` and `store()` to store payloads, and `canLoad()` and `load()` to load payloads.

```ts
interface StoreInterface<TPayload = unknown, TReference = unknown> {
  name: string;
  canLoad: (args: LoadArgs<unknown>) => boolean;
  load: (args: LoadArgs<TReference | unknown>) => Promise<TPayload>;
  canStore: (args: StoreArgs<TPayload>) => boolean;
  store: (args: StoreArgs<TPayload>) => Promise<TReference>;
}
```

The `canStore()` function acts as a guardrail to check if the store can write a given payload. It receives the payload and its size and checks if the payload fits within the allowed size limits of the store. For example, a store backed by DynamoDB has a maximum item size of 400KB, while an S3 store has effectively no limit on the object size.

The `store()` function receives a payload, stores it in persistent storage, and returns a reference to the stored payload. The reference is a unique ID to identify the stored payload within the underlying service. For example, in Amazon S3, the reference is the S3 URI in the format `s3://<bucket>/<...keys>` to the object in the bucket. Other Amazon services might use ARNs or other identifiers.

The `canLoad()` function is like a filter to check if the store can read a given reference. It receives the reference to a stored payload and checks if it points to a valid object in persistent storage. For example, an S3 store would check if the reference is a valid S3 URI, while a DynamoDB store would check if the reference is a valid ARN.

The `load()` function receives the reference to a stored payload, loads the payload from persistent storage, and returns it. The payload will be deserialized according to the metadata that was stored alongside it. For example, a JSON payload will be deserialized to a JavaScript object.

### Single and Multiple Stores

Most of the time, you will only need one store, like Amazon S3, which can effectively store any payload. However, `middy-store` lets you work with multiple stores at the same time. This can be useful if you want to store different types of payloads in different stores. For example, you might want to store large payloads in S3 and small payloads in DynamoDB.

`middy-store` accepts an `Array<StoreInterface>` in the options to provide one or more stores. When `middy-store` runs before the handler function and finds a reference in the payload, it will iterate over the stores and call the `canLoad()` function with the reference on each store. The first store that returns `true` will be used to load the payload with the `load()` function.

On the other hand, when `middy-store` runs after the handler function and the payload is larger than the maximum allowed size, it will iterate over the stores and call the `canStore()` function on each store. The first store that returns `true` will be used to store the payload with the `store()` function.

Therefore, it is important to note that the order of the stores in the array is important. 

### References

When a payload is stored in a store, `middy-store` will return a reference to the stored payload. The reference is a unique identifier to find the stored payload in the store. The value of the identifier depends on the store and its configuration. For example, an S3 store will use S3 URIs in the format `s3://<bucket>/<...keys>` as a reference to the payload. However, it can also be configured to return other formats, like an object ARNs `arn:aws:s3:::<bucket>/<...keys>` or a structured object with the bucket and key.

The returned output from the handler function will contain the reference to the stored payload:

```ts
{
  "@middy-store": "s3://my-bucket/my-key"
}
```

`middy-store` embeds the reference in the output as a property with the key `"@middy-store"`. This allows `middy-store` to quickly find all references when the next Lambda function is called and load the payloads from the store.

### Selecting a Payload

By default, `middy-store` will store the entire output of the handler function as a payload in the store. However, you can also select only a part of the output to be stored in the store. This is useful for workflows like AWS Step Functions, where you might need some of the payload for the control flow.

`middy-store` accepts a `selector` property in its `storeOpts` options. The `selector` is a string path to the value in the output that should be stored in the store.

Here's an example:

```ts
const output = {
  a:

 {
    b: ['foo', 'bar', 'baz'],
  },
};

export const handler = middy()
  .use(
    middyStore({
      stores: [new S3Store({ /* S3 options */ })],
      storeOpts: {
        selector: '', 					// select the entire output as payload
        // selector: 'a'; 			// selects the payload at the path 'a'
        // selector: 'a.b'; 		// selects the payload at the path 'a.b'
        // selector: 'a.b[0]'; 	// selects the payload at the path 'a.b[0]'
        // selector: 'a.b[*]'; 	// selects the payloads at the paths 'a.b[0]', 'a.b[1]', 'a.b[2]', etc.
      }
    })
  )
  .handler(async () => output);

await handler({});
```

The default selector is an empty string (or undefined), which selects the entire output as the payload. In this case, `middy-store` will return an object with only one property, which is the reference to the stored payload.

```ts
// selector: ''
{
  "@middy-store": "s3://my-bucket/my-key"
}
```

With selectors like `a`, `a.b`, or `a.b[0]`, `middy-store` will select the value at the path and store only part of the output in the store. The reference to the stored payload will be inserted at the path in the output, thereby replacing the original value.

```ts
// selector: 'a'
{
  a: {
    "@middy-store": "s3://my-bucket/my-key"
  }
}
// selector: 'a.b'
{
  a: {
    b: {
      "@middy-store": "s3://my-bucket/my-key"
    }
  }
}
// selector: 'a.b[0]'
{
  a: {
    b: [
      { "@middy-store": "s3://my-bucket/my-key" }, 
      'bar', 
      'baz'
    ]
  }
}
```

A selector ending with `[*]` like `a.b[*]` acts like an iterator. It will select the array at `a.b` and store each element in the array in the store separately. Each element will be replaced with the reference to the stored payload.

```ts
// selector: 'a.b[*]'
{
  a: {
    b: [
      { "@middy-store": "s3://my-bucket/my-key" }, 
      { "@middy-store": "s3://my-bucket/my-key" }, 
      { "@middy-store": "s3://my-bucket/my-key" }
    ]
  }
}
```

### Size Limit

`middy-store` will calculate the size of the entire output returned from the handler function. The size is calculated by stringifying the output, if it's not already a string, and calculating the UTF-8 encoded size of the string in bytes. It will then compare this size to the configured size limit in bytes. If the output exceeds the limit, it will store the output or a part of it in the store.

The size can be configured with the `size` property in the `storeOpts` options and must be a number. `middy-store` provides a `MaxSize` helper object with some predefined sizes for Lambda and Step Functions. If `size` is not specified, `middy-store` will use `MaxSize.STEP_FUNCTIONS` with 256KB as the default size limit.

```ts
export const handler = middy()
  .use(
    middyStore({
      stores: [new S3Store({ /* S3 options */ })],
      storeOpts: {
        minSize: Sizes.STEP_FUNCTIONS, 	// 256KB
        // minSize: Sizes.LAMBDA_SYNC, 	// 6MB
        // minSize: Sizes.LAMBDA_ASYNC, // 256KB
        // minSize: 1024 * 1024, 				// 1MB
        // minSize: Sizes.ZERO, 				// 0B
        // minSize: Sizes.INFINITY, 		// Infinity
      }
    })
  )
  .handler(async () => output);

await handler({});
```

#### Options

The `middyStore()` function accepts the following options:

| Option          | Type                            | Default                   | Description |
| --------------- | ------------------------------- | ------------------------- | ----------- |
| `stores`        | `Array<StoreInterface>`         | **Required**              | An array of store implementations to store and load payloads. |
| `loadOpts`      | `LoadOptions`                   | `undefined`               | The options for loading payloads from the store. |
| `loadOpts.skip` | `boolean`                       | `undefined`               | Skip loading the payload from the store, even if the input contains a reference. |
| `loadOpts.passThrough` | `boolean`                | `undefined`               | Pass the input through if no store was found to load the reference. |
| `storeOpts`     | `StoreOptions`                  | `undefined`               | The options for storing payloads into the store. |
| `storeOpts.skip` | `boolean`                      | `undefined`               | Skip storing the payload in the store, even if the output exceeds the maximum size. |
| `storeOpts.passThrough` | `boolean`               | `undefined`               | Pass the output through if no store was found to store the payload. |
| `storeOpts.selector` | `string`                   | `undefined`               | Selects the payload from the output to store in the store. |
| `storeOpts.size` | `number`                       | `MaxSize.STEP_FUNCTIONS`  | The maximum output size in bytes before the output is stored in the store. If the output exceeds this size, it will be stored in a store. Defaults to 256KB, the maximum output size for [Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/limits-overview.html). |
| `logger`        | `Logger`                        | `undefined`               | The logger function to use for logging. |

## Stores

### Amazon S3

The `middy-store-s3` package provides a store implementation for Amazon S3. It uses the `@aws-sdk/client-s3` to interact with S3.

```ts
import { middyStore } from 'middy-store';
import { S3Store } from 'middy-store-s3';

const handler = middy()
  .use(
    middyStore({
      stores: [
        new S3Store({
          config: { region: "us-east-1" },
          bucket: "bucket",
          key: () => randomUUID(),
          format: "arn",
        }),
      ],
    }),
  )
  .handler(async (input) => {
    return {
      random: randomBytes(1024 * 1024).toString("hex"),
    };
  });
```

#### Options

The `S3Store` accepts the following options:

| Option     | Type                                      | Default                   | Description |
| ---------- | ----------------------------------------- | ------------------------- | ----------- |
| `config`   | `S3ClientConfig  \| Fn<S3ClientConfig>`   | `{}`                      | The [S3 client configuration](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Interface/S3ClientConfig/).|
| `bucket`   | `string \| Fn<string>`                    | **Required**              | The name of the S3 bucket to store the payloads. |
| `key`      | `string \| Fn<string>`                    | `randomUUID`              | The key to store the payload in the bucket. Defaults to `randomUUID()` from `node:crypto`. |
| `format`   | `S3ReferenceFormat`                       | `url-s3-global-path`      | The format of the S3 reference: `arn`, `object` or one of the URL formats from [amazon-s3-url](https://www.npmjs.com/package/amazon-s3-url) package. Defaults to S3 URI format `s3://<bucket>/<...keys>`. |
| `maxSize`  | `number`                                  | `undefined`               | The maximum payload size in bytes that can be stored in S3. If the payload exceeds this size, it will not be stored in S3. |
| `logger`   | `Logger`                                  | `undefined`               | The logger function to use for logging. |

### Custom Store

You can create your own store by implementing the `StoreInterface` interface. The store can be implemented as a class or a simple object, as long as it provides the required functions.

Here's an example of a store to store and load payloads as base64 encoded [data URLs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs#datatextplainbase64sgvsbg8sifdvcmxkiq):

```ts
import { StoreInterface, middyStore } from 'middy-store';

const base64Store: StoreInterface<object, string> = {
  name: "base64",
  canLoad: ({ reference }) => {
    return (
      typeof reference === "string" &&
      reference.startsWith("data:text/plain;base64,")
    );
  },
  load: async ({ reference }) => {
    const base64 = reference.replace("data:text/plain;base64,", "");
    return JSON.parse(Buffer.from(base64, "base64").toString());
  },
 

 canStore: ({ payload }) => {
    return typeof payload === "string";
  },
  store: async ({ payload }) => {
    const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    return `data:text/plain;base64,${base64}`;
  },
};

const handler = middy()
  .use(
    middyStore({
      stores: [base64Store],
    }),
  )
  .handler(async (input) => {
    return {
      random: randomBytes(1024 * 1024).toString("hex"),
    };
  });
```

## Packages

- [`middy-store`](./packages/core/): This is the core package of `middy-store` and provides the middleware function `middyStore()` for Middy to use.
- [`middy-store-s3`](./packages/store-s3/): This package provides a store implementation for Amazon S3. It uses the `@aws-sdk/client-s3` to interact with S3.
```