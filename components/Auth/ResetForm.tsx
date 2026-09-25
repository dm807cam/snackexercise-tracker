"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, FormError, PasswordField, SubmitButton, postJson } from "./AuthForm";

export function ResetForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/reset", { token, password });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle={<>For {email}. Every device signed in to this account will be signed out.</>}
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        <PasswordField id="password" label="New password" value={password} onChange={setPassword} isNew autoFocus />
        <SubmitButton busy={busy}>Set password and sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}
