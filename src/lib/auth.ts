import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { logger } from './logger';
import { rateLimit } from './rate-limit';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase();
        const password = credentials.password as string;

        // IP-level rate limit so an attacker cannot rotate emails to dodge
        // the per-account lockout. 20 attempts per 5 minutes per IP.
        const ip =
          request?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
          request?.headers?.get?.('x-real-ip') ||
          'unknown';
        const ipLimit = await rateLimit({
          key: `login:ip:${ip}`,
          limit: 20,
          windowSec: 300,
        });
        if (!ipLimit.ok) {
          throw new Error('Too many sign-in attempts. Please try again later.');
        }

        // Per-email rate limit (prevents per-account hammering even before lockout fires).
        const emailLimit = await rateLimit({
          key: `login:email:${email}`,
          limit: 10,
          windowSec: 300,
        });
        if (!emailLimit.ok) {
          throw new Error('Too many sign-in attempts. Please try again later.');
        }

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
          const updateData: { failedLoginCount: number; lockedUntil?: Date } = {
            failedLoginCount: failedCount,
          };

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
        token.role = user.role;
        token.retailerId = user.retailerId;
        token.wholesalerId = user.wholesalerId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
        if (token.role) session.user.role = token.role;
        session.user.retailerId = token.retailerId ?? null;
        session.user.wholesalerId = token.wholesalerId ?? null;
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
