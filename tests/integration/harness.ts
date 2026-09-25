/**
 * Integration tests run the real route handlers against a real, migrated
 * SQLite database — a fresh file per test file — with a small client that
 * behaves like a browser: it keeps the cookies it is given and sends an
 * Origin on anything that changes state.
 *
 * IMPORT THIS FIRST in a test file. Importing it points DATABASE_URL at the new
 * database, and the Prisma client reads that when lib/db.ts is first imported.
 */

import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const migrations = path.resolve(__dirname, "../../prisma/migrations");
const file = path.join(mkdtempSync(path.join(tmpdir(), "snack-it-")), "test.db");
{
  const db = new Database(file);
  for (const name of readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    db.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  db.close();
}
process.env.DATABASE_URL = `file:${file}`;
// Quiet: the audit trail and the scheduler log to stdout.
process.env.LOG_LEVEL = "error";

export const ORIGIN = "http://localhost:3000";

// `any`: each route declares its own params shape ({ id }, { date }), and the
// caller supplies the matching object through CallOptions.params.
type Handler = (request: NextRequest, context: { params: Promise<any> }) => Promise<Response>;

export interface CallOptions {
  body?: unknown;
  /** Route params for a dynamic segment, e.g. `{ id }`. */
  params?: Record<string, string>;
  headers?: Record<string, string>;
  /** Send no Origin even on a POST — a script, not a browser. */
  noOrigin?: boolean;
}

export interface Result<T = any> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

let clients = 0;

/**
 * Each client comes from its own address, as separate devices would; the
 * per-address rate limits would otherwise treat a whole test file as one very
 * busy person. Tests about addresses set X-Forwarded-For themselves.
 */
function nextAddress(): string {
  clients += 1;
  return `198.18.${Math.floor(clients / 250)}.${(clients % 250) + 1}`;
}

/** A browser, or a script: cookies it was given, and optionally a bearer token. */
export class Client {
  readonly cookies = new Map<string, string>();
  private readonly base: Record<string, string>;

  constructor(base: Record<string, string> = {}) {
    this.base = { "x-forwarded-for": nextAddress(), ...base };
  }

  static withToken(token: string): Client {
    return new Client({ authorization: `Bearer ${token}` });
  }

  async call<T = any>(handler: Handler, method: string, pathname: string, options: CallOptions = {}): Promise<Result<T>> {
    const headers = new Headers({ ...this.base, ...options.headers });
    if (this.cookies.size > 0) {
      headers.set("cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (method !== "GET" && !options.noOrigin && !headers.has("origin")) headers.set("origin", ORIGIN);

    const request = new NextRequest(new URL(pathname, ORIGIN), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const response = await handler(request, { params: Promise.resolve(options.params ?? {}) });

    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";").map((part) => part.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired =
        value === "" ||
        attributes.some((a) => /^max-age=0$/i.test(a)) ||
        attributes.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)).getTime() <= Date.now());
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body: body as T, headers: response.headers, text };
  }

  get = <T = any>(handler: Handler, pathname: string, options?: CallOptions) => this.call<T>(handler, "GET", pathname, options);
  post = <T = any>(handler: Handler, pathname: string, options?: CallOptions) => this.call<T>(handler, "POST", pathname, options);
  put = <T = any>(handler: Handler, pathname: string, options?: CallOptions) => this.call<T>(handler, "PUT", pathname, options);
  patch = <T = any>(handler: Handler, pathname: string, options?: CallOptions) => this.call<T>(handler, "PATCH", pathname, options);
  delete = <T = any>(handler: Handler, pathname: string, options?: CallOptions) => this.call<T>(handler, "DELETE", pathname, options);
}

/** Long, and not built from the email address, which the password policy refuses. */
export const PASSWORDS = {
  admin: "orange kettle morning drill",
  alice: "violet harbour seventeen steps",
  bob: "copper lantern quietly humming",
};
