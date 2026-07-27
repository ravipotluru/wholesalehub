// Runs between `prisma generate` and `next build` on Vercel (see the
// `vercel-build` script in package.json).
//
//  - DATABASE_URL absent  -> skip all DB steps so the very first deploy
//    (before storage is attached) still compiles the whole codebase.
//  - DATABASE_URL present -> push the Prisma schema, then seed demo data.
//    The seed is a no-op when the database already has users, so this is
//    safe to run on every build.
//
// `prisma db push` failing IS fatal: a set-but-unreachable DATABASE_URL
// means the deploy would ship an app pointing at a broken database.
// Seeding failing is NOT fatal: the schema is in place and the app runs
// fine on an empty database.
import { execSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.log(
    'DATABASE_URL not set — skipping prisma db push + seed (compile-only build). ' +
      'Attach Postgres and redeploy per docs/DEPLOY.md.',
  );
  process.exit(0);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npx prisma db push --skip-generate');

try {
  run('npx prisma db seed');
} catch (error) {
  console.warn(
    'Seed step failed (non-fatal — schema is already pushed):',
    error instanceof Error ? error.message : error,
  );
}
