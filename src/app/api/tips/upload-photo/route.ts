import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hashIPSHA256 } from '@/lib/device-detection';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get user if authenticated (optional for tips)
    const { data: { user } } = await supabase.auth.getUser();

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, HEIC' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

    // Generate unique filename
    // Use user ID if authenticated, otherwise use hashed IP
    let folderPrefix: string;
    if (user) {
      folderPrefix = user.id;
    } else {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                 request.headers.get('x-real-ip') ||
                 'anonymous';
      const salt = process.env.CRON_SECRET || 'default-salt';
      folderPrefix = await hashIPSHA256(ip, salt);
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${folderPrefix}/${timestamp}-${randomId}.${extension}`;

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to tip-photos bucket
    const { error: uploadError } = await supabase.storage
      .from('tip-photos')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload image' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('tip-photos')
      .getPublicUrl(filename);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: filename,
      filename: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
