import { FastifyReply } from 'fastify';

/**
 * Standardized API Response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: any;
  error?: any;
}

/**
 * Response Utility - Centralizes API response handling
 * Ensures consistent response structure across the entire application
 */
class ResponseUtil {
  /**
   * Send a success response
   * 
   * @param reply FastifyReply instance
   * @param message Success message
   * @param data Optional data payload
   * @param statusCode HTTP status code (default: 200)
   * @param meta Optional metadata (pagination, etc.)
   */
  public success<T>(
    reply: FastifyReply,
    message: string,
    data?: T,
    statusCode: number = 200,
    meta?: any
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      meta,
    };
    
    reply.status(statusCode).send(response);
  }

  /**
   * Send an error response
   * 
   * @param reply FastifyReply instance
   * @param message Error message
   * @param statusCode HTTP status code (default: 500)
   * @param error Optional detailed error object/string
   */
  public error(
    reply: FastifyReply,
    message: string,
    statusCode: number = 500,
    error?: any
  ): void {
    const response: ApiResponse = {
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    };
    
    reply.status(statusCode).send(response);
  }
}

export default new ResponseUtil();
