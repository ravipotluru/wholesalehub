import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { VerificationQueueView } from './VerificationQueueView';

/**
 * /admin/verification — Trust & Safety queue for buyer verification.
 * Server component queries PENDING_REVIEW retailers directly (no API hop);
 * the client view renders them and posts decisions to
 * POST /api/admin/verification/[retailerId]. With zero pending applicants
 * (unseeded DB) the view falls back to sample rows so the UX still demos.
 */

const AVATAR_PALETTE = ['#1E4D8C', '#7C3AED', '#0891B2', '#DC2626', '#00B894', '#7C2D12'];

export default async function AdminVerificationPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');

  const pending = await prisma.retailer.findMany({
    where: { verificationStatus: 'PENDING_REVIEW' },
    orderBy: { updatedAt: 'asc' },
    take: 50,
    select: {
      id: true,
      businessName: true,
      city: true,
      state: true,
      updatedAt: true,
      users: {
        take: 1,
        orderBy: { createdAt: 'asc' },
        select: { firstName: true, lastName: true },
      },
    },
  });

  const now = Date.now();
  const items = pending.map((r, i) => {
    const ageMinutes = Math.max(1, Math.round((now - r.updatedAt.getTime()) / 60_000));
    const initials = r.businessName
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const contact = r.users[0] ? `${r.users[0].firstName} ${r.users[0].lastName}` : '—';
    return {
      id: r.id,
      initials,
      avatarBg: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
      business: r.businessName,
      contact,
      city: [r.city, r.state].filter(Boolean).join(', ') || '—',
      ageMinutes,
      ein: '—', // EIN isn't captured on Retailer yet — shown as not-on-file
      tags: [
        { label: 'TOBACCO', tone: 'tobacco' as const },
        ...(ageMinutes > 180 ? [{ label: 'SLA RISK', tone: 'flag' as const }] : []),
      ],
      urgency: ageMinutes > 180 ? ('high' as const) : ageMinutes > 120 ? ('med' as const) : ('low' as const),
    };
  });

  const handle = user.email?.split('@')[0] ?? 'agent';
  return <VerificationQueueView reviewerHandle={handle} items={items} />;
}
