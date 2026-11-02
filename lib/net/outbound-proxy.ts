/**
 * Исходящий HTTPS-прокси для серверного fetch (запросы к LLM).
 *
 * Зачем: VPN-клиенты на Windows часто работают как системный прокси (например,
 * 127.0.0.1:10809). Браузер ходит через него, а встроенный fetch Node — нет,
 * поэтому Gemini видит российский IP и отвечает 400 «User location is not supported».
 *
 * Включение: `OUTBOUND_HTTPS_PROXY=http://127.0.0.1:10809` в `.env`.
 * При старте сервера проверяем, что порт прокси отвечает; если VPN выключен —
 * прокси не включаем (иначе все внешние запросы падали бы с ошибкой сети).
 * Локальные адреса всегда идут мимо прокси.
 */
import http from "node:http";
import net from "node:net";

/** Адреса в обход прокси (дополняются из OUTBOUND_NO_PROXY). */
export const DEFAULT_NO_PROXY = "localhost,127.0.0.1,::1";

export type OutboundProxyConfig = {
  url: string;
  host: string;
  port: number;
  noProxy: string;
};

export type OutboundProxyStatus =
  | { state: "off" }
  | { state: "invalid"; value: string }
  | { state: "unreachable"; host: string; port: number }
  | { state: "on"; host: string; port: number };

/** Разбор env: пусто → null; мусор → { invalid }. */
export function parseOutboundProxyConfig(
  env: Record<string, string | undefined>,
): OutboundProxyConfig | { invalid: string } | null {
  const raw = env.OUTBOUND_HTTPS_PROXY?.trim();
  if (!raw) return null;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { invalid: raw };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { invalid: raw };
  }
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  const extra = env.OUTBOUND_NO_PROXY?.trim();
  return {
    url: u.toString().replace(/\/$/, ""),
    host: u.hostname,
    port,
    noProxy: extra ? `${DEFAULT_NO_PROXY},${extra}` : DEFAULT_NO_PROXY,
  };
}

/** TCP-проба: отвечает ли прокси (VPN-клиент запущен). */
export function probeTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export type EnableOutboundProxyDeps = {
  env?: Record<string, string | undefined>;
  probe?: (host: string, port: number) => Promise<boolean>;
  /** Node ≥24: http.setGlobalProxyFromEnv — глобальный диспетчер fetch + http(s).Agent */
  apply?: (proxyEnv: Record<string, string>) => void;
  log?: (msg: string) => void;
};

/** Включает прокси для всего серверного fetch, если он задан и доступен. */
export async function enableOutboundProxy(
  deps: EnableOutboundProxyDeps = {},
): Promise<OutboundProxyStatus> {
  const env = deps.env ?? process.env;
  const probe = deps.probe ?? probeTcp;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const apply =
    deps.apply ??
    ((proxyEnv: Record<string, string>) => {
      const setter = (
        http as unknown as { setGlobalProxyFromEnv?: (e: Record<string, string>) => unknown }
      ).setGlobalProxyFromEnv;
      if (typeof setter !== "function") {
        throw new Error("http.setGlobalProxyFromEnv недоступен (нужен Node ≥ 24)");
      }
      setter(proxyEnv);
    });

  const cfg = parseOutboundProxyConfig(env);
  if (!cfg) return { state: "off" };
  if ("invalid" in cfg) {
    log(`[net/proxy] OUTBOUND_HTTPS_PROXY не URL — прокси не включён`);
    return { state: "invalid", value: cfg.invalid };
  }

  if (!(await probe(cfg.host, cfg.port))) {
    log(
      `[net/proxy] прокси ${cfg.host}:${cfg.port} не отвечает (VPN выключен?) — запросы идут напрямую`,
    );
    return { state: "unreachable", host: cfg.host, port: cfg.port };
  }

  apply({ HTTPS_PROXY: cfg.url, HTTP_PROXY: cfg.url, NO_PROXY: cfg.noProxy });
  log(`[net/proxy] исходящие запросы через ${cfg.host}:${cfg.port}`);
  return { state: "on", host: cfg.host, port: cfg.port };
}
