import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyPassword,
} from "@/lib/auth/password";
import { API_TOKEN_PREFIX, hashToken, issueApiToken, looksLikeApiToken, randomToken } from "@/lib/auth/tokens";
import { formatScopes, parseScopes } from "@/lib/auth/scopes";
import { safeNextPath } from "@/lib/auth/next-path";
import { clientIp, isSameOriginRequest, publicOrigin } from "@/lib/request-info";
import { readCookie } from "@/lib/auth/cookies";

describe("password hashing", () => {
  it("verifies the password it hashed, and nothing else", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$32768$8$3$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery stapler", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts, so the same password never hashes the same way twice", async () => {
    const [a, b] = await Promise.all([hashPassword("same password here"), hashPassword("same password here")]);
    expect(a).not.toBe(b);
  });

  it("refuses a malformed or missing hash rather than throwing", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "plaintext")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$abc$8$1$AAAA$BBBB")).toBe(false);
  });

  it("refuses a hash whose parameters would make a sign-in allocate gigabytes", async () => {
    const hostile = `scrypt$${2 ** 24}$8$1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;
    expect(await verifyPassword("anything", hostile)).toBe(false);
  });

  it("normalises unicode, so the same password typed on two keyboards matches", async () => {
    const composed = "café au lait";
    const decomposed = "café au lait";
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it("asks for a rehash only when the parameters have moved", async () => {
    expect(needsRehash(await hashPassword("some long password"))).toBe(false);
    const weaker = `scrypt$16384$8$1$${Buffer.alloc(16, 1).toString("base64url")}$${Buffer.alloc(64, 2).toString("base64url")}`;
    expect(needsRehash(weaker)).toBe(true);
  });
});

describe("password policy", () => {
  it("wants length, not symbols", () => {
    expect(passwordProblem("short")).toMatch(/at least/);
    expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    expect(passwordProblem("four ordinary words here")).toBeNull();
    expect(passwordProblem("alllowercaseletters")).toBeNull();
  });

  it("refuses the first passwords every guesser tries", () => {
    expect(passwordProblem("password123")).toMatch(/guessed/);
    expect(passwordProblem("Password123")).toMatch(/guessed/);
    expect(passwordProblem("1234567890")).toMatch(/guessed/);
    expect(passwordProblem("qwertyuiop")).toMatch(/guessed/);
  });

  it("refuses one character repeated, and the email address", () => {
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/repeated/);
    expect(passwordProblem("dennis-rocks-2026", { email: "dennis@example.com" })).toMatch(/email/);
  });
});

describe("tokens", () => {
  it("are long, random and url-safe", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("are stored as a SHA-256 that is stable and not the token", () => {
    const token = randomToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it("issues API tokens that are recognisable and show only a prefix", () => {
    const issued = issueApiToken();
    expect(issued.token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(issued.token.startsWith(issued.prefix)).toBe(true);
    expect(issued.prefix.length).toBeLessThan(issued.token.length / 3);
    expect(issued.hash).toBe(hashToken(issued.token));
    expect(looksLikeApiToken(issued.token)).toBe(true);
    expect(looksLikeApiToken("snk_short")).toBe(false);
    expect(looksLikeApiToken(randomToken())).toBe(false);
  });
});

describe("scopes", () => {
  it("keep only scopes that exist, in a stable order", () => {
    expect([...parseScopes("metrics:write bogus read")]).toEqual(["metrics:write", "read"]);
    expect(formatScopes(["metrics:write", "read"])).toBe("read metrics:write");
    expect(parseScopes(null).size).toBe(0);
  });
});

describe("where to go after signing in", () => {
  it("only ever a path on this site", () => {
    expect(safeNextPath("/stats")).toBe("/stats");
    expect(safeNextPath("/day/2026-09-25?x=1")).toBe("/day/2026-09-25?x=1");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});

function request(url: string, headers: Record<string, string>, method = "POST") {
  return new Request(url, { method, headers });
}

describe("same-origin check", () => {
  it("trusts the browser's Sec-Fetch-Site when it is there", () => {
    expect(isSameOriginRequest(request("http://snacks.lan/api/x", { "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(request("http://snacks.lan/api/x", { "sec-fetch-site": "cross-site" }))).toBe(false);
    // A sibling subdomain is same-SITE but not same-origin, and is refused.
    expect(isSameOriginRequest(request("http://snacks.lan/api/x", { "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("falls back to comparing Origin with the host the request reached", () => {
    expect(isSameOriginRequest(request("http://snacks.lan:3000/api/x", { origin: "http://snacks.lan:3000", host: "snacks.lan:3000" }))).toBe(true);
    expect(isSameOriginRequest(request("http://snacks.lan:3000/api/x", { origin: "http://evil.example", host: "snacks.lan:3000" }))).toBe(false);
    expect(isSameOriginRequest(request("http://snacks.lan/api/x", { origin: "null" }))).toBe(false);
  });

  it("lets a request with neither header through: it did not come from a browser page", () => {
    expect(isSameOriginRequest(request("http://snacks.lan/api/x", {}))).toBe(true);
  });
});

describe("client address", () => {
  it("takes the entry the nearest trusted proxy appended", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(clientIp(headers)).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
  });

  it("builds invitation links from the address the request came in on", () => {
    const req = request("http://internal:3000/api/x", {
      host: "internal:3000",
      "x-forwarded-host": "snacks.example.com",
      "x-forwarded-proto": "https",
    });
    expect(publicOrigin(req)).toBe("https://snacks.example.com");
  });
});

describe("reading the session cookie", () => {
  it("finds the named cookie among others", () => {
    const req = request("http://x/api", { cookie: "a=1; snack_session=abc%2Bdef; b=2" }, "GET");
    expect(readCookie(req, "snack_session")).toBe("abc+def");
    expect(readCookie(req, "missing")).toBeNull();
  });
});
