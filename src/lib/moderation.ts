// AI-powered content moderation for ads

export interface ModerationResult {
  passed: boolean;
  flags: string[];
  reason?: string;
}

// OpenAI moderation API for text content
async function moderateText(text: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // If no API key, pass through to human review
    console.warn('No OpenAI API key configured, skipping text moderation');
    return { passed: true, flags: [] };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text }),
    });

    if (!response.ok) {
      console.error('OpenAI moderation API error:', response.status);
      return { passed: true, flags: [] }; // Fail open to human review
    }

    const data = await response.json();
    const result = data.results[0];

    if (result.flagged) {
      const flags: string[] = [];
      const categories = result.categories;

      if (categories.sexual) flags.push('sexual content');
      if (categories['sexual/minors']) flags.push('sexual content involving minors');
      if (categories.hate) flags.push('hate speech');
      if (categories['hate/threatening']) flags.push('threatening hate speech');
      if (categories.harassment) flags.push('harassment');
      if (categories['harassment/threatening']) flags.push('threatening harassment');
      if (categories['self-harm']) flags.push('self-harm content');
      if (categories.violence) flags.push('violent content');
      if (categories['violence/graphic']) flags.push('graphic violence');

      return {
        passed: false,
        flags,
        reason: `Content flagged for: ${flags.join(', ')}`,
      };
    }

    return { passed: true, flags: [] };
  } catch (error) {
    console.error('Text moderation error:', error);
    return { passed: true, flags: [] }; // Fail open to human review
  }
}

// Check URL against known suspicious patterns
function checkUrl(url: string): ModerationResult {
  const suspiciousPatterns = [
    /bit\.ly/i,
    /tinyurl/i,
    /t\.co/i,
    // Add more URL shorteners or suspicious patterns
  ];

  const blockedDomains: string[] = [
    // Add known malicious or inappropriate domains
  ];

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Check for URL shorteners (could hide malicious destinations)
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url)) {
        return {
          passed: false,
          flags: ['url_shortener'],
          reason: 'URL shorteners are not allowed. Please use a direct link.',
        };
      }
    }

    // Check blocked domains
    for (const domain of blockedDomains) {
      if (hostname.includes(domain)) {
        return {
          passed: false,
          flags: ['blocked_domain'],
          reason: 'This domain is not allowed.',
        };
      }
    }

    // Must be HTTPS
    if (urlObj.protocol !== 'https:') {
      return {
        passed: false,
        flags: ['insecure_url'],
        reason: 'URLs must use HTTPS for security.',
      };
    }

    return { passed: true, flags: [] };
  } catch {
    return {
      passed: false,
      flags: ['invalid_url'],
      reason: 'Invalid URL format.',
    };
  }
}

// Check image URL (basic validation + optional AI moderation)
async function moderateImageUrl(imageUrl: string): Promise<ModerationResult> {
  // Basic URL validation
  const urlCheck = checkUrl(imageUrl);
  if (!urlCheck.passed) {
    return urlCheck;
  }

  // Check that URL points to an image
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');

    if (!contentType?.startsWith('image/')) {
      return {
        passed: false,
        flags: ['not_image'],
        reason: 'Image URL must point to a valid image file.',
      };
    }
  } catch {
    return {
      passed: false,
      flags: ['unreachable_image'],
      reason: 'Could not verify image URL. Please ensure the image is publicly accessible.',
    };
  }

  // For more thorough image moderation, you could add OpenAI Vision API here
  // This would analyze the actual image content for inappropriate material

  return { passed: true, flags: [] };
}

// Main moderation function
export async function moderateAd(
  headline: string,
  clickUrl: string,
  imageUrl: string
): Promise<ModerationResult> {
  const results: ModerationResult[] = [];

  // Run all checks
  const [textResult, clickUrlResult, imageResult] = await Promise.all([
    moderateText(headline),
    Promise.resolve(checkUrl(clickUrl)),
    moderateImageUrl(imageUrl),
  ]);

  results.push(textResult, clickUrlResult, imageResult);

  // Combine results
  const allFlags = results.flatMap(r => r.flags);
  const failedResults = results.filter(r => !r.passed);

  if (failedResults.length > 0) {
    return {
      passed: false,
      flags: allFlags,
      reason: failedResults.map(r => r.reason).join(' '),
    };
  }

  return { passed: true, flags: [] };
}

// Moderation for tip submissions
export async function moderateTipContent(
  content: string,
  headline?: string
): Promise<ModerationResult> {
  const textToModerate = headline ? `${headline}\n\n${content}` : content;

  return moderateText(textToModerate);
}
