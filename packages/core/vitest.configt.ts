import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.root.js";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			typecheck: {
				enabled: true,
			},
		},
	}),
);
