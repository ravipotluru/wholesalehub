import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { issueToken } from '@/lib/tokens';
import { sendActionEmail, appBaseUrl } from '@/lib/mailer';

export async function POST(request: NextRequest) {
  try {
    // Per-IP rate limit. Without this, an attacker can enumerate which
    // emails are already registered via 409 responses.
    const ip = clientIp(request);
    const limit = await rateLimit({
      key: `register:${ip}`,
      limit: 5,
      windowSec: 600,
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = validation.data;
    const email = data.email.toLowerCase();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create retailer/wholesaler + user atomically. If the user create
    // fails, we never want a dangling Retailer/Wholesaler row hanging on.
    const userId = await prisma.$transaction(async (tx) => {
      let retailerId: string | null = null;
      let wholesalerId: string | null = null;

      if (data.role === 'RETAILER') {
        const count = await tx.retailer.count();
        const retailer = await tx.retailer.create({
          data: {
            retailerId: `RT${String(count + 100).padStart(3, '0')}`,
            name: data.businessName,
            businessName: data.businessName,
            storeType: data.storeType || 'Smoke Shop',
            contactEmail: email,
            address: data.storeAddress,
            city: data.storeCity,
            state: data.storeState,
            zipCode: data.storeZip,
          },
        });
        retailerId = retailer.id;
      } else if (data.role === 'WHOLESALER') {
        const count = await tx.wholesaler.count();
        const wholesaler = await tx.wholesaler.create({
          data: {
            wholesalerId: `WS${String(count + 100).padStart(3, '0')}`,
            name: data.businessName,
            businessName: data.businessName,
            contactName: `${data.firstName} ${data.lastName}`,
            contactEmail: email,
            contactPhone: data.phone,
            licenseNumber: data.licenseNumber,
            licenseState: data.licenseState,
            status: 'PENDING_APPROVAL',
          },
        });
        wholesalerId = wholesaler.id;
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: data.role,
          ageVerified: data.ageVerified,
          retailerId,
          wholesalerId,
        },
      });

      return user.id;
    });

    logger.info({
      event: 'user_registered',
      userId,
      role: data.role,
      email,
    });

    // Kick off email verification. Best-effort: registration never fails
    // because the mail step did (login stays open; age-restricted checkout
    // is what's gated on emailVerifiedAt).
    try {
      const raw = await issueToken(userId, 'EMAIL_VERIFICATION');
      await sendActionEmail({
        to: email,
        kind: 'email_verification',
        subject: 'Verify your WholesaleHub email',
        actionUrl: `${appBaseUrl()}/api/auth/verify-email?token=${raw}`,
      });
    } catch (error) {
      logger.error({
        event: 'email_verification_issue_failed',
        userId,
        error: (error as Error).message,
      });
    }

    return NextResponse.json(
      { message: 'Account created successfully', userId },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ event: 'registration_error', error: (error as Error).message });
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
