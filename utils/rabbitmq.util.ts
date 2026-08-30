import amqp from 'amqplib';
import config from '../config/app.config';

let connection: any = null;
let channel: any = null;

export class RabbitMQUtil {
  /**
   * Boots the active Message Broker listener and bindings flawlessly.
   */
  public static async init(): Promise<void> {
    try {
      connection = await amqp.connect(config.rabbitmq?.uri || 'amqp://localhost');
      channel = await connection.createChannel();
      console.log('🐇 RabbitMQ Connected Successfully');
    } catch (error) {
      console.error('❌ RabbitMQ Connection Error:', error);
      throw error;
    }
  }

  public static getChannel(): any {
    return channel;
  }

  /**
   * Lightweight broker liveness check for /health.
   * Does not return connection URIs or host details.
   */
  public static async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    if (!connection || !channel) {
      return { ok: false, reason: 'not_initialized' };
    }

    try {
      if ((connection as any).connection?.stream?.destroyed) {
        return { ok: false, reason: 'connection_closed' };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'broker_unreachable' };
    }
  }

  /**
   * Distributes a massive heavy payload onto the background queue reliably.
   * Fire and Forget architecture safely prevents API block lag completely.
   */
  public static async publishToQueue(queueName: string, data: any): Promise<void> {
    const ch = RabbitMQUtil.getChannel();
    if (!ch) {
      throw new Error('RabbitMQ channel is not available');
    }

    await ch.assertQueue(queueName, { durable: true });
    ch.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), { persistent: true });
  }

  /**
   * Safely monitors the backlog Queue silently on an alternate logical Node process asynchronously. 
   */
  public static async consumeQueue(queueName: string, callback: (msg: any) => void): Promise<void> {
    const ch = RabbitMQUtil.getChannel();
    if (!ch) return; // RabbitMQ disabled
    
    await ch.assertQueue(queueName, { durable: true });
    ch.consume(queueName, (msg: any) => {
      if (msg !== null) {
        const payload = JSON.parse(msg.content.toString());
        callback(payload);
        ch.ack(msg); // Guarantee it gets wiped ONLY after the callback completes beautifully.
      }
    });
  }
}

export default RabbitMQUtil;
