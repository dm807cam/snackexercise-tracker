"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, FormError, PasswordField, SubmitButton, TextField, postJson } from "./AuthForm";

export function LoginForm({ next, canSignUp }: { next: string; canSignUp: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/login", { email, password });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Your snacks, your log, on any device.">
      <form onSubmit={submit} noValidate={false}>
        <FormError message={error} />
        <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" autoFocus />
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="mt-4 text-center text-xs text-dim">
        Forgotten your password? Ask your administrator for a reset link.
        {canSignUp && (
          <>
            {" "}
            New here?{" "}
            <Link href="/signup" className="underline" style={{ color: "var(--accent)" }}>
              Create an account
            </Link>
            .
          </>
        )}
      </p>
    </AuthCard>
  );
}
