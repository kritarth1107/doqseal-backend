import Notification from '../model/notification.model';
import User from '../model/user.model';
import NotificationUtil from './notification.util';

/**
 * Dedicated utility for physical Firebase Push Notification broadcasting natively.
 * Resolves active device footprints and dispatches the payload asynchronously.
 */
export const sendFCM = async (params: {
  recipientId: string;
  title: string;
  message: string;
  data?: any;
}) => {
  const { recipientId, title, message, data } = params;

  try {
    const user = await User.findOne({ userId: recipientId }).select('fcmTokens').lean();
    
    if (user && (user as any).fcmTokens && (user as any).fcmTokens.length > 0) {
      // Dispatch push notifications to all registered device footprints
      const pushPromises = (user as any).fcmTokens.map((token: string) => 
        NotificationUtil.sendToSpecificUser(token, title, message, { ...data })
      );
      
      // We use allSettled to ensure one bad token doesn't crash the entire broadcast
      await Promise.allSettled(pushPromises);
      return true;
    }
    return false;
  } catch (error: any) {
    console.error(`❌ FCM Broadcast Failure for ${recipientId}:`, error.message);
    return false;
  }
};

/**
 * High-performance notification orchestrator that coordinates both in-app persistence 
 * and Firebase physical push broadcasting.
 */
export const sendNotification = async (params: {
  recipientId: string;
  senderId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
}) => {
  const { recipientId, senderId, type, title, message, data } = params;

  // 1. Physically persist the notification record in MongoDB
  const notification = await Notification.create({
    recipientId,
    senderId,
    type,
    title,
    message,
    data: data || {}
  });

  // 2. Delegate the physical device broadcast to the FCM layer
  // We fire and forget the push results to ensure maximum API throughput
  sendFCM({
    recipientId,
    title,
    message,
    data: { ...data, type }
  }).catch(err => console.error('Background FCM delivery error:', err));

  return notification;
};

export default sendNotification;