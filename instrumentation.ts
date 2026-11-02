/**
 * Хук старта сервера Next (вызывается один раз, после загрузки .env).
 * Включаем исходящий прокси для LLM (см. lib/net/outbound-proxy.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { enableOutboundProxy } = await import("./lib/net/outbound-proxy");
  try {
    await enableOutboundProxy();
  } catch (e) {
    // Прокси — не критичен для старта: без него работает всё, кроме геоблокнутых API
    console.error("[net/proxy] не удалось включить:", e instanceof Error ? e.message : e);
  }
}
