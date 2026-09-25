import { createClient } from '@supabase/supabase-js';
import { checkEditorKey, getEditorGroup, notFound, PRIVATE_HEADERS, SNAPSHOT_BUCKET } from '@/lib/editor-desk';

/**
 * Open the archived copy of a source from the editor desk.
 *
 * GET ?key=...&path=<edition>/<date>/<sha1>.html|.json|.txt signs the private
 * bucket object for two minutes and redirects to it. The link on the page
 * never carries a signed URL, so a copied link expires with nothing to leak,
 * and a path outside the group's own editions is a 404.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = /^[a-z0-9-]+\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{40}\.(html|json|txt)$/;
const EXPIRES_SECONDS = 120;

export async function GET(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group: groupId } = await params;
  const url = new URL(request.url);
  const group = getEditorGroup(groupId);
  if (!group || !checkEditorKey(groupId, url.searchParams.get('key'))) return notFound();

  const path = url.searchParams.get('path') || '';
  const edition = path.split('/')[0];
  if (!PATH.test(path) || !group.licensee.editions.includes(edition)) return notFound();

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.storage.from(SNAPSHOT_BUCKET).createSignedUrl(path, EXPIRES_SECONDS);
  if (error || !data?.signedUrl) {
    return new Response('The archived copy could not be opened.', {
      status: 404,
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(null, { status: 302, headers: { ...PRIVATE_HEADERS, Location: data.signedUrl } });
}
