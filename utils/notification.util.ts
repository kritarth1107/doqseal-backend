import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// Assumes GOOGLE_APPLICATION_CREDENTIALS environment variable is set
// Firebase initialized centrally in server.ts natively

/**
 * Utility to handle Firebase in-app push notifications.
 */
export class NotificationUtil {
    
    /**
     * Sends a push notification to all users subscribed to 'all_users' topic.
     * @param title Title of the notification
     * @param body Body content
     * @param data Optional custom data object
     */
    public static async sendToAllUsers(title: string, body: string, data?: any): Promise<void> {
        try {
            const message: admin.messaging.Message = {
                topic: 'all_users',
                notification: { title, body },
                data: data || {},
            };
            await admin.messaging().send(message);
            console.log(`🔔 Notification sent to all users`);
        } catch (error) {
            console.error('❌ Error sending notification to all users:', error);
            throw error;
        }
    }

    /**
     * Sends a push notification to a specific user using their FCM device token.
     * @param deviceToken The FCM token of the target device
     * @param title Title of the notification
     * @param body Body content
     * @param data Optional custom data object
     */
    public static async sendToSpecificUser(deviceToken: string, title: string, body: string, data?: any): Promise<void> {
        try {
            const message: admin.messaging.Message = {
                token: deviceToken,
                notification: { title, body },
                data: data || {},
            };
            await admin.messaging().send(message);
            console.log(`🔔 Notification sent to specific user: ${deviceToken}`);
        } catch (error) {
            console.error('❌ Error sending notification to specific user:', error);
            throw error;
        }
    }

    /**
     * Sends a push notification exclusively to all iOS users.
     * @param title Title of the notification
     * @param body Body content
     * @param data Optional custom data object
     */
    public static async sendToIOSOnly(title: string, body: string, data?: any): Promise<void> {
        try {
            const message: admin.messaging.Message = {
                topic: 'ios_users',
                notification: { title, body },
                data: data || {},
                apns: {
                    payload: {
                        aps: { sound: 'default' }
                    }
                }
            };
            await admin.messaging().send(message);
            console.log(`🔔 Notification sent to iOS users`);
        } catch (error) {
            console.error('❌ Error sending notification to iOS users:', error);
            throw error;
        }
    }

    /**
     * Sends a push notification exclusively to all Android users.
     * @param title Title of the notification
     * @param body Body content
     * @param data Optional custom data object
     */
    public static async sendToAndroidOnly(title: string, body: string, data?: any): Promise<void> {
        try {
            const message: admin.messaging.Message = {
                topic: 'android_users',
                notification: { title, body },
                data: data || {},
                android: {
                    notification: { sound: 'default' }
                }
            };
            await admin.messaging().send(message);
            console.log(`🔔 Notification sent to Android users`);
        } catch (error) {
            console.error('❌ Error sending notification to Android users:', error);
            throw error;
        }
    }
}

export default NotificationUtil;
