import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin' ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = 10;

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch all neighborhoods with unsplash photos
    const { data: rows, error } = await supabaseAdmin
      .from('image_library_status')
      .select('neighborhood_id, unsplash_photos, unsplash_alternates')
      .not('unsplash_photos', 'is', null)
      .order('neighborhood_id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch neighborhood names for display
    const neighborhoodIds = (rows || []).map(r => r.neighborhood_id);
    const { data: neighborhoods } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, name, city, country')
      .in('id', neighborhoodIds);

    const nameMap = new Map(
      (neighborhoods || []).map(n => [n.id, { name: n.name, city: n.city, country: n.country }])
    );

    // Flatten all photos into a single list
    interface FlatPhoto {
      neighborhoodId: string;
      neighborhoodName: string;
      city: string;
      country: string;
      category: string; // category key or 'alternate-N'
      photoId: string;
      url: string;
      photographer: string;
    }

    const allPhotos: FlatPhoto[] = [];

    for (const row of rows || []) {
      const info = nameMap.get(row.neighborhood_id) || { name: row.neighborhood_id, city: '', country: '' };

      // Category photos (the 8 main ones)
      if (row.unsplash_photos && typeof row.unsplash_photos === 'object') {
        for (const [category, photo] of Object.entries(row.unsplash_photos as Record<string, { id: string; url: string; photographer: string }>)) {
          if (photo?.url) {
            allPhotos.push({
              neighborhoodId: row.neighborhood_id,
              neighborhoodName: info.name,
              city: info.city,
              country: info.country,
              category,
              photoId: photo.id,
              url: photo.url,
              photographer: photo.photographer || 'Unknown',
            });
          }
        }
      }

      // Alternate photos (the overflow pool)
      if (Array.isArray(row.unsplash_alternates)) {
        row.unsplash_alternates.forEach((photo: { id: string; url: string; photographer: string }, i: number) => {
          if (photo?.url) {
            allPhotos.push({
              neighborhoodId: row.neighborhood_id,
              neighborhoodName: info.name,
              city: info.city,
              country: info.country,
              category: `alternate-${i}`,
              photoId: photo.id,
              url: photo.url,
              photographer: photo.photographer || 'Unknown',
            });
          }
        });
      }
    }

    const total = allPhotos.length;
    const totalPages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const pagePhotos = allPhotos.slice(start, start + perPage);

    return NextResponse.json({
      photos: pagePhotos,
      page,
      totalPages,
      total,
    });
  } catch (err) {
    console.error('Image review GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { neighborhoodId, photoId, category } = body;

    if (!neighborhoodId || !photoId) {
      return NextResponse.json({ error: 'Missing neighborhoodId or photoId' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch current library
    const { data: row, error: fetchError } = await supabaseAdmin
      .from('image_library_status')
      .select('unsplash_photos, unsplash_alternates, rejected_image_ids')
      .eq('neighborhood_id', neighborhoodId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    const photos = (row.unsplash_photos || {}) as Record<string, { id: string; url: string; photographer: string; photographer_url: string; download_location: string }>;
    const alternates = (row.unsplash_alternates || []) as Array<{ id: string; url: string; photographer: string; photographer_url: string; download_location: string }>;
    const rejectedIds = (row.rejected_image_ids || []) as string[];

    let removed = false;
    let removedUrl = '';

    // Check if it's a category photo
    if (category && !category.startsWith('alternate-')) {
      const catPhoto = photos[category];
      if (catPhoto && catPhoto.id === photoId) {
        removedUrl = catPhoto.url;
        // Replace with first alternate if available
        if (alternates.length > 0) {
          photos[category] = alternates.shift()!;
        } else {
          delete photos[category];
        }
        removed = true;
      }
    }

    // Check alternates
    if (!removed) {
      const altIndex = alternates.findIndex(a => a.id === photoId);
      if (altIndex >= 0) {
        removedUrl = alternates[altIndex].url;
        alternates.splice(altIndex, 1);
        removed = true;
      }
    }

    if (!removed) {
      return NextResponse.json({ error: 'Photo not found in library' }, { status: 404 });
    }

    // Add to rejected list so it never comes back on refresh
    const updatedRejected = [...rejectedIds, photoId];

    // Update the library
    const { error: updateError } = await supabaseAdmin
      .from('image_library_status')
      .update({
        unsplash_photos: photos,
        unsplash_alternates: alternates,
        rejected_image_ids: updatedRejected,
        updated_at: new Date().toISOString(),
      })
      .eq('neighborhood_id', neighborhoodId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Also update any articles currently using this image
    if (removedUrl) {
      const { data: affected } = await supabaseAdmin
        .from('articles')
        .select('id')
        .eq('image_url', removedUrl);

      if (affected && affected.length > 0) {
        // Find a replacement URL from remaining photos
        const replacement = Object.values(photos)[0]?.url || '';
        if (replacement) {
          await supabaseAdmin
            .from('articles')
            .update({ image_url: replacement })
            .eq('image_url', removedUrl)
            .then(null, (err: Error) => console.error('Article image update error:', err));
        }
      }
    }

    return NextResponse.json({ success: true, photoId, removedUrl });
  } catch (err) {
    console.error('Image review DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
