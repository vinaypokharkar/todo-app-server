/** Typed config factory. Consumed via ConfigService; keeps env access in one place. */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  firebaseServiceAccountBase64: string;
  corsOrigins: string;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongodbUri: process.env.MONGODB_URI ?? '',
  firebaseServiceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? '',
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
});
