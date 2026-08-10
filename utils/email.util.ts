import { Resend } from 'resend';
import config from '../config/app.config';

// Initialize the Resend client with API key from config
const resend = new Resend(config.email.resendApiKey);

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string; // Custom sender Name or Address
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: any[]; 
}

export class EmailUtil {
  /**
   * General-purpose email sender using Resend.
   */
  public static async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      const fromAddress = options.from || `Sakshya <no-reply@emails.sakshya.io>`;

      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text || '',
        html: options.html as string,
        cc: options.cc,
        bcc: options.bcc,
        attachments: options.attachments,
      });

      if (error) {
        throw error;
      }

      const recipientStr = Array.isArray(options.to) ? options.to.join(', ') : options.to;
      console.log(`📩 Email sent successfully via Resend to ${recipientStr}. ID: ${data?.id}`);
    } catch (error) {
      console.error(`❌ Error sending email via Resend:`, error);
      throw error;
    }
  }

  /**
   * Pre-configured utility for sending a formatted OTP text to a user.
   */
  public static async sendOTPEmail(to: string, otp: string, context: string = 'Verification'): Promise<void> {
    const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<style>
					body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111; margin: 0; padding: 0; background-color: #ffffff; }
					.container { max-width: 600px; margin: 0; padding: 40px; text-align: left; }
					.pill-header { 
						background: #000; 
						border-radius: 50px; 
						padding: 8px 16px; 
						display: inline-flex; 
						align-items: center; 
						margin-bottom: 40px;
					}
					.logo-img { height: 20px; width: auto; margin-right: 10px; filter: brightness(0) invert(1); }
					.logo-text { color: #fff; font-size: 16px; font-weight: 700; letter-spacing: -0.5px; }
					h1 { font-size: 24px; font-weight: 700; color: #000; margin-bottom: 24px; }
					p { font-size: 16px; color: #444; margin-bottom: 16px; }
					.otp-code { font-size: 36px; font-weight: 800; color: #000; margin: 32px 0; letter-spacing: 2px; }
					.footer { margin-top: 60px; font-size: 13px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
					.warning { color: #666; font-size: 14px; font-style: italic; }
				</style>
			</head>
			<body>
				<div class="container">
					<div class="pill-header">
						<img src="https://www.sakshya.io/sakshya_logo.svg" class="logo-img" alt="Sakshya Logo">
						<span class="logo-text">Sakshya</span>
					</div>
					<h1>Verification Code</h1>
					<p>Hello,</p>
					<p>Use the following code to complete your ${context.toLowerCase()} to Sakshya. This code is valid for the next 10 minutes.</p>
					<div class="otp-code">${otp}</div>
					<p class="warning">If you didn't request this code, you can safely ignore this email.</p>
					<div class="footer">
						<p>&copy; ${new Date().getFullYear()} Sakshya. All rights reserved.</p>
						<p>Sent with ❤️ from the Sakshya Team.</p>
					</div>
				</div>
			</body>
			</html>
    `;

    return this.sendEmail({ 
      to, 
      subject: `Your Sakshya ${context} code`, 
      html,
      from: `Sakshya Security <no-reply@emails.sakshya.io>`
    });
  }
}

export default EmailUtil;
