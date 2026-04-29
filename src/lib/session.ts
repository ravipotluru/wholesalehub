import { auth } from '@/lib/auth';
import type { Session } from 'next-auth';

/**
 * Strongly-typed authenticated user. Centralises the shape so API routes
 * stop reaching for `Record<string, unknown>` casts.
 */
export type AuthedUser = NonNullable<Session['user']> & {
  id: string;
};

/**
 * Get the current session if authenticated. Returns `null` when there is
 * no session OR the session is missing `id` (corrupt JWT, mid-rotation).
 */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as AuthedUser;
}
