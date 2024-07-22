# Middleware middy-store

`middy-store` is a middleware for Middy to automatically save and load payloads from and to a store like Amazon S3.

## Motivation

When working with AWS, tehre are certain limits to be aware of. For example, AWS Lambda has a payload limit of 6MB for synchronous invocations and 256KB for asynchronous invocations. AWS Step Functions allows for a maximum input or output size of 256KB od data as a UTF-8 encoded string. That means if you return large payloads from your Lambda, you need to check the size of your payload and save it temporarily in persistent storage like Amazon S3. Then you have to return the object URL or ARN to the payload in S3. The next Lambda has to check if there is a URL or ARN in the payload and load the payload from S3.