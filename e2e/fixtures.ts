/** The admin every spec runs as, created by auth.setup.ts. */
export const ADMIN = { email: "e2e@example.com", password: "a long e2e passphrase", name: "E2E" };

/** Where auth.setup.ts saves the admin's session for the other specs. */
export const STATE = "e2e/.auth/admin.json";
