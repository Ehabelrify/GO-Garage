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
    // Tests never rely on the development fallback for the customer QR secret: every run, local or CI, derives codes from this
    // fixed test-only value. It is not a real secret and is never used outside Vitest.
    env: { WARRANTY_QR_SECRET: "vitest-only-warranty-qr-secret" },
    include: [
      "src/**/*.test.ts",
      "../server/**/*.test.ts",
      "../../packages/domain/**/*.test.ts",
    ],
  },
});
