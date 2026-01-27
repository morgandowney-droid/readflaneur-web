// Device detection utilities for parsing user-agent strings

export interface DeviceInfo {
  device_type: string;
  browser: string;
  os: string;
}

export function parseUserAgent(userAgent: string | null): DeviceInfo {
  if (!userAgent) {
    return {
      device_type: 'unknown',
      browser: 'unknown',
      os: 'unknown',
    };
  }

  const ua = userAgent.toLowerCase();

  // Detect device type
  let device_type = 'desktop';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    device_type = 'mobile';
  } else if (/ipad|tablet|playbook|silk/i.test(ua)) {
    device_type = 'tablet';
  }

  // Detect browser
  let browser = 'unknown';
  if (ua.includes('edg/')) {
    browser = 'Edge';
  } else if (ua.includes('chrome') && !ua.includes('edg/')) {
    browser = 'Chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
  } else if (ua.includes('msie') || ua.includes('trident/')) {
    browser = 'Internet Explorer';
  }

  // Detect OS
  let os = 'unknown';
  if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('mac os x') || ua.includes('macintosh')) {
    os = 'macOS';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    os = 'iOS';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  } else if (ua.includes('cros')) {
    os = 'Chrome OS';
  }

  return { device_type, browser, os };
}

export function hashIP(ip: string, salt: string): string {
  // Use a simple hash function that works in Edge runtime
  // In production, use crypto.subtle for proper SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);

  // Simple hash for Edge compatibility
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16).padStart(8, '0');
}

export async function hashIPSHA256(ip: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
