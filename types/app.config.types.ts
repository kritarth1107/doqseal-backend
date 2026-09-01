/**
 * Application Configuration Types - TypeScript interfaces for application configuration
 */

export interface ServerConfig {
    port: number;
    env: string;
    apiVersion: string;
    corsOrigins: string[];
    liveFrontendUrl: string;
}

export interface JWTConfig {
    secret: string | undefined;
    validity: string;
}

export interface DatabaseConfig {
    uri: string;
    options: {
        useNewUrlParser: boolean;
        useUnifiedTopology: boolean;
    };
}

export interface SecurityConfig {
    bcryptSaltRounds: number;
    rateLimiting: {
        windowMs: number;
        max: number;
    };
}

export interface LoggingConfig {
    level: string;
    filename: string;
}

export interface EncryptionConfig {
    secretKey: string | undefined;
    ivLength: number;
}

export interface EmailConfig {
    resendApiKey?: string;
}

export interface StorageConfig {
    root: string;
    azureConnectionString?: string;
    azureContainer?: string;
}

export interface AiEngineConfig {
    url: string;
}

export interface MediaConfig {
    uploadUrl?: string;
    apiKey?: string;
}

export interface FeaturesConfig {
    esignEnabled: boolean;
}

export interface CashfreeConfig {
    appId?: string;
    secretKey?: string;
    webhookSecret?: string;
    env: 'sandbox' | 'production';
    apiVersion: string;
}

export interface AppConfig {
    server: ServerConfig;
    jwt: JWTConfig;
    database: DatabaseConfig;
    security: SecurityConfig;
    logging: LoggingConfig;
    encryption: EncryptionConfig;
    email: EmailConfig;
    rabbitmq?: { uri: string; extractionQueue: string };
    storage: StorageConfig;
    aiEngine: AiEngineConfig;
    media?: MediaConfig;
    features: FeaturesConfig;
    cashfree: CashfreeConfig;
}
