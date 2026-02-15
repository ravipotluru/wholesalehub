import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getRoleRedirect } from '@/lib/auth';

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    const role = (session.user as Record<string, unknown>).role as string;
    redirect(getRoleRedirect(role));
  }

  redirect('/login');
}
