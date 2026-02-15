import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create retailer or wholesaler record based on role
    let retailerId: string | null = null;
    let wholesalerId: string | null = null;

    if (data.role === 'RETAILER') {
      const count = await prisma.retailer.count();
      const retailer = await prisma.retailer.create({
        data: {
          retailerId: `RT${String(count + 100).padStart(3, '0')}`,
          name: data.businessName,
          businessName: data.businessName,
          storeType: data.storeType || 'Smoke Shop',
          contactEmail: data.email,
          address: data.storeAddress,
          city: data.storeCity,
          state: data.storeState,
          zipCode: data.storeZip,
        },
      });
      retailerId = retailer.id;
    } else if (data.role === 'WHOLESALER') {
      const count = await prisma.wholesaler.count();
      const wholesaler = await prisma.wholesaler.create({
        data: {
          wholesalerId: `WS${String(count + 100).padStart(3, '0')}`,
          name: data.businessName,
          businessName: data.businessName,
          contactName: `${data.firstName} ${data.lastName}`,
          contactEmail: data.email,
          contactPhone: data.phone,
          licenseNumber: data.licenseNumber,
          licenseState: data.licenseState,
          status: 'PENDING_APPROVAL',
        },
      });
      wholesalerId = wholesaler.id;
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
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

    logger.info({
      event: 'user_registered',
      userId: user.id,
      role: data.role,
      email: data.email,
    });

    return NextResponse.json(
      { message: 'Account created successfully', userId: user.id },
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
