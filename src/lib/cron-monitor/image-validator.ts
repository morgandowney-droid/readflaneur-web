/**
 * Cron Monitoring System - Image Validator
 *
 * Validates article images to detect missing or placeholder images.
 */

import { FIX_CONFIG } from './types';

/**
 * Check if an image URL is missing or empty
 */
export function isMissingImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return true;
  if (imageUrl.trim() === '') return true;
  return false;
}

/**
 * Check if an image URL points to a placeholder SVG
 */
export function isPlaceholderImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false;

  // Check for SVG extension
  if (imageUrl.toLowerCase().endsWith('.svg')) {
    return true;
  }

  return false;
}

/**
 * Check if an image URL is valid (not missing, not placeholder)
 */
export function isValidImage(imageUrl: string | null | undefined): boolean {
  if (isMissingImage(imageUrl)) return false;
  if (isPlaceholderImage(imageUrl)) return false;
  return true;
}

/**
 * Validate an image URL by attempting to fetch it
 * Returns true if the image exists and is accessible
 */
export async function validateImageUrl(imageUrl: string): Promise<{
  valid: boolean;
  error?: string;
  contentType?: string;
  size?: number;
}> {
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });

    if (!response.ok) {
      return {
        valid: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    // Check if it's an image
    if (contentType && !contentType.startsWith('image/')) {
      return {
        valid: false,
        error: `Not an image: ${contentType}`,
      };
    }

    return {
      valid: true,
      contentType: contentType || undefined,
      size: contentLength ? parseInt(contentLength, 10) : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Determine the image issue type for an article
 */
export function getImageIssueType(
  imageUrl: string | null | undefined
): 'missing_image' | 'placeholder_image' | null {
  if (isMissingImage(imageUrl)) {
    return 'missing_image';
  }
  if (isPlaceholderImage(imageUrl)) {
    return 'placeholder_image';
  }
  return null;
}
