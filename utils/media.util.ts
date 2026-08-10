import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/app.config';

/**
 * Resilient Cloudflare-backed Media Utility for high-performance file uploads natively.
 */
export class MediaUtil {
  /**
   * Securely uploads a physical file buffer to the external media cloud natively.
   * 
   * @param {Buffer} fileBuffer - Physical raw bytes.
   * @param {string} fileName - Original descriptor.
   * @param {string} mimeType - File type mapping.
   * @returns {Promise<string>} The resulting physical URL.
   */
  public static async upload(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    try {
      const formData = new FormData();
      
      // Generate a unique physical filename natively using structural UUIDv4 to avoid collisions
      const extension = fileName.split('.').pop() || 'jpg';
      const uniqueFileName = `${uuidv4()}.${extension}`;
      
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
      formData.append('file', blob, uniqueFileName);

      const response = await axios.post(config.media?.uploadUrl || '', formData, {
        headers: {
          'x-api-key': config.media?.apiKey || '',
          'Content-Type': 'multipart/form-data'
        }
      });

      const url = response.data.url;
      if (!url) throw new Error('Failed to retrieve physical URL from media server footprint natively');

      return url;
    } catch (error: any) {
      console.error('❌ Media upload failure natively:', error.response?.data || error.message);
      throw new Error(`Media upload failed: ${error.message}`);
    }
  }
}

export default MediaUtil;
