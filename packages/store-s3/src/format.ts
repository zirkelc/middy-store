/**
 * Path-style format:
 *  `s3.<region-name>.amazonaws.com/<bucket-name>/<key-name>`
 *
 * Virtual-hosted-style format:
 *  `<bucket-name>.s3.<region-code>.amazonaws.com/<key-name>`
 *
 * @see https://docs.aws.amazon.com/general/latest/gr/s3.html
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html
 */
export type S3UrlFormat =
	| "s3-global-path"
	| "s3-legacy-path"
	| "s3-legacy-virtual-hosted"
	| "s3-region-path"
	| "s3-region-virtual-hosted"
	| "http-legacy-path"
	| "http-legacy-virtual-hosted"
	| "http-region-path"
	| "http-region-virtual-hosted";

export type S3Object = {
	bucket: string;
	key: string;
	region?: string;
};

function assertBucket(bucket: unknown): asserts bucket is string {
	if (typeof bucket !== "string" || bucket.length === 0)
		throw new Error(`Invalid S3 bucket: ${bucket}`);
}

function assertKey(key: unknown): asserts key is string {
	if (typeof key !== "string" || key.length === 0)
		throw new Error(`Invalid S3 key: ${key}`);
}

function assertRegion(region: unknown): asserts region is string {
	if (typeof region !== "string" || region.length === 0)
		throw new Error(`Invalid S3 region: ${region}`);
}

/**
 * <bucket-name>/<key-name>
 */
const GLOBAL_PATH_STYLE_REGEX = /^(?<bucket>[^/]+)\/(?<key>.+)$/;

/**
 * s3.amazonaws.com/<bucket-name>/<key-name>
 */
const LEGACY_PATH_STYLE_REGEX =
	/^s3\.amazonaws\.com\/(?<bucket>[^/]+)\/(?<key>.+)$/;

/**
 * s3.<region-name>.amazonaws.com/<bucket-name>/<key-name>
 */
const REGION_PATH_STYLE_REGEX =
	/^s3\.(?<region>[^.]+)\.amazonaws\.com\/(?<bucket>[^/]+)\/(?<key>.+)$/;

/**
 * <bucket-name>.s3.amazonaws.com/<key-name>
 */
const LEGACY_VIRTUAL_HOSTED_STYLE_REGEX =
	/^(?<bucket>[^.]+)\.s3\.amazonaws\.com\/(?<key>.+)$/;

/**
 * <bucket-name>.s3.<region-name>.amazonaws.com/<key-name>
 */
const REGION_VIRTUAL_HOSTED_STYLE_REGEX =
	/^(?<bucket>[^.]+)\.s3\.(?<region>[^.]+)\.amazonaws\.com\/(?<key>.+)$/;

/**
 * Returns true if the given S3 URL is in path-style format.
 * @param s3url
 * @returns
 */
const isGlobalPathStyle = (s3url: string): boolean => {
	return GLOBAL_PATH_STYLE_REGEX.test(s3url);
};

const isRegionPathStyle = (s3url: string): boolean => {
	return REGION_PATH_STYLE_REGEX.test(s3url);
};

const isLegacyPathStyle = (s3url: string): boolean => {
	return LEGACY_PATH_STYLE_REGEX.test(s3url);
};

const formatGlobalPath = (s3Object: S3Object): string => {
	const { bucket, key } = s3Object;
	assertBucket(bucket);
	assertKey(key);

	return `${bucket}/${key}`;
};

const formatLegacyPath = (s3Object: S3Object): string => {
	return `s3.amazonaws.com/${formatGlobalPath(s3Object)}`;
};

const formatRegionPath = (s3Object: S3Object): string => {
	const { region } = s3Object;
	assertRegion(region);

	return `s3.${region}.amazonaws.com/${formatGlobalPath(s3Object)}`;
};

const parseGlobalPathStyle = (s3url: string): S3Object => {
	const match = s3url.match(GLOBAL_PATH_STYLE_REGEX);
	if (!match) throw new Error(`Invalid S3 path-style URL: ${s3url}`);

	const { bucket, key } = match.groups!;
	assertBucket(bucket);
	assertKey(key);

	return { bucket, key };
};

const parseRegionPathStyle = (s3url: string): S3Object => {
	const match = s3url.match(REGION_PATH_STYLE_REGEX);
	if (!match) throw new Error(`Invalid S3 path-style URL: ${s3url}`);

	const { bucket, key, region } = match.groups!;
	assertBucket(bucket);
	assertKey(key);
	assertRegion(region);

	return { bucket, key, region };
};

const parseLegacyPathStyle = (s3url: string): S3Object => {
	const match = s3url.match(LEGACY_PATH_STYLE_REGEX);
	if (!match) throw new Error(`Invalid S3 path-style URL: ${s3url}`);

	const { bucket, key } = match.groups!;
	assertBucket(bucket);
	assertKey(key);

	return { bucket, key };
};

const isRegionVirtualHostedStyle = (s3url: string): boolean => {
	return REGION_VIRTUAL_HOSTED_STYLE_REGEX.test(s3url);
};

const isLegacyVirtualHostedStyle = (s3url: string): boolean => {
	return LEGACY_VIRTUAL_HOSTED_STYLE_REGEX.test(s3url);
};

const formatLegacyVirtualHostedStyle = (s3Object: S3Object): string => {
	const { bucket, key } = s3Object;
	assertBucket(bucket);
	assertKey(key);

	return `${bucket}.s3.amazonaws.com/${key}`;
};

const formatRegionVirtualHostedStyle = (s3Object: S3Object): string => {
	const { bucket, key, region } = s3Object;
	assertBucket(bucket);
	assertKey(key);
	assertRegion(region);

	return `${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const parseRegionVirtualHostedStyle = (s3url: string): S3Object => {
	const match = s3url.match(REGION_VIRTUAL_HOSTED_STYLE_REGEX);
	if (!match) throw new Error(`Invalid S3 virtual-hosted-style URL: ${s3url}`);

	const { bucket, key, region } = match.groups!;
	assertBucket(bucket);
	assertKey(key);
	assertRegion(region);

	return { bucket, key, region };
};

const parseLegacyVirtualHostedStyle = (s3url: string): S3Object => {
	const match = s3url.match(LEGACY_VIRTUAL_HOSTED_STYLE_REGEX);
	if (!match) throw new Error(`Invalid S3 virtual-hosted-style URL: ${s3url}`);

	const { bucket, key } = match.groups!;
	assertBucket(bucket);
	assertKey(key);

	return { bucket, key };
};

const splitUrl = (s3url: string): [string, string] => {
	const url = new URL(s3url);
	const protocol = url.protocol;
	const hostAndPath = s3url.split("://")[1];

	return [protocol, hostAndPath];
};

export const isS3Url = (s3url: unknown): s3url is string => {
	if (typeof s3url !== "string") return false;

	const [protocol, hostAndPath] = splitUrl(s3url);

	if (protocol !== "s3" && protocol !== "http" && protocol !== "https")
		throw new Error(`Unsupported S3 URL protocol: ${protocol}`);

	return (
		isGlobalPathStyle(s3url) ||
		isRegionPathStyle(s3url) ||
		isLegacyPathStyle(s3url) ||
		isRegionVirtualHostedStyle(s3url) ||
		isLegacyVirtualHostedStyle(s3url)
	);
};

export const parseS3Url = (s3url: string): S3Object => {
	const [protocol, hostAndPath] = splitUrl(s3url);

	if (protocol !== "s3" && protocol !== "http" && protocol !== "https")
		throw new Error(`Unsupported S3 URL protocol: ${protocol}`);

	if (isGlobalPathStyle(s3url)) return parseGlobalPathStyle(hostAndPath);

	if (isRegionPathStyle(s3url)) return parseRegionPathStyle(hostAndPath);

	if (isRegionVirtualHostedStyle(s3url))
		return parseRegionVirtualHostedStyle(hostAndPath);

	if (isLegacyPathStyle(s3url)) return parseLegacyPathStyle(hostAndPath);

	if (isLegacyVirtualHostedStyle(s3url))
		return parseLegacyVirtualHostedStyle(hostAndPath);

	throw new Error(`Unsupported S3 URL format: ${s3url}`);
};

export const formatS3Url = (
	s3Object: S3Object,
	format: S3UrlFormat = "s3-global-path",
): string => {
	switch (format) {
		case "s3-global-path":
			return `s3://${formatGlobalPath(s3Object)}`;

		case "s3-legacy-path":
			return `s3://${formatLegacyPath(s3Object)}`;

		case "s3-legacy-virtual-hosted":
			return `s3://${formatLegacyVirtualHostedStyle(s3Object)}`;

		case "http-legacy-path":
			return `http://${formatLegacyPath(s3Object)}`;

		case "http-legacy-virtual-hosted":
			return `http://${formatLegacyVirtualHostedStyle(s3Object)}`;

		case "s3-region-path":
			return `s3://${formatRegionPath(s3Object)}`;

		case "s3-region-virtual-hosted":
			return `s3://${formatRegionVirtualHostedStyle(s3Object)}`;

		case "http-region-path":
			return `http://${formatRegionPath(s3Object)}`;

		case "http-region-virtual-hosted":
			return `http://${formatRegionVirtualHostedStyle(s3Object)}`;

		default:
			format satisfies never;
			throw new Error(`Unknown S3 URL format: ${format}`);
	}
};
