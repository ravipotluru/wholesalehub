import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function GET() {
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
