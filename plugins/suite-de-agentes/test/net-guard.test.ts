import { describe, expect, it, vi } from "vitest";
import { guardedHttpsGet } from "../src/core/net-guard.ts";

const bytes = (value: string) => new TextEncoder().encode(value);
const stream = async function* (...chunks: Uint8Array[]) { yield* chunks; };
const reply = (status: number, location?: string, body = stream(bytes("ok"))) => ({ status, headers: { get: (name: string) => name === "location" ? location ?? null : null }, body });
const publicDns = async () => ["8.8.8.8"];

describe("guarded HTTPS retrieval", () => {
  it("rejects non-HTTPS plus every private, loopback, link-local, unspecified, multicast, reserved, absent, or ambiguous destination before fetch", async () => {
    const fetch = vi.fn();
    await expect(guardedHttpsGet("http://public.test/SKILL.md", { resolve: publicDns, fetch })).rejects.toThrow(/HTTPS/i);
    for (const address of ["10.0.0.1", "127.0.0.1", "169.254.1.1", "0.0.0.0", "224.0.0.1", "192.0.2.1", "::1", "fc00::1", "fe80::1", "ff00::1", "2001:db8::1"]) {
      await expect(guardedHttpsGet("https://unsafe.test/SKILL.md", { resolve: async () => [address], fetch })).rejects.toThrow(/destination/i);
    }
    await expect(guardedHttpsGet("https://127.0.0.1/SKILL.md", { resolve: publicDns, fetch })).rejects.toThrow(/destination/i);
    await expect(guardedHttpsGet("https://[::1]/SKILL.md", { resolve: publicDns, fetch })).rejects.toThrow(/destination/i);
    await expect(guardedHttpsGet("https://missing.test/SKILL.md", { resolve: async () => [], fetch })).rejects.toThrow(/DNS/i);
    await expect(guardedHttpsGet("https://ambiguous.test/SKILL.md", { resolve: async () => ["8.8.8.8", "not-an-ip"], fetch })).rejects.toThrow(/DNS/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks every manual redirect, rejects malformed/private targets, and stops after three redirects", async () => {
    const privateRedirect = vi.fn(async () => reply(302, "https://private.test/SKILL.md"));
    await expect(guardedHttpsGet("https://public.test/SKILL.md", { resolve: async (host) => [host === "private.test" ? "127.0.0.1" : "8.8.8.8"], fetch: privateRedirect })).rejects.toThrow(/destination/i);
    await expect(guardedHttpsGet("https://public.test/SKILL.md", { resolve: publicDns, fetch: async () => reply(302, "http://[") })).rejects.toThrow(/redirect/i);
    let calls = 0;
    await expect(guardedHttpsGet("https://public.test/SKILL.md", { resolve: publicDns, fetch: async () => reply(302, `https://public.test/${++calls}`) })).rejects.toThrow(/redirect/i);
    expect(calls).toBe(4);
  });

  it("returns a public response and rejects an over-limit stream before consuming a later chunk", async () => {
    await expect(guardedHttpsGet("https://public.test/SKILL.md", { resolve: publicDns, fetch: async () => reply(200, undefined, stream(bytes("safe"))) })).resolves.toEqual(bytes("safe"));
    let yielded = 0;
    const oversized = async function* () { yielded += 1; yield bytes("123"); yielded += 1; yield bytes("456"); yielded += 1; yield bytes("789"); };
    await expect(guardedHttpsGet("https://public.test/SKILL.md", { resolve: publicDns, fetch: async () => reply(200, undefined, oversized()), maxBytes: 5 })).rejects.toThrow(/size/i);
    expect(yielded).toBe(2);
  });
});
