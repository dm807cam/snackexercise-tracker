"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, FormError, PasswordField, SubmitButton, TextField, postJson } from "./AuthForm";

export function SetupForm({ tokenRequired, existingEntries }: { tokenRequired: boolean; existingEntries: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/setup", {
        email,
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(tokenRequired ? { setupToken } : {}),
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
      title="Set up Snacks"
      subtitle={
        existingEntries > 0 ? (
          <>
            This database already holds a log of {existingEntries.toLocaleString()}{" "}
            {existingEntries === 1 ? "entry" : "entries"}. The account you create now becomes its
            owner, and the instance&apos;s administrator.
          </>
        ) : (
          <>You are the first here. This account runs the instance: it can invite other people.</>
        )
      }
    >
      <form onSubmit={submit}>
        <FormError message={error} />
        {tokenRequired && (
          <TextField
            id="setup-token"
            label="Setup token"
            value={setupToken}
            onChange={setSetupToken}
            autoComplete="off"
            hint="The SETUP_TOKEN this container was started with."
          />
        )}
        <TextField id="name" label="Your name" value={name} onChange={setName} autoComplete="name" required={false} />
        <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} isNew />
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
    </AuthCard>
  );
}
