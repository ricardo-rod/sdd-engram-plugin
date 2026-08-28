import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

export type HostResolver = (hostname: string) => Promise<readonly string[]>;
export type GuardedResponse = { status: number; headers: { get(name: string): string | null }; body?: AsyncIterable<Uint8Array> | null };
export type GuardedFetch = (url: string, init: { redirect: "manual" }) => Promise<GuardedResponse>;
export type GuardedHttpsOptions = { resolve?: HostResolver; fetch?: GuardedFetch; maxBytes?: number; maxRedirects?: number };

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

function unsafeIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224;
}

function unsafeIPv6(address: string): boolean {
  const value = address.toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8:") || (mapped !== undefined && unsafeIPv4(mapped));
}

function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !unsafeIPv4(address) : family === 6 ? !unsafeIPv6(address) : false;
}

async function defaultResolve(hostname: string): Promise<readonly string[]> {
  const [ipv4, ipv6] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  return [...(ipv4.status === "fulfilled" ? ipv4.value : []), ...(ipv6.status === "fulfilled" ? ipv6.value : [])];
}

async function validateTarget(url: URL, resolve: HostResolver): Promise<void> {
  if (url.protocol !== "https:") throw new Error("Only HTTPS skill URLs are allowed.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(hostname) ? [hostname] : await resolve(hostname);
  const addresses = literal;
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((address) => typeof address !== "string" || !publicAddress(address))) throw new Error("Skill URL DNS destination is not public.");
}

export async function guardedHttpsGet(input: string, options: GuardedHttpsOptions = {}): Promise<Uint8Array> {
  const resolve = options.resolve ?? defaultResolve;
  const fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init) as Promise<GuardedResponse>);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Invalid skill URL."); }
  for (let redirects = 0; ; redirects += 1) {
    await validateTarget(url, resolve);
    const response = await fetch(url.toString(), { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= maxRedirects) throw new Error("Skill URL exceeded the redirect limit.");
      const location = response.headers.get("location");
      try { url = new URL(location ?? "", url); } catch { throw new Error("Skill URL returned a malformed redirect."); }
      continue;
    }
    if (response.status < 200 || response.status >= 300 || !response.body) throw new Error("Skill URL returned an invalid response.");
    const chunks: Uint8Array[] = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.byteLength; if (length > maxBytes) throw new Error("Skill URL response exceeded the size limit."); chunks.push(chunk); }
    const result = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }
}
