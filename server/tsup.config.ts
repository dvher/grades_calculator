import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  // The calc workspace ships TypeScript sources, so bundle it into the server.
  noExternal: ["@grades/calc"],
});
