import { Handler } from "aws-lambda";
import middy from '@middy/core'
import { loadInput, storeOutput } from 'middy-input-output-store';
import { S3Store } from 'middy-input-output-store-s3';
import { randomBytes, randomUUID } from "crypto";

const MAX_OUTPUT_SIZE_KB = 256; // https://docs.aws.amazon.com/step-functions/latest/dg/limits.html

type GenerateLargePayloadInput = {
  sizeInKb?: number;
}

type GenerateLargePayloadOutput = {
  sizeInKb: number;
  payload: string;
}


const GenerateLargePayload: Handler<GenerateLargePayloadInput> = async (event, context): Promise<GenerateLargePayloadOutput> => {
  console.log("Generating large payload", { event, });

  // Generate a large payload
  const payload = randomBytes((event.sizeInKb ?? MAX_OUTPUT_SIZE_KB) * 1024).toString("base64");

  const output = {
    sizeInKb: Buffer.byteLength(payload, "utf8"),
    payload,
  };

  console.log("Generated payload", { output, });

  return output;
}

const LoopGenerateLargePayload: Handler<GenerateLargePayloadInput> = async (event, context): Promise<GenerateLargePayloadOutput> => {
  console.log("Generating large payload", { event, });

  // Generate a large payload
  const payload = randomBytes((event.sizeInKb ?? MAX_OUTPUT_SIZE_KB) * 1024).toString("base64");

  const output = {
    sizeInKb: Buffer.byteLength(payload, "utf8"),
    payload,
  };

  console.log("Generated payload", { output, });

  return output;
}

const PrintLargePayload: Handler<GenerateLargePayloadOutput> = async (event, context): Promise<undefined> => {
  console.log("Printing large payload", { event, });

  console.log("Expected payload size", event.sizeInKb)
  console.log("Payload size", Buffer.byteLength(event.payload, "utf8"));

  return undefined;
}

const LoopPrintLargePayload: Handler<GenerateLargePayloadOutput> = async (event, context): Promise<undefined> => {
  console.log("Printing large payload", { event, });

  console.log("Expected payload size", event.sizeInKb)
  console.log("Payload size", Buffer.byteLength(event.payload, "utf8"));

  return undefined;
}



const store = new S3Store({
  bucket: process.env.PAYLOAD_BUCKET!,
  key: randomUUID(),
});

export const GenerateLargePayloadHandler = middy()
  .use(storeOutput({
    // logger: console.log,
    // maxSize: 0,
    selector: 'payload',
    stores: [store]
  }))
  .handler(GenerateLargePayload);

export const PrintLargePayloadHandler = middy()
  .use(loadInput({
    // logger: console.log,
    // maxSize: 0,
    stores: [store]
  }))
  .handler(PrintLargePayload);

export const LoopGenerateLargePayloadHandler = middy()
  .use(storeOutput({
    // logger: console.log,
    // maxSize: 0,
    selector: "payload",
    stores: [store]
  }))
  .handler(LoopGenerateLargePayload);

export const LoopPrintLargePayloadHandler = middy()
  .use(loadInput({
    // logger: console.log,
    // maxSize: 0,
    stores: [store]
  }))
  .handler(LoopPrintLargePayload);