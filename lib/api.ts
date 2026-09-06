import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Consistent error envelope, so the client can always read `error`. */
export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Wraps a route handler so a thrown ZodError becomes a readable 400 and an
 * unexpected throw becomes a 500 instead of an opaque crash.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError("Invalid request", 400, {
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (error instanceof ApiError) {
      return apiError(error.message, error.status);
    }
    console.error(error);
    return apiError("Unexpected server error", 500);
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
