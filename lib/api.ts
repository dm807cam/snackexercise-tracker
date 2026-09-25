import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { log } from "./logger";
import { count } from "./metrics";

/** Consistent error envelope, so the client can always read `error`. */
export function apiError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ error: message, ...extra }, { status, headers });
}

/**
 * Wraps a route handler so a thrown ZodError becomes a readable 400, an
 * ApiError becomes its own status, and an unexpected throw becomes a logged 500
 * instead of an opaque crash.
 *
 * A handler that needs to set cookies or headers returns a Response itself,
 * which is passed through untouched.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse | Response> {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError("Invalid request", 400, {
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (error instanceof ApiError) {
      return apiError(error.message, error.status, error.code ? { code: error.code } : undefined, error.headers);
    }
    if (error instanceof SyntaxError) {
      // request.json() on a body that is not JSON.
      return apiError("The request body is not valid JSON", 400);
    }
    log.error("unhandled route error", { error });
    count("snack_api_unhandled_errors_total");
    return apiError("Unexpected server error", 500);
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

/** The 404 for a row that exists but belongs to someone else — indistinguishable on purpose. */
export function notFound(what: string): ApiError {
  return new ApiError(`${what} not found`, 404, "not-found");
}
