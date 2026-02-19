import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUniqueBands } from '@/lib/childcare/age-bands';
import { generateChildcareContent } from '@/lib/childcare/generate-childcare-content';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().split('T')[0];
  const deadline = Date.now() + 270_000; // 270s budget
  const results = { combos_needed: 0, content_generated: 0, content_skipped: 0, errors: 0 };

  try {
    // 1. Find all opted-in users with children
    const { data: profileUsers } = await supabase
      .from('profiles')
      .select('id, primary_city')
      .eq('childcare_mode_enabled', true)
      .eq('daily_email_enabled', true);

    const { data: newsletterUsers } = await supabase
      .from('newsletter_subscribers')
      .select('id, neighborhood_ids')
      .eq('childcare_mode_enabled', true)
      .eq('daily_email_enabled', true);

    // 2. Build map of user -> neighborhood IDs
    type UserEntry = { userId: string; source: 'profile' | 'newsletter'; neighborhoodIds: string[] };
    const users: UserEntry[] = [];

    if (profileUsers) {
      for (const p of profileUsers) {
        const { data: prefs } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', p.id);
        const ids = (prefs || []).map(pr => pr.neighborhood_id);
        if (ids.length > 0) {
          users.push({ userId: p.id, source: 'profile', neighborhoodIds: ids });
        }
      }
    }

    if (newsletterUsers) {
      for (const n of newsletterUsers) {
        const ids = n.neighborhood_ids || [];
        if (ids.length > 0) {
          users.push({ userId: n.id, source: 'newsletter', neighborhoodIds: ids });
        }
      }
    }

    // 3. Fetch all children for opted-in users
    const allUserIds = users.map(u => u.userId);
    if (allUserIds.length === 0) {
      return NextResponse.json({ message: 'No opted-in users', ...results });
    }

    const { data: allChildren } = await supabase
      .from('user_children')
      .select('user_id, user_source, birth_month, birth_year')
      .in('user_id', allUserIds);

    const childrenByUser = new Map<string, { birth_month: number; birth_year: number }[]>();
    for (const child of allChildren || []) {
      const key = child.user_id;
      if (!childrenByUser.has(key)) childrenByUser.set(key, []);
      childrenByUser.get(key)!.push({ birth_month: child.birth_month, birth_year: child.birth_year });
    }

    // 4. Build unique (neighborhood_id, age_bands[]) combos
    const comboMap = new Map<string, { neighborhoodId: string; ageBands: string[] }>();

    for (const user of users) {
      const children = childrenByUser.get(user.userId);
      if (!children || children.length === 0) continue;

      const bands = getUniqueBands(children);
      if (bands.length === 0) continue;

      for (const nid of user.neighborhoodIds) {
        const key = `${nid}|${bands.join(',')}`;
        if (!comboMap.has(key)) {
          comboMap.set(key, { neighborhoodId: nid, ageBands: bands });
        }
      }
    }

    results.combos_needed = comboMap.size;
    console.log(`[childcare] ${comboMap.size} unique neighborhood+band combos to generate`);

    // 5. Generate content for each unique combo
    // Fetch neighborhood details
    const neighborhoodIds = [...new Set([...comboMap.values()].map(c => c.neighborhoodId))];
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .in('id', neighborhoodIds);
    const nMap = new Map((neighborhoods || []).map(n => [n.id, n]));

    for (const [, combo] of comboMap) {
      if (Date.now() > deadline) {
        console.log('[childcare] Deadline reached, stopping');
        break;
      }

      const neighborhood = nMap.get(combo.neighborhoodId);
      if (!neighborhood) continue;

      // Check if content already exists for today (dedup)
      const { data: existing } = await supabase
        .from('childcare_content')
        .select('id')
        .eq('neighborhood_id', combo.neighborhoodId)
        .eq('content_date', today)
        .contains('age_bands', combo.ageBands)
        .limit(1);

      if (existing && existing.length > 0) {
        results.content_skipped++;
        continue;
      }

      try {
        const content = await generateChildcareContent(
          neighborhood.name,
          neighborhood.city,
          combo.ageBands as import('@/lib/childcare/age-bands').AgeBand[],
        );

        if (!content) {
          results.errors++;
          continue;
        }

        const { error: insertError } = await supabase
          .from('childcare_content')
          .upsert({
            neighborhood_id: combo.neighborhoodId,
            content_date: today,
            age_bands: combo.ageBands,
            headline: content.headline,
            body_text: content.bodyText,
            ai_model: content.model,
          }, { onConflict: 'neighborhood_id,content_date,age_bands' });

        if (insertError) {
          console.error(`[childcare] Insert error for ${combo.neighborhoodId}:`, insertError.message);
          results.errors++;
        } else {
          results.content_generated++;
        }
      } catch (err) {
        console.error(`[childcare] Generation error for ${combo.neighborhoodId}:`, err);
        results.errors++;
      }
    }

    console.log(`[childcare] Done:`, results);
    return NextResponse.json(results);
  } catch (err) {
    console.error('[childcare] Fatal error:', err);
    return NextResponse.json({ error: 'Internal error', ...results }, { status: 500 });
  }
}
