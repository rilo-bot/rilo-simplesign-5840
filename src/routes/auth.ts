import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import sgMail from '@sendgrid/mail';
import type { User, OtpCode } from '../contract';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

/** How long (ms) an OTP code remains valid */
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createAuthRouter(db: Db): Router {
  const router = Router();
  const users = db.collection<Omit<User, 'id'> & { _id?: unknown }>('users');
  const otpCodes = db.collection<Omit<OtpCode, 'id'> & { _id?: unknown }>('otp_codes');

  // ------------------------------------------------------------------ //
  // POST /api/auth/request-code
  // ------------------------------------------------------------------ //
  router.post('/request-code', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: unknown };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Generate a 6-digit OTP
    const code = String(Math.floor(100000 + crypto.randomInt(900000)));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    const id = crypto.randomUUID();

    // Invalidate any previous unused codes for this email
    await otpCodes.updateMany(
      { email: normalizedEmail, used: false },
      { $set: { used: true } }
    );

    // Store the new code
    const otpDoc = {
      id,
      email: normalizedEmail,
      code,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      used: false,
    };
    await otpCodes.insertOne(otpDoc);

    // Ensure a user record exists (create on first contact)
    const existingUser = await users.findOne({ email: normalizedEmail });
    if (!existingUser) {
      await users.insertOne({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        createdAt: now.toISOString(),
      });
    }

    // Send the code via SendGrid
    const apiKey = process.env.EMAIL_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;

    if (!apiKey || !emailFrom) {
      console.error('SendGrid env vars not set (EMAIL_API_KEY / EMAIL_FROM).');
      res.status(500).json({ error: 'Could not send the code, please try again.' });
      return;
    }

    sgMail.setApiKey(apiKey);

    try {
      await Promise.race([
        sgMail.send({
          to: normalizedEmail,
          from: emailFrom,
          subject: 'Your SimpleSign verification code',
          text: `Your sign-in code is: ${code}\n\nIt expires in 10 minutes. Do not share it with anyone.`,
          html: `<p>Your sign-in code is: <strong>${code}</strong></p><p>It expires in 10 minutes. Do not share it with anyone.</p>`,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SendGrid timeout')), 8000)
        ),
      ]);
    } catch (err) {
      console.error('Failed to send OTP email:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Could not send the code, please try again.' });
      return;
    }

    const response: { ok: boolean } = { ok: true };
    res.status(200).json(response);
  });

  // ------------------------------------------------------------------ //
  // POST /api/auth/verify-code
  // ------------------------------------------------------------------ //
  router.post('/verify-code', async (req: Request, res: Response) => {
    const { email, code } = req.body as { email?: unknown; code?: unknown };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'A verification code is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();

    // Find the most recent unused, non-expired code for this email
    const otpDoc = await otpCodes.findOne(
      {
        email: normalizedEmail,
        used: false,
        expiresAt: { $gt: now.toISOString() },
      },
      { sort: { createdAt: -1 } }
    );

    if (!otpDoc || (otpDoc as unknown as OtpCode & { _id: unknown }).id === undefined) {
      res.status(400).json({ error: 'No valid code found. Please request a new one.' });
      return;
    }

    const storedCode = (otpDoc as unknown as OtpCode).code;
    if (storedCode !== code.trim()) {
      res.status(400).json({ error: 'Incorrect code. Please check and try again.' });
      return;
    }

    // Mark the code as used
    await otpCodes.updateOne(
      { email: normalizedEmail, used: false },
      { $set: { used: true } }
    );

    // Retrieve or create the user
    let userDoc = await users.findOne({ email: normalizedEmail });
    if (!userDoc) {
      const newUser = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        createdAt: now.toISOString(),
        lastLoginAt: now.toISOString(),
      };
      await users.insertOne(newUser);
      userDoc = await users.findOne({ email: normalizedEmail });
    } else {
      await users.updateOne(
        { email: normalizedEmail },
        { $set: { lastLoginAt: now.toISOString() } }
      );
      userDoc = await users.findOne({ email: normalizedEmail });
    }

    if (!userDoc) {
      res.status(500).json({ error: 'Could not retrieve user account.' });
      return;
    }

    const user: User = {
      id: (userDoc as unknown as User).id,
      email: (userDoc as unknown as User).email,
      displayName: (userDoc as unknown as User).displayName,
      createdAt: (userDoc as unknown as User).createdAt,
      lastLoginAt: (userDoc as unknown as User).lastLoginAt,
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set.' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      secret,
      { expiresIn: '30d' }
    );

    const response: { token: string; user: User } = { token, user };
    res.status(200).json(response);
  });

  // ------------------------------------------------------------------ //
  // GET /api/auth/me  (PROTECTED)
  // ------------------------------------------------------------------ //
  router.get('/me', requireAuth, async (req: Request, res: Response) => {
    const { userEmail } = req as AuthenticatedRequest;

    const userDoc = await users.findOne({ email: userEmail });
    if (!userDoc) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const user: User = {
      id: (userDoc as unknown as User).id,
      email: (userDoc as unknown as User).email,
      displayName: (userDoc as unknown as User).displayName,
      createdAt: (userDoc as unknown as User).createdAt,
      lastLoginAt: (userDoc as unknown as User).lastLoginAt,
    };

    res.status(200).json(user);
  });

  return router;
}
