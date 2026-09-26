// config/database.config.ts
import mongoose from "mongoose";
import config from "./app.config";

/**
 * Database Configuration - MongoDB connection management
 * This file handles MongoDB database connections, including connection setup,
 * error handling, and graceful shutdown procedures
 */

/**
 * Connection options tuned for request latency.
 *
 * - Index builds: mongoose runs createIndexes for every model on each boot when
 *   autoIndex is on. In production that is ~200 index definitions per replica
 *   start, which saturates a small cluster for minutes after every deploy.
 *   Production defaults to off; set MONGO_AUTO_INDEX=true to turn it back on, or
 *   run `npm run db:indexes` after adding a new index.
 * - Pool: keep a few warm connections so a user request never pays for a new
 *   TLS + SCRAM handshake.
 */
export function buildConnectOptions(
    env: NodeJS.ProcessEnv = process.env,
    appEnv: string = config.server.env
): mongoose.ConnectOptions {
    const flag = env.MONGO_AUTO_INDEX?.trim().toLowerCase();
    const autoIndex = flag ? flag === 'true' : appEnv !== 'production';
    const intFromEnv = (name: string, fallback: number): number => {
        const n = Number.parseInt(env[name] ?? '', 10);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    return {
        autoIndex,
        autoCreate: autoIndex,
        minPoolSize: intFromEnv('MONGO_MIN_POOL_SIZE', 5),
        maxPoolSize: intFromEnv('MONGO_MAX_POOL_SIZE', 50),
        maxIdleTimeMS: intFromEnv('MONGO_MAX_IDLE_MS', 10 * 60 * 1000),
    };
}

/**
 * Establishes connection to MongoDB database
 * Connects to MongoDB using the URI from application configuration
 * Includes comprehensive error handling and process management
 * 
 * @returns Promise<void> - Resolves when connection is established
 * @throws Error - If connection fails, process exits with code 1
 */
export const connectDB = async (): Promise<void> => {
    try {
        // ===== ESTABLISH DATABASE CONNECTION =====
        // Connect to MongoDB using the URI from configuration
        // Modern mongoose doesn't require deprecated options
        await mongoose.connect(config.database.uri, buildConnectOptions());
        
        // ===== LOG SUCCESS =====
        // Log successful database connection
        console.log("✅ MongoDB Connected Successfully.");
    } catch (error) {
        // ===== HANDLE CONNECTION ERROR =====
        // Log detailed error information for debugging
        console.error("❌ MongoDB Connection Error:", error);
        
        // ===== EXIT PROCESS =====
        // Exit the process with error code 1 if database connection fails
        // This prevents the application from running without database access
        process.exit(1);
    }
};

/**
 * Gracefully closes MongoDB database connection
 * Properly closes the database connection when the application shuts down
 * Includes error handling to prevent shutdown issues
 * 
 * @returns Promise<void> - Resolves when connection is closed
 */
export const closeDB = async (): Promise<void> => {
    try {
        // ===== CLOSE DATABASE CONNECTION =====
        // Gracefully close the MongoDB connection
        await mongoose.connection.close();
        
        // ===== LOG SUCCESS =====
        // Log successful connection closure
        console.log("📡 MongoDB connection closed.");
    } catch (error) {
        // ===== HANDLE CLOSURE ERROR =====
        // Log error but don't throw to prevent shutdown issues
        console.error("❌ Error closing MongoDB connection:", error);
    }
};