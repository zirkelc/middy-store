import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [],
	test: {
		// https://vitest.dev/config/#typecheck
		typecheck: {
			enabled: true,
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
