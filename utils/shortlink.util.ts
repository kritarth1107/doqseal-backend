import { v4 as uuidv4 } from 'uuid';

export interface IShortlinkMetadata {
  title?: string;
  description?: string;
  image?: string;
}

/**
 * Shortlink Utility - Placeholder (Cloudflare KV disabled)
 */
export class ShortlinkUtil {
  /**
   * Creates a custom shortcode mapping.
   * Currently disabled (Cloudflare KV removed).
   * 
   * @param shortcode - The unique identifier for the shortlink.
   * @param targetUrl - The destination URL.
   * @param meta - Optional metadata for preview (title, description, image).
   */
  public async createShortcode(
    shortcode: string, 
    _targetUrl: string, 
    _meta: IShortlinkMetadata = {}
  ): Promise<string> {
    console.warn(`Shortlink creation for ${shortcode} skipped (Cloudflare KV disabled)`);
    return `https://rejig.app/${shortcode}`;
  }

  /**
   * Shortens a long URL by creating a random mapping.
   * 
   * @param longUrl - The original destination URL.
   * @param meta - Optional metadata for preview.
   * @returns The full shortened URL.
   */
  public async shortenUrl(longUrl: string, meta: IShortlinkMetadata = {}): Promise<string> {
    const shortcode = uuidv4().split('-')[0];
    return this.createShortcode(shortcode, longUrl, meta);
  }
}

export default new ShortlinkUtil();
