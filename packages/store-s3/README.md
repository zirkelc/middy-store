# Amazon S3 Store `middy-store-s3`

This package provides a Store implementation for [`middy-store`](https://github.com/zirkelc/middy-store) that uses Amazon S3 to store and load payloads. It uses the `@aws-sdk/client-s3` to interact with Amazon S3.

## Prerequisites
This package `middy-store-s3` and its docs only cover the Amazons S3 Store. Please read the docs for [`middy-store`](https://github.com/zirkelc/middy-store) for more information on how to use the `middy-store` package.

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
          key: ({ payload }) => randomUUID(),
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

## IAM Permissions

The S3 Store requires specific IAM permissions to function properly. The required permissions depend on the features you use:

### Basic Operations
For storing and loading payloads, the following permissions are required:
- `s3:PutObject` - Required to store payloads in the S3 bucket
- `s3:GetObject` - Required to load payloads from the S3 bucket

If you enable the `deleteAfterLoad` option in `loadingOptions`, you also need:
- `s3:DeleteObject` - Required to delete payloads after they have been loaded

### Example IAM Policy

> **Note**: Replace `your-bucket-name` with the actual name of your S3 bucket. If you use multiple buckets, include all bucket ARNs in the `Resource` array.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```
