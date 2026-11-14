import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "../server/**/*.test.ts",
      "../../packages/domain/**/*.test.ts",
    ],
  },
});
