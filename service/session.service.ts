import Session from '../model/session.model';
import User from '../model/user.model';
import Membership from '../model/membership.model';

export type SessionListItem = {
  fingerprint: string;
  device: string;
  location: string;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  isCurrent: boolean;
};

function parseDevice(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown browser';
  const ua = userAgent.toLowerCase();
  let browser = 'Browser';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome';
  else if (ua.includes('firefox/')) browser = 'Firefox';
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';

  let os = '';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os') || ua.includes('macintosh')) os = 'macOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';

  return os ? `${browser} (${os})` : browser;
}

export class SessionService {
  public async listActiveSessions(
    userId: string,
    currentFingerprint?: string | null
  ): Promise<SessionListItem[]> {
    const sessions = await Session.find({ userId, status: 'ACTIVE' })
      .sort({ updatedAt: -1 })
      .lean();

    return sessions.map((session) => ({
      fingerprint: session.fingerprint,
      device: parseDevice(session.userAgent),
      location: session.ipAddress ? `IP ${session.ipAddress}` : 'Unknown',
      ipAddress: session.ipAddress || null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      isCurrent: Boolean(
        currentFingerprint && session.fingerprint === currentFingerprint
      ),
    }));
  }

  public async revokeSession(userId: string, fingerprint: string): Promise<void> {
    const result = await Session.updateOne(
      { userId, fingerprint, status: 'ACTIVE' },
      { status: 'REVOKED', updatedAt: new Date() }
    );
    if (result.matchedCount === 0) {
      throw new Error('Session not found or already revoked');
    }
  }

  public async deleteAccount(userId: string): Promise<void> {
    const user = await User.findOne({ userId, deletedAt: null });
    if (!user) {
      throw new Error('User not found');
    }

    user.deletedAt = new Date();
    await user.save();

    await Session.updateMany(
      { userId, status: 'ACTIVE' },
      { status: 'REVOKED', updatedAt: new Date() }
    );

    await Membership.updateMany(
      { userId, deletedAt: null },
      { deletedAt: new Date() }
    );
  }
}

export default new SessionService();
