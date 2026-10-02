import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';

export function signToken(payload) {
  const env = getEnv();
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, getEnv().jwtSecret);
}
