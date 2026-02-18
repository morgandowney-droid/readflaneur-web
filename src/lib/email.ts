// Email service using Resend

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail({ to, subject, html, from }: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('No Resend API key configured, skipping email');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || `Flaneur News <${(process.env.EMAIL_FROM || 'noreply@readflaneur.com').replace(/.*<([^>]+)>.*/, '$1').trim()}>`,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend API error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

// Notify admin about new ad pending review
export async function notifyAdminNewAd(ad: {
  id: string;
  headline: string;
  image_url: string;
  click_url: string;
  advertiser_email: string;
  is_global: boolean;
  neighborhood_name?: string;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn('No admin email configured');
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400;">New Ad Pending Review</h2>

      <p>A new ad has been submitted and passed AI screening. Please review:</p>

      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
        <p><strong>Headline:</strong> ${ad.headline}</p>
        <p><strong>Advertiser:</strong> ${ad.advertiser_email}</p>
        <p><strong>Targeting:</strong> ${ad.is_global ? 'Global (all neighborhoods)' : ad.neighborhood_name || 'Specific neighborhood'}</p>
        <p><strong>Click URL:</strong> <a href="${ad.click_url}">${ad.click_url}</a></p>
      </div>

      <div style="margin: 20px 0;">
        <p><strong>Ad Image:</strong></p>
        <img src="${ad.image_url}" alt="Ad preview" style="max-width: 100%; height: auto; border: 1px solid #ddd;" />
      </div>

      <div style="margin: 30px 0;">
        <a href="${appUrl}/admin/ads" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          Review in Dashboard
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        You can approve or reject this ad from the admin dashboard.
      </p>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[Flâneur] New Ad Pending Review: ${ad.headline}`,
    html,
  });
}

// Notify advertiser about ad approval
export async function notifyAdvertiserApproved(ad: {
  headline: string;
  advertiser_email: string;
}): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400;">Your Ad Has Been Approved!</h2>

      <p>Great news! Your ad "<strong>${ad.headline}</strong>" has been approved.</p>

      <p>You can now complete payment to start your campaign.</p>

      <div style="margin: 30px 0;">
        <a href="${appUrl}/advertiser" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          Complete Payment
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Thank you for advertising with Flâneur.
      </p>
    </div>
  `;

  return sendEmail({
    to: ad.advertiser_email,
    subject: `[Flâneur] Your Ad Has Been Approved: ${ad.headline}`,
    html,
  });
}

// Notify advertiser about ad rejection
export async function notifyAdvertiserRejected(ad: {
  headline: string;
  advertiser_email: string;
  rejection_reason: string;
}): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400;">Ad Review Update</h2>

      <p>Your ad "<strong>${ad.headline}</strong>" was not approved.</p>

      <div style="background: #fff5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #e53e3e;">
        <p><strong>Reason:</strong> ${ad.rejection_reason}</p>
      </div>

      <p>You can create a new ad that meets our guidelines:</p>

      <div style="margin: 30px 0;">
        <a href="${appUrl}/advertiser/ads/new" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          Create New Ad
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        If you have questions, please contact us.
      </p>
    </div>
  `;

  return sendEmail({
    to: ad.advertiser_email,
    subject: `[Flâneur] Ad Review Update: ${ad.headline}`,
    html,
  });
}

// Notify admin about new tip submission
export async function notifyAdminNewTip(tip: {
  id: string;
  content: string;
  headline?: string;
  neighborhood_name: string;
  submitter_name?: string;
  submitter_email?: string;
  photo_count: number;
  is_anonymous: boolean;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn('No admin email configured');
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const preview = tip.content.length > 200 ? tip.content.substring(0, 200) + '...' : tip.content;

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400;">New Tip Submitted</h2>

      <p>A new tip has been submitted for review:</p>

      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
        ${tip.headline ? `<p><strong>Headline:</strong> ${tip.headline}</p>` : ''}
        <p><strong>Neighborhood:</strong> ${tip.neighborhood_name}</p>
        <p><strong>Submitter:</strong> ${tip.is_anonymous ? 'Anonymous' : (tip.submitter_name || tip.submitter_email || 'Not provided')}</p>
        <p><strong>Photos:</strong> ${tip.photo_count} attached</p>
      </div>

      <div style="background: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0;">
        <p style="margin: 0; white-space: pre-wrap;">${preview}</p>
      </div>

      <div style="margin: 30px 0;">
        <a href="${appUrl}/admin/tips" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          Review Tips
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Review this tip in the admin dashboard to approve, reject, or mark for further review.
      </p>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[Flâneur] New Tip: ${tip.headline || tip.neighborhood_name}`,
    html,
  });
}

// Notify tip submitter about approval
export async function notifyTipSubmitterApproved(tip: {
  submitter_email: string;
  submitter_name?: string;
  headline?: string;
  neighborhood_name: string;
}): Promise<boolean> {
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400;">Thank You for Your Tip!</h2>

      <p>Dear ${tip.submitter_name || 'Reader'},</p>

      <p>We wanted to let you know that your tip${tip.headline ? ` regarding "${tip.headline}"` : ''} for ${tip.neighborhood_name} has been reviewed and approved.</p>

      <p>Our editorial team may use your submission in an upcoming story. Thank you for contributing to Flâneur and helping us cover your neighborhood.</p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Thank you for being part of the Flâneur community.
      </p>
    </div>
  `;

  return sendEmail({
    to: tip.submitter_email,
    subject: `[Flâneur] Your Tip Has Been Received`,
    html,
  });
}

// Notify tip submitter about rejection
export async function notifyTipSubmitterRejected(tip: {
  submitter_email: string;
  submitter_name?: string;
  headline?: string;
  rejection_reason: string;
}): Promise<boolean> {
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400;">Tip Submission Update</h2>

      <p>Dear ${tip.submitter_name || 'Reader'},</p>

      <p>Thank you for submitting a tip${tip.headline ? ` regarding "${tip.headline}"` : ''} to Flâneur.</p>

      <p>After review, we were unable to use your submission at this time:</p>

      <div style="background: #fff5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #e53e3e;">
        <p style="margin: 0;"><strong>Reason:</strong> ${tip.rejection_reason}</p>
      </div>

      <p>We appreciate you taking the time to contribute and encourage you to submit future tips.</p>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Thank you for being part of the Flâneur community.
      </p>
    </div>
  `;

  return sendEmail({
    to: tip.submitter_email,
    subject: `[Flâneur] Tip Submission Update`,
    html,
  });
}

// Notify customer that their ad proof is ready for review
export async function notifyCustomerProofReady(params: {
  clientEmail: string;
  clientName: string;
  headline: string;
  proofToken: string;
}): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const proofUrl = `${appUrl}/proofs/${params.proofToken}`;

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLANEUR</h1>
      <h2 style="font-weight: 400;">Approve Your Placement</h2>

      <p>Dear ${params.clientName},</p>

      <p>Your ad &ldquo;${params.headline}&rdquo; has been prepared for publication in Flaneur. Please review how it will appear to our readers and approve it for publication.</p>

      <div style="margin: 30px 0;">
        <a href="${proofUrl}" style="background: #000; color: #fff; padding: 14px 32px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          Review &amp; Approve
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        You can preview exactly how your placement will appear in our newsletter and approve it with one click.
      </p>

      <p style="color: #999; font-size: 12px; margin-top: 40px;">
        This link is unique to your placement. Do not share it.
      </p>
    </div>
  `;

  return sendEmail({
    to: params.clientEmail,
    subject: `Approve Your Flaneur Placement: ${params.headline}`,
    html,
    from: 'Flaneur Ads <ads@readflaneur.com>',
  });
}

// Notify admin when a customer requests changes to their ad
export async function notifyAdminChangeRequest(params: {
  adId: string;
  clientName: string;
  headline: string;
  message: string;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn('No admin email configured');
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLANEUR</h1>
      <h2 style="font-weight: 400;">Ad Change Request</h2>

      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
        <p><strong>Client:</strong> ${params.clientName}</p>
        <p><strong>Ad:</strong> ${params.headline}</p>
      </div>

      <div style="background: #fff7ed; padding: 20px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; font-weight: 500; margin-bottom: 8px;">Customer Message:</p>
        <p style="margin: 0; white-space: pre-wrap;">${params.message}</p>
      </div>

      <div style="margin: 30px 0;">
        <a href="${appUrl}/admin/ads" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          Review in Dashboard
        </a>
      </div>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `Ad Change Request: ${params.clientName} — ${params.headline}`,
    html,
  });
}

// Notify admin about new neighborhood suggestion
export async function notifyNeighborhoodSuggestion(params: {
  suggestion: string;
  email: string | null;
  city: string | null;
  country: string | null;
}): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const location = [params.city, params.country].filter(Boolean).join(', ') || 'Unknown location';

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLANEUR</h1>
      <h2 style="font-weight: 400;">New Neighborhood Suggestion</h2>

      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
        <p><strong>Suggestion:</strong> ${params.suggestion}</p>
        <p><strong>From:</strong> ${params.email || 'Anonymous'}</p>
        <p><strong>Location:</strong> ${location}</p>
      </div>

      <div style="margin: 30px 0;">
        <a href="${appUrl}/admin/suggestions" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          Review Suggestions
        </a>
      </div>
    </div>
  `;

  return sendEmail({
    to: 'contact@readflaneur.com',
    subject: `[Flaneur] New Neighborhood Suggestion: ${params.suggestion}`,
    html,
  });
}

// Helper to build Google Maps URL
function getMapsUrl(place: { name: string; address: string | null; latitude: number | null; longitude: number | null }): string {
  const query = place.address ? `${place.name}, ${place.address}` : place.name;
  if (place.latitude && place.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&center=${place.latitude},${place.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Helper to format neighborhood ID to readable name
function formatNeighborhood(id: string): string {
  return id.split('-').slice(1).map(w =>
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

// Notify admin about new places discovered during sync
export async function notifyAdminNewPlaces(places: {
  id: string;
  name: string;
  address: string | null;
  neighborhood_id: string;
  category_name: string;
  google_rating: number | null;
  google_reviews_count: number | null;
  latitude: number | null;
  longitude: number | null;
}[]): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn('No admin email configured');
    return false;
  }

  if (places.length === 0) {
    return true;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Group places by neighborhood
  const byNeighborhood = places.reduce((acc, place) => {
    const key = place.neighborhood_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(place);
    return acc;
  }, {} as Record<string, typeof places>);

  const neighborhoodSections = Object.entries(byNeighborhood).map(([neighborhoodId, neighborhoodPlaces]) => {
    const placesHtml = neighborhoodPlaces.map(place => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong>${place.name}</strong>
          ${place.category_name ? `<br><span style="color: #666; font-size: 12px;">${place.category_name}</span>` : ''}
          ${place.address ? `<br><span style="color: #888; font-size: 12px;">${place.address}</span>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
          ${place.google_rating ? `${place.google_rating.toFixed(1)} ★` : '-'}
          ${place.google_reviews_count ? `<br><span style="color: #888; font-size: 11px;">(${place.google_reviews_count} reviews)</span>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
          <a href="${getMapsUrl(place)}" style="color: #000; text-decoration: underline;">View Map</a>
        </td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom: 30px;">
        <h3 style="font-weight: 500; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px;">
          ${formatNeighborhood(neighborhoodId)} (${neighborhoodPlaces.length} new)
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left; font-weight: 500;">Place</th>
              <th style="padding: 10px; text-align: center; font-weight: 500;">Rating</th>
              <th style="padding: 10px; text-align: center; font-weight: 500;">Map</th>
            </tr>
          </thead>
          <tbody>
            ${placesHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400;">New Places Discovered</h2>

      <p>The daily sync discovered <strong>${places.length} new place${places.length === 1 ? '' : 's'}</strong>:</p>

      ${neighborhoodSections}

      <div style="margin: 30px 0;">
        <a href="${appUrl}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          View on Flâneur
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Discovered during the daily Google Places sync at ${new Date().toUTCString()}.
      </p>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[Flâneur] ${places.length} New Place${places.length === 1 ? '' : 's'} Discovered`,
    html,
  });
}

// Notify admin about places that have closed (disappeared from Google Places)
export async function notifyAdminClosedPlaces(places: {
  id: string;
  name: string;
  address: string | null;
  neighborhood_id: string;
  category_name: string;
  latitude: number | null;
  longitude: number | null;
}[]): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn('No admin email configured');
    return false;
  }

  if (places.length === 0) {
    return true;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Group places by neighborhood
  const byNeighborhood = places.reduce((acc, place) => {
    const key = place.neighborhood_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(place);
    return acc;
  }, {} as Record<string, typeof places>);

  const neighborhoodSections = Object.entries(byNeighborhood).map(([neighborhoodId, neighborhoodPlaces]) => {
    const placesHtml = neighborhoodPlaces.map(place => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong>${place.name}</strong>
          ${place.category_name ? `<br><span style="color: #666; font-size: 12px;">${place.category_name}</span>` : ''}
          ${place.address ? `<br><span style="color: #888; font-size: 12px;">${place.address}</span>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
          <a href="${getMapsUrl(place)}" style="color: #000; text-decoration: underline;">View Map</a>
        </td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom: 30px;">
        <h3 style="font-weight: 500; border-bottom: 2px solid #dc2626; padding-bottom: 8px; margin-bottom: 16px;">
          ${formatNeighborhood(neighborhoodId)} (${neighborhoodPlaces.length} closed)
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #fef2f2;">
              <th style="padding: 10px; text-align: left; font-weight: 500;">Place</th>
              <th style="padding: 10px; text-align: center; font-weight: 500;">Last Location</th>
            </tr>
          </thead>
          <tbody>
            ${placesHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 0 auto;">
      <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
      <h2 style="font-weight: 400; color: #dc2626;">Places Recently Closed</h2>

      <p>The following <strong>${places.length} place${places.length === 1 ? '' : 's'}</strong> no longer appear in Google Places and may have closed:</p>

      ${neighborhoodSections}

      <div style="margin: 30px 0;">
        <a href="${appUrl}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
          View on Flâneur
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">
        Detected during the daily Google Places sync at ${new Date().toUTCString()}.
      </p>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[Flâneur] ${places.length} Place${places.length === 1 ? '' : 's'} Recently Closed`,
    html,
  });
}
