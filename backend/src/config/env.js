import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_SECRET = 'dev-only-change-me';

export function getEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret = process.env.JWT_SECRET || DEFAULT_SECRET;

  if (nodeEnv === 'production' && (jwtSecret === DEFAULT_SECRET || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be a random string of at least 32 characters in production');
  }

  return {
    nodeEnv,
    port: Number(process.env.PORT || 4000),
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/incidenthub',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    redisUrl: process.env.REDIS_URL || '',
    smtpUrl: process.env.SMTP_URL || '',
    smtpFrom: process.env.SMTP_FROM || '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    stripePricePro: process.env.STRIPE_PRICE_PRO || '',
    stripePriceBusiness: process.env.STRIPE_PRICE_BUSINESS || '',
    aiApiKey: process.env.AI_API_KEY || '',
    aiBaseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  };
}
