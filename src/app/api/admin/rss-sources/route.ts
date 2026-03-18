import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create client inside functions to avoid build-time env var issues
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * @swagger
 * /api/admin/rss-sources:
 *   get:
 *     summary: List all RSS sources
 *     tags: [Admin]
 *     security:
 *       - serviceRole: []
 *     responses:
 *       200:
 *         description: List of RSS sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *   post:
 *     summary: Add a new RSS source
 *     tags: [Admin]
 *     security:
 *       - serviceRole: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [city, name, feed_url]
 *             properties:
 *               city:
 *                 type: string
 *               name:
 *                 type: string
 *               feed_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Source created
 *   patch:
 *     summary: Update an existing RSS source
 *     tags: [Admin]
 *     security:
 *       - serviceRole: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Source updated
 *   delete:
 *     summary: Delete an RSS source
 *     tags: [Admin]
 *     security:
 *       - serviceRole: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Source deleted
 */
// GET - List all RSS sources
export async function GET() {
  const supabase = getSupabase();
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
  const supabase = getSupabase();
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
  const supabase = getSupabase();
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
  const supabase = getSupabase();
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
