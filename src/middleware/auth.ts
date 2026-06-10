import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header.' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set.' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as { userId: string; email: string };
    (req as AuthenticatedRequest).userId = payload.userId;
    (req as AuthenticatedRequest).userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
