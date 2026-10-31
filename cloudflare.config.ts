import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => ({
  accountId: "1c69f973b0d62a313dee95603b7e1b77",
  worker: {
    name: "food-auto",
    // The installed local workerd binary is one day behind production.
    compatibilityDate: mode === "development" ? "2026-10-30" : "2026-10-31",
    entrypoint: "./worker/index.ts",
    workersDev: true,
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*", "/telegram/*"],
    },
    env: {
      DB: bindings.d1({
        name: "food-auto-db",
        id: "9322e9a8-12ae-482c-8548-04ed519062a3",
      }),
      BOT_TOKEN: bindings.secret(),
      GEMINI_API_KEY: bindings.secret(),
      WEBHOOK_SECRET: bindings.secret(),
      GEMINI_MODEL: bindings.text("gemini-2.5-flash-lite"),
      BOT_USERNAME: bindings.text("food_autotest_bot"),
    },
    observability: {
      enabled: true,
      redactQueryString: true,
      traces: { enabled: true, headSamplingRate: 0.1 },
    },
  },
}));
