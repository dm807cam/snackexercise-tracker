"use client";

import { useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

/**
 * The pieces every sign-in page is built from. Deliberately plain: a form that
 * does one thing, labelled fields, one button, and an error that says what to
 * do about it.
 */

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="surface w-full rounded-2xl p-5">
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle && <div className="mt-1 text-sm text-dim">{subtitle}</div>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  hint,
  disabled,
  required = true,
  autoFocus,
}: {
  id: string;
  label: string;
  type?: "text" | "email";
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode={type === "email" ? "email" : undefined}
        autoCapitalize={type === "email" ? "none" : undefined}
        spellCheck={false}
        className="w-full rounded-lg px-3 py-3 text-base disabled:opacity-60"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      />
      {hint && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
    </div>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  isNew = false,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A password being chosen, rather than one being entered. */
  isNew?: boolean;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={isNew ? "new-password" : "current-password"}
          minLength={isNew ? MIN_PASSWORD_LENGTH : undefined}
          required
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-lg px-3 py-3 text-base"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className="tap rounded-lg px-3 text-sm"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {isNew && (
        <p className="mt-1.5 text-xs text-dim">
          At least {MIN_PASSWORD_LENGTH} characters. A few ordinary words together is easier to
          remember and harder to guess than symbols.
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-2 w-full rounded-xl py-3 text-base font-semibold disabled:opacity-50"
      style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
    >
      {busy ? "One moment…" : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg px-3 py-2 text-sm"
      style={{ background: "color-mix(in oklch, var(--danger) 16%, transparent)", color: "var(--text)" }}
    >
      {message}
    </p>
  );
}

/** POST JSON, returning the parsed body or throwing the API's own message. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data as T;
}
