import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  // Per-IP rate limit so an attacker can't use the health endpoint for
  // DB/Redis amplification or recon. Real load balancers can pre-limit too.
  const ip = clientIp(request);
  const limit = await rateLimit({
    key: `health:${ip}`,
    limit: 30,
    windowSec: 60,
  });
  if (!limit.ok) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'connected', latencyMs: Date.now() - dbStart };
  } catch {
    checks.database = { status: 'disconnected', latencyMs: Date.now() - dbStart };
  }

  // Redis check
  const redisStart = Date.now();
  try {
    await redis.ping();
    checks.redis = { status: 'connected', latencyMs: Date.now() - redisStart };
  } catch {
    checks.redis = { status: 'disconnected', latencyMs: Date.now() - redisStart };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === 'connected');

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
