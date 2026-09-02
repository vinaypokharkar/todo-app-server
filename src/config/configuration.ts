/** Typed config factory. Consumed via ConfigService; keeps env access in one place. */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  clerkSecretKey: string;
  corsOrigins: string;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongodbUri: process.env.MONGODB_URI ?? '',
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
});
