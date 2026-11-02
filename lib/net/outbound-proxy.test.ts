/**
 * Unit: исходящий прокси — разбор env, проба порта, применение. Без сети.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NO_PROXY,
  enableOutboundProxy,
  parseOutboundProxyConfig,
} from "./outbound-proxy";

describe("parseOutboundProxyConfig", () => {
  it("пусто → null", () => {
    expect(parseOutboundProxyConfig({})).toBeNull();
    expect(parseOutboundProxyConfig({ OUTBOUND_HTTPS_PROXY: "  " })).toBeNull();
  });

  it("http://127.0.0.1:10809 → host/port и локальные адреса в NO_PROXY", () => {
    expect(parseOutboundProxyConfig({ OUTBOUND_HTTPS_PROXY: "http://127.0.0.1:10809" })).toEqual({
      url: "http://127.0.0.1:10809",
      host: "127.0.0.1",
      port: 10809,
      noProxy: DEFAULT_NO_PROXY,
    });
  });

  it("OUTBOUND_NO_PROXY дописывается к локальным", () => {
    const cfg = parseOutboundProxyConfig({
      OUTBOUND_HTTPS_PROXY: "http://proxy.local:3128",
      OUTBOUND_NO_PROXY: "internal.example",
    });
    expect(cfg).toMatchObject({ noProxy: `${DEFAULT_NO_PROXY},internal.example`, port: 3128 });
  });

  it("не URL / чужой протокол → invalid", () => {
    expect(parseOutboundProxyConfig({ OUTBOUND_HTTPS_PROXY: "127.0.0.1:10809x" })).toEqual({
      invalid: "127.0.0.1:10809x",
    });
    expect(parseOutboundProxyConfig({ OUTBOUND_HTTPS_PROXY: "socks5://127.0.0.1:1080" })).toEqual({
      invalid: "socks5://127.0.0.1:1080",
    });
  });
});

describe("enableOutboundProxy", () => {
  const log = vi.fn();

  it("без переменной — off, без пробы и применения", async () => {
    const probe = vi.fn();
    const apply = vi.fn();
    expect(await enableOutboundProxy({ env: {}, probe, apply, log })).toEqual({ state: "off" });
    expect(probe).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("порт не отвечает (VPN выключен) — unreachable, прокси не применяется", async () => {
    const apply = vi.fn();
    const r = await enableOutboundProxy({
      env: { OUTBOUND_HTTPS_PROXY: "http://127.0.0.1:10809" },
      probe: async () => false,
      apply,
      log,
    });
    expect(r).toEqual({ state: "unreachable", host: "127.0.0.1", port: 10809 });
    expect(apply).not.toHaveBeenCalled();
  });

  it("порт отвечает — применяет HTTPS_PROXY/HTTP_PROXY/NO_PROXY", async () => {
    const apply = vi.fn();
    const probe = vi.fn(async () => true);
    const r = await enableOutboundProxy({
      env: { OUTBOUND_HTTPS_PROXY: "http://127.0.0.1:10809" },
      probe,
      apply,
      log,
    });
    expect(r).toEqual({ state: "on", host: "127.0.0.1", port: 10809 });
    expect(probe).toHaveBeenCalledWith("127.0.0.1", 10809);
    expect(apply).toHaveBeenCalledWith({
      HTTPS_PROXY: "http://127.0.0.1:10809",
      HTTP_PROXY: "http://127.0.0.1:10809",
      NO_PROXY: DEFAULT_NO_PROXY,
    });
  });

  it("невалидное значение — invalid, без пробы", async () => {
    const probe = vi.fn();
    const r = await enableOutboundProxy({
      env: { OUTBOUND_HTTPS_PROXY: "not a url" },
      probe,
      apply: vi.fn(),
      log,
    });
    expect(r.state).toBe("invalid");
    expect(probe).not.toHaveBeenCalled();
  });
});
