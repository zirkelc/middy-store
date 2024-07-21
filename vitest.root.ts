import GithubActionsReporter from "vitest-github-actions-reporter";
import { defineConfig } from "vitest/config";

// load region from config to prevent error "ConfigError: Missing region in config"
// https://github.com/aws/aws-sdk-js/pull/1391
// process.env.AWS_SDK_LOAD_CONFIG = "1";

export default defineConfig({
	test: {
		// https://github.com/sapphi-red/vitest-github-actions-reporter
		reporters: process.env.GITHUB_ACTIONS
			? ["default", new GithubActionsReporter()]
			: "default",

		// https://vitest.dev/config/#typecheck
		typecheck: {
			enabled: true,
			ignoreSourceErrors: false,
		},

		// https://vitest.dev/guide/coverage.html
		coverage: {
			provider: "v8",
			// json-summary is required for https://github.com/davelosert/vitest-coverage-report-action
			reporter: ["json-summary", "json", "text-summary"],
			thresholds: {
				lines: 80,
				statements: 80,
				functions: 80,
				branches: 80,
			},
		},
	},
});
