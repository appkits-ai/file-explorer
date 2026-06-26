import { config as reactConfig } from "@appkits-ai/eslint-config/react-internal";

export default [
  ...reactConfig,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      ".codegraph/**",
      ".codex/**",
      ".worktrees/**",
    ],
  },
  {
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
