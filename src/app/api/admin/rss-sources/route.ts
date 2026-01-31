import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - List all RSS sources
export async function GET() {
  const { data, error } = await supabase
    .from('rss_sources')
    .select('*')
    .order('city')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sources: data });
}

// POST - Add new RSS source
export async function POST(request: Request) {
  const body = await request.json();
  const { city, name, feed_url } = body;

  if (!city || !name || !feed_url) {
    return NextResponse.json(
      { error: 'city, name, and feed_url are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('rss_sources')
    .insert({ city, name, feed_url })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This feed URL already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data });
}

// PATCH - Update RSS source
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('rss_sources')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data });
}

// DELETE - Remove RSS source
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('rss_sources')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
