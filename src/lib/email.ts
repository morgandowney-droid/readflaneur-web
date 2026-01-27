// Email service using Resend

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
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
        from: process.env.EMAIL_FROM || 'Flâneur <noreply@readflaneur.com>',
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
