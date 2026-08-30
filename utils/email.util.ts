import { Resend } from 'resend';
import axios from 'axios';
import config from '../config/app.config';

const resend = new Resend(config.email.resendApiKey);

const DEFAULT_FROM =
  process.env.EMAIL_FROM?.trim() ||
  'DoqSeal Security <security@mail.doqseal.com>';
const BRAND_NAME = 'DoqSeal';
const BRAND_LOGO_URL = 'https://www.doqseal.com/assets/DoqSeal-full.svg';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: any[];
}

export class EmailUtil {
  private static useMsg91(): boolean {
    return Boolean(process.env.MSG91_API_KEY);
  }

  private static parseFromAddress(from?: string): { name: string; email: string } {
    const fromAddress = from || DEFAULT_FROM;
    const match = fromAddress.match(/^(.*?)<([^>]+)>$/);

    if (match) {
      return {
        name: match[1].trim() || BRAND_NAME,
        email: match[2].trim(),
      };
    }

    return {
      name: BRAND_NAME,
      email: fromAddress,
    };
  }

  private static async sendViaMsg91(options: SendEmailOptions): Promise<void> {
    const apiKey = process.env.MSG91_API_KEY;
    if (!apiKey) {
      throw new Error('MSG91_API_KEY not configured');
    }

    const { name, email } = this.parseFromAddress(options.from);
    const recipients = (Array.isArray(options.to) ? options.to : [options.to]).map(
      (recipient) => ({
        to: [{ email: recipient, name: '' }],
      })
    );

    const payload: Record<string, unknown> = {
      recipients,
      from: { name, email },
      domain: process.env.MSG91_DOMAIN || 'mail.doqseal.com',
      subject: options.subject,
    };

    if (process.env.MSG91_TEMPLATE_ID) {
      payload.template_id = process.env.MSG91_TEMPLATE_ID;
      payload.variables = {
        subject: options.subject,
        body: options.html || options.text || '',
      };
    } else {
      payload.body = options.html || options.text || '';
    }

    await axios.post('https://control.msg91.com/api/v5/email/send', payload, {
      headers: {
        accept: 'application/json',
        authkey: apiKey,
        'content-type': 'application/json',
      },
      timeout: 15_000,
    });

    const recipientStr = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    console.log(`📩 Email sent successfully via MSG91 to ${recipientStr}`);
  }

  private static async sendViaResend(options: SendEmailOptions): Promise<void> {
    const fromAddress = options.from || DEFAULT_FROM;

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
  }

  /**
   * General-purpose email sender using MSG91 when configured, otherwise Resend.
   */
  public static async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      if (this.useMsg91()) {
        await this.sendViaMsg91(options);
      } else {
        await this.sendViaResend(options);
      }
    } catch (error) {
      const provider = this.useMsg91() ? 'MSG91' : 'Resend';
      console.error(`❌ Error sending email via ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Pre-configured utility for sending a formatted OTP email.
   */
  public static async sendOTPEmail(
    to: string,
    otp: string,
    context: string = 'Verification'
  ): Promise<void> {
    const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<style>
					body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111; margin: 0; padding: 0; background-color: #ffffff; }
					.container { max-width: 600px; margin: 0; padding: 40px; text-align: left; }
					.brand { margin-bottom: 40px; }
					.logo-img { height: 36px; width: auto; display: block; }
					h1 { font-size: 24px; font-weight: 700; color: #000; margin-bottom: 24px; }
					p { font-size: 16px; color: #444; margin-bottom: 16px; }
					.otp-code { font-size: 36px; font-weight: 800; color: #000; margin: 32px 0; letter-spacing: 2px; }
					.footer { margin-top: 60px; font-size: 13px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
					.warning { color: #666; font-size: 14px; font-style: italic; }
				</style>
			</head>
			<body>
				<div class="container">
					<div class="brand">
						<img src="${BRAND_LOGO_URL}" class="logo-img" alt="DoqSeal">
					</div>
					<h1>Verification Code</h1>
					<p>Hello,</p>
					<p>Use the following code to complete your ${context.toLowerCase()} to DoqSeal. This code is valid for the next 10 minutes.</p>
					<div class="otp-code">${otp}</div>
					<p class="warning">If you didn't request this code, you can safely ignore this email.</p>
					<div class="footer">
						<p>&copy; ${new Date().getFullYear()} DoqSeal. All rights reserved.</p>
						<p>Sent securely by the DoqSeal team.</p>
					</div>
				</div>
			</body>
			</html>
    `;

    return this.sendEmail({
      to,
      subject: `Your DoqSeal ${context} code`,
      html,
      from: DEFAULT_FROM,
    });
  }
}

export default EmailUtil;
