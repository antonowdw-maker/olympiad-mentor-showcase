import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // REQ-QA-02: домен lib/*; в метрику входят файлы с поведенческими тестами
      // (в т.ч. plan/service, hint-progress, submit-answer).
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/*.test.ts",
        // Неизмеримые / тонкие обёртки Next·Auth·Prisma·транспорт
        "lib/auth/**",
        "lib/db.ts",
        "lib/plan/actions.ts",
        "lib/plan/topic-choices.ts",
        "lib/plan/resolve-request-topic.ts",
        "lib/mentor/actions.ts",
        "lib/content/queries.ts",        "lib/content/render-md.ts",
        "lib/progress/queries.ts",
        "lib/trainer/open-hint.ts",
      ],
      reporter: ["text", "text-summary"],
      thresholds: {
        // Ориентир SRS ~85%; порог чуть ниже — правдивая метрика после включения service/
        // submit-answer / hint-progress, не «накрутка» exclude
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 65,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Реальный server-only бросает при import; в unit подменяем пустышкой
      "server-only": path.resolve(__dirname, "test/stubs/server-only.js"),
    },
  },
});
