import sizeOf from 'image-size';
import * as MP4Box from 'mp4box';

/**
 * Universal Utility for extracting physical metadata from media streams natively.
 */
export class MediaMetadataUtil {
  /**
   * Securely extracts dimensions from an image buffer natively.
   * Supports JPEG, PNG, WebP, GIF, etc.
   * 
   * @param {Buffer} buffer - Raw physical binary data.
   * @returns {{ width: number, height: number }} Resolved dimensions or 0,0 fallback.
   */
  public static getImageDimensions(buffer: Buffer): { width: number, height: number } {
    try {
      const dimensions = sizeOf(buffer);
      return {
        width: dimensions.width || 0,
        height: dimensions.height || 0
      };
    } catch (error) {
      console.error('Failed to extract image dimensions natively:', error);
      return { width: 0, height: 0 };
    }
  }

  /**
   * Securely extracts dimensions from a video buffer natively using MP4Box.js.
   * Specifically optimized for MP4/MOV containers.
   * 
   * @param {Buffer} buffer - Raw physical binary data.
   * @returns {Promise<{ width: number, height: number }>} Resolved dimensions or 0,0 fallback.
   */
  public static async getVideoDimensions(buffer: Buffer): Promise<{ width: number, height: number }> {
    return new Promise((resolve) => {
      try {
        const mp4boxfile = MP4Box.createFile();
        
        mp4boxfile.onReady = (info: any) => {
          if (info && info.videoTracks && info.videoTracks.length > 0) {
            const track = info.videoTracks[0];
            resolve({
              width: track.track_width || 0,
              height: track.track_height || 0
            });
          } else {
            resolve({ width: 0, height: 0 });
          }
        };

        mp4boxfile.onError = (e: any) => {
          console.error('MP4Box parsing error natively:', e);
          resolve({ width: 0, height: 0 });
        };

        // Standard Buffer conversion to ArrayBuffer for MP4Box consumption
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        (arrayBuffer as any).fileStart = 0;
        
        mp4boxfile.appendBuffer(arrayBuffer as any);
        mp4boxfile.flush();
      } catch (error) {
        console.error('Structural fault during video dimension extraction natively:', error);
        resolve({ width: 0, height: 0 });
      }
    });
  }
}

export default MediaMetadataUtil;
