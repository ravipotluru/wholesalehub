import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { logger } from './logger';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { retailer: true, wholesaler: true },
        });

        if (!user) {
          logger.warn({ event: 'login_failed', email, reason: 'user_not_found' });
          return null;
        }

        // Check lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          logger.warn({ event: 'login_locked', email, lockedUntil: user.lockedUntil });
          throw new Error('Account is temporarily locked. Please try again later.');
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
          // Increment failed login count
          const failedCount = user.failedLoginCount + 1;
          const updateData: Record<string, unknown> = { failedLoginCount: failedCount };

          // Lock after 5 failed attempts for 15 minutes
          if (failedCount >= 5) {
            updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            logger.warn({ event: 'account_locked', email, failedCount });
          }

          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });

          logger.warn({ event: 'login_failed', email, reason: 'invalid_password', failedCount });
          return null;
        }

        // Check user status
        if (user.status !== 'ACTIVE') {
          logger.warn({ event: 'login_failed', email, reason: 'inactive_account', status: user.status });
          return null;
        }

        // Reset failed login count and update last login
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        logger.info({ event: 'login_success', userId: user.id, role: user.role });

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          retailerId: user.retailerId,
          wholesalerId: user.wholesalerId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as Record<string, unknown>).role;
        token.retailerId = (user as Record<string, unknown>).retailerId;
        token.wholesalerId = (user as Record<string, unknown>).wholesalerId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).retailerId = token.retailerId;
        (session.user as Record<string, unknown>).wholesalerId = token.wholesalerId;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
});

/** Get the redirect path based on user role */
export function getRoleRedirect(role: string): string {
  switch (role) {
    case 'RETAILER':
      return '/marketplace';
    case 'WHOLESALER':
      return '/orders';
    case 'WAREHOUSE_STAFF':
      return '/inventory';
    case 'ADMIN':
    case 'ANALYST':
      return '/analytics';
    default:
      return '/marketplace';
  }
}
