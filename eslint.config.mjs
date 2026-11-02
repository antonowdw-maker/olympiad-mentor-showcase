import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 отдаёт плоский конфиг; FlatCompat на нём падает (циклическая ссылка в плагине react).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Игноры eslint-config-next по умолчанию.
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Локальные черновые скрипты пакетов аудита (не в git) и сгенерированный код.
    "tmp-*",
    "tmp-*/**",
    "coverage/**",
    "backups/**",
  ]),
]);

export default eslintConfig;
