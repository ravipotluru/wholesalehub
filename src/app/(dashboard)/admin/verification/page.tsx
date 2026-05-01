import { redirect } from 'next/navigation';
import { getAuthedUser } from '@/lib/session';
import { VerificationQueueView } from './VerificationQueueView';

/**
 * /admin/verification — Trust & Safety queue for buyer verification.
 * Two-pane layout: list of pending applications + detail/actions panel.
 * Mirrors docs/handoffs/bundle/project/Admin%20Verification%20Queue.html.
 *
 * BACKEND DEPENDENCY: requires PR #17 (buyer-verification) for the
 * /api/admin/verification list + approve/reject endpoints. Until then,
 * the page renders sample data so reviewers can validate the UX.
 */
export default async function AdminVerificationPage() {
  const user = await getAuthedUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');

  const handle = user.email?.split('@')[0] ?? 'agent';
  return <VerificationQueueView reviewerHandle={handle} />;
}
