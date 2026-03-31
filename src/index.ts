// Intentional LM Studio plugin-root entry shim.
// Keep this file so `lms dev` and plugin publishing can treat the repo root as the plugin root,
// while the actual implementation lives in the workspace package.
export * from "../packages/adapter-lmstudio/src/index";
