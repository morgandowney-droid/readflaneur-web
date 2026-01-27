import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const path = searchParams.get('path');

  // Verify secret (check both possible env vars)
  const validSecret = process.env.CRON_SECRET || process.env.REVALIDATE_SECRET || 'flaneur-cron-secret-2026';
  if (secret !== validSecret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  try {
    if (path) {
      // Revalidate specific path
      revalidatePath(path);
      return NextResponse.json({
        revalidated: true,
        path,
        timestamp: new Date().toISOString()
      });
    }

    // Revalidate all common paths
    const paths = [
      '/',
      '/new-york/west-village',
      '/london/notting-hill',
      '/san-francisco/pacific-heights',
      '/stockholm/ostermalm',
      '/sydney/paddington',
    ];

    for (const p of paths) {
      revalidatePath(p);
    }

    return NextResponse.json({
      revalidated: true,
      paths,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Revalidation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
