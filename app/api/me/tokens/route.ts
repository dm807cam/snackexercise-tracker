import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";
import { SCOPE_NAMES, formatScopes, parseScopes, type Scope } from "@/lib/auth/scopes";
import { issueApiToken } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";

/** A person needs a handful of automations, not hundreds. */
const MAX_TOKENS = 25;

/** GET /api/me/tokens — your API tokens, never their secrets. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const tokens = await prisma.apiToken.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return {
      tokens: tokens.map((t) => ({ ...t, scopes: [...parseScopes(t.scopes)] })),
      availableScopes: SCOPE_NAMES,
    };
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(SCOPE_NAMES as [Scope, ...Scope[]])).min(1),
  /** Days until it stops working; omitted means it lasts until revoked. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

/**
 * POST /api/me/tokens — issue a token. The secret is in this response and
 * nowhere else, ever: only its hash is kept.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const input = createSchema.parse(await request.json());

    const live = await prisma.apiToken.count({ where: { userId: user.id, revokedAt: null } });
    if (live >= MAX_TOKENS) throw new ApiError(`At most ${MAX_TOKENS} tokens; revoke one you no longer use.`, 409);

    const issued = issueApiToken();
    const row = await prisma.apiToken.create({
      data: {
        userId: user.id,
        name: input.name,
        tokenHash: issued.hash,
        prefix: issued.prefix,
        scopes: formatScopes(input.scopes),
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      },
    });
    await audit("token.created", { actorId: user.id, request, detail: { tokenId: row.id, name: row.name, scopes: row.scopes } });
    return {
      token: issued.token,
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: [...parseScopes(row.scopes)],
      expiresAt: row.expiresAt,
    };
  });
}
