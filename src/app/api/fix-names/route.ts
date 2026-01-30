import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Fix neighborhood names with proper Unicode characters
const NAME_FIXES: Record<string, string> = {
  'stockholm-ostermalm': 'Östermalm',
};

export async function POST(request: Request) {
  // Check for cron secret
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: { id: string; name: string; status: string }[] = [];

  for (const [id, correctName] of Object.entries(NAME_FIXES)) {
    const { error } = await supabase
      .from('neighborhoods')
      .update({ name: correctName })
      .eq('id', id);

    results.push({
      id,
      name: correctName,
      status: error ? `Error: ${error.message}` : 'Updated',
    });
  }

  return NextResponse.json({
    message: 'Name fixes applied',
    results,
  });
}
