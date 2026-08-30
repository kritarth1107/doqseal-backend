import User, { IUser } from '../model/user.model';
import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import Session from '../model/session.model';
import EmailUtil from '../utils/email.util';
import AES from '../utils/encyption';
import { ApiResponse } from '../utils/response.util';
import jwt from 'jsonwebtoken';
import config from '../config/app.config';
import { v4 as uuidv4 } from 'uuid';


/**
 * Auth Service - Handles authentication logic, OTP generation, and verification
 */
export class AuthService {
  /**
   * Request an OTP for login
   * @param email - User's email address
   */
  public async loginWithEmail(email: string) {
    // 1. Check if user exists
    const user = await User.findOne({ email }).lean();
    const isExistingUser = !!user;

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Send OTP via Email
    await EmailUtil.sendOTPEmail(email, otp, 'Login');

    // 4. Generate secure OTP Token (email + otp + timestamp)
    const tokenData = JSON.stringify({
      email,
      otp,
      timestamp: Date.now()
    });
    const otpToken = AES.encrypt(tokenData);

    return {
      otpToken,
      isExistingUser
    };
  }

  /**
   * Verify OTP and complete login/registration
   */
  public async verifyEmailLoginOTP(params: {
    email: string;
    otp: string;
    token: string;
    name?: string;
    sessionData?: {
      fingerprint: string;
      ipAddress?: string;
      userAgent?: string;
    };
  }) {
    const { email, otp, token, name, sessionData } = params;

    // 1. Decrypt and validate token
    let decryptedData;
    try {
      decryptedData = JSON.parse(AES.decrypt(token));
    } catch (error) {
      throw new Error('Invalid or expired token');
    }

    const { email: tEmail, otp: tOtp, timestamp } = decryptedData;

    // 2. Verify match and expiration (10 minutes)
    if (tEmail !== email || tOtp !== otp) {
      throw new Error('Invalid OTP');
    }

    if (Date.now() - timestamp > 10 * 60 * 1000) {
      throw new Error('OTP has expired');
    }

    // 3. Find or Create User
    let user = await User.findOne({ email, deletedAt: null });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // Placeholder name until onboarding; prefer provided name when present
      const displayName =
        name?.trim() ||
        email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ||
        'DoqSeal User';

      user = await this.createUserWithOrganisation({ email, name: displayName });
    } else {
      user.lastLoginAt = new Date();
      user.lastLoginData = {
        fingerprint: sessionData?.fingerprint || 'N/A',
        ipAddress: sessionData?.ipAddress || 'N/A',
        userAgent: sessionData?.userAgent || 'N/A',
        provider: "email"
      };
      await user.save();
    }

    // 4. Generate JWT and Session
    const { token: jwtToken, organisationName } = await this.createSessionToken(user, sessionData || { fingerprint: 'N/A' });

    return {
      user: {
        email: user.email,
        name: user.name,
        organisationName
      },
      isNewUser,
      onboardingCompleted: user.onboardingCompleted !== false,
      token: jwtToken
    };
  }

  /**
   * Handle Social Login (Google, etc.)
   */
  public async loginWithSocial(params: {
    provider: string;
    access_token: string;
    id_token?: string;
    email: string;
    name: string;
    avatar?: string;
    sessionData?: {
      fingerprint: string;
      ipAddress?: string;
      userAgent?: string;
    };
  }) {
    const { provider, email, name, avatar, sessionData } = params;

    // 1. Check if user exists
    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // Create User with Organisation and Membership
      user = await this.createUserWithOrganisation({ email, name, avatar });
    } else {
      // Update existing user details if they've changed
      if (avatar && !user.avatar) {
        user.avatar = avatar;
      }
      user.lastLoginAt = new Date();
    }

    // 2. Link social provider if not already linked
    const connectSocials = user.connectSocials || {};
    const existingProviderData = connectSocials[provider];

    connectSocials[provider] = {
      provider,
      access_token: AES.encrypt(params.access_token),
      id_token: params.id_token ? AES.encrypt(params.id_token) : undefined,
      linkedAt: existingProviderData?.linkedAt || new Date()
    };
    user.connectSocials = connectSocials;
    user.markModified('connectSocials');



    //add lastlogin data in users
    user.lastLoginAt = new Date();
    user.lastLoginData = {
      fingerprint: sessionData?.fingerprint || 'N/A',
      ipAddress: sessionData?.ipAddress || 'N/A',
      userAgent: sessionData?.userAgent || 'N/A',
      provider,
    };
    await user.save();

    // 3. Generate JWT and Session
    const { token: jwtToken, organisationName } = await this.createSessionToken(user, sessionData || { fingerprint: 'N/A' });

    return {
      user: {
        email: user.email,
        name: user.name,
        organisationName
      },
      isNewUser,
      onboardingCompleted: user.onboardingCompleted !== false,
      token: jwtToken
    };
  }

  /**
   * Helper: Create a session and generate a JWT token
   */
  private async createSessionToken(user: IUser, sessionParams: {
    fingerprint: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ token: string; organisationName: string }> {
    // 1. Fetch Organisation Name
    let organisationName = 'Personal';
    if (user.organisations && user.organisations.length > 0) {
      const org = await Organisation.findOne({ publicId: user.organisations[0].organisationId }).lean();
      if (org) {
        organisationName = org.name;
      }
    }

    // 2. Define Payload
    const payload = {
      userId: user.userId,
      email: user.email,
      displayName: user.name,
      organisationName: organisationName,
      fingerprint: sessionParams.fingerprint,
    };


    // 3. Sign Token
    const token = jwt.sign(payload, config.jwt.secret as string, {
      expiresIn: config.jwt.validity as any,
    });

    // 4. Create Session Record
    // Set expiration based on config (parsing "24h" to Date)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Default to 24h if parsing fails

    await Session.create({
      userId: user.userId,
      token: token,
      fingerprint: sessionParams.fingerprint,
      status: 'ACTIVE',
      ipAddress: sessionParams.ipAddress,
      userAgent: sessionParams.userAgent,
      expiresAt: expiresAt
    });

    return { token, organisationName };
  }


  /**
   * Helper: Create a new user along with their default organisation and membership
   */
  private async createUserWithOrganisation(params: {
    email: string;
    name: string;
    avatar?: string;
  }) {
    const { email, name, avatar } = params;

    // Create User
    const userId = uuidv4();

    const user = await User.create({
      userId,
      name,
      email,
      avatar,
      onboardingCompleted: false,
    });


    // Create Organisation (placeholder until onboarding)
    const orgId = uuidv4();
    const organisation = await Organisation.create({
      publicId: orgId,
      name: `${name.split(' ')[0]}'s Organisation`,
      slug: `${name.split(' ')[0].toLowerCase()}-${uuidv4().split('-')[0]}`,
      memberCount: 1,
      createdBy: userId
    });


    // Create Membership
    await Membership.create({
      organisationId: organisation._id,
      userId: user.userId,
      role: 'owner'
    });


    // Update user with organisationId
    user.organisations = [{ organisationId: organisation.publicId as string, role: 'owner' }];

    await user.save();

    return user;
  }

  /**
   * Logout user by revoking sessions
   */
  public async logout(userId: string, params: {
    type: 'current' | 'all' | 'specific';
    token?: string;
    fingerprint?: string;
  }) {
    const { type, token, fingerprint } = params;

    if (type === 'current' && token) {
      // Revoke only the session associated with the current token and fingerprint
      await Session.updateOne(
        { userId, token, fingerprint, status: 'ACTIVE' },
        { status: 'REVOKED', updatedAt: new Date() }
      );

    } else if (type === 'all') {
      // Revoke all active sessions for this user
      await Session.updateMany(
        { userId, status: 'ACTIVE' },
        { status: 'REVOKED', updatedAt: new Date() }
      );
    } else if (type === 'specific' && fingerprint) {
      // Revoke a specific session by fingerprint
      await Session.updateOne(
        { userId, fingerprint, status: 'ACTIVE' },
        { status: 'REVOKED', updatedAt: new Date() }
      );
    } else {
      throw new Error('Invalid logout parameters or missing required data');
    }

    return true;
  }
}


export default new AuthService();