"use client";

/** Thin fetch wrapper that surfaces the API's error envelope as a real Error. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const issues = Array.isArray(body.issues)
      ? ` (${body.issues.map((i: { message: string }) => i.message).join("; ")})`
      : "";
    throw new Error(`${body.error ?? response.statusText}${issues}`);
  }
  return body as T;
}
