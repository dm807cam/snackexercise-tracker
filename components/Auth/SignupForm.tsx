"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, FormError, PasswordField, SubmitButton, TextField, postJson } from "./AuthForm";

/** Creating an account — from an invitation link, or from open registration. */
export function SignupForm({ invite, lockedEmail }: { invite?: string; lockedEmail?: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/signup", {
        email,
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(invite ? { invite } : {}),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={invite ? "You're invited" : "Create an account"}
      subtitle="Short bouts of training that fit between everything else — at home, at work, on the road."
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        <TextField id="name" label="Your name" value={name} onChange={setName} autoComplete="name" required={false} />
        <TextField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          disabled={Boolean(lockedEmail)}
          hint={lockedEmail ? "This invitation is for this address." : undefined}
        />
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} isNew />
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
      <p className="mt-4 text-center text-xs text-dim">
        Already have an account?{" "}
        <Link href="/login" className="underline" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export function DeadLink({ title, message }: { title: string; message: string }) {
  return (
    <AuthCard title={title} subtitle={message}>
      <Link
        href="/login"
        className="block w-full rounded-xl py-3 text-center text-base font-semibold"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        Go to sign in
      </Link>
    </AuthCard>
  );
}
