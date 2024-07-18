import { configDefaults, defineWorkspace } from "vitest/config";

export default defineWorkspace([
	{
		test: {
			name: "unit",
			include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
			exclude: [...configDefaults.exclude, "tests"],

			// https://vitest.dev/config/#typecheck
			typecheck: {
				enabled: true,
			},
		},
	},
	{
		test: {
			name: "e2e",
			include: ["**/tests/*.{test,spec}.?(c|m)[jt]s?(x)"],
		},
	},
]);
