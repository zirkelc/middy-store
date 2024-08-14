# Amazon S3 Store for `middy-store`

This package provides a Store implementation for `middy-store` that uses Amazon S3 to store and load payloads. It uses the `@aws-sdk/client-s3` to interact with Amazon S3.

## Install

```sh
npm install middy-store middy-store-s3
```

## Usage

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

### Options

The `S3Store` accepts the following options:

| Option     | Type                                      | Default                   | Description |
| ---------- | ----------------------------------------- | ------------------------- | ----------- |
| `bucket`   | `string \| Fn<string>`                    | **Required**              | The name of the S3 bucket to store the payloads. |
| `key`      | `string \| Fn<string>`                    | `randomUUID`              | The key to store the payload in the bucket. Defaults to `randomUUID()` from `node:crypto`. |
| `config`   | `S3ClientConfig  \| Fn<S3ClientConfig>`   | `{}`                      | The [S3 client configuration](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Interface/S3ClientConfig/).|
| `format`   | `S3ReferenceFormat`                       | `url-s3-global-path`      | The format of the S3 reference: `arn`, `object` or one of the URL formats from [amazon-s3-url](https://www.npmjs.com/package/amazon-s3-url) package. Defaults to S3 URI format `s3://<bucket>/<...keys>`. |
| `maxSize`  | `number`                                  | `undefined`               | The maximum payload size in bytes that can be stored in S3. If the payload exceeds this size, it will not be stored in S3. |
| `logger`   | `Logger`                                  | `undefined`               | The logger function to use for logging. |