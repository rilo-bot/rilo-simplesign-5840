import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import type { User } from '../contract';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

export function createUsersRouter(db: Db): Router {
  const router = Router();
  const users = db.collection<Omit<User, 'id'> & { _id?: unknown }>('users');

  // ------------------------------------------------------------------ //
  // PATCH /api/users/me  (PROTECTED)
  // Update the authenticated user's profile fields (e.g. displayName).
  // ------------------------------------------------------------------ //
  router.patch('/me', requireAuth, async (req: Request, res: Response) => {
    const { userId } = req as AuthenticatedRequest;
    const { displayName } = req.body as { displayName?: unknown };

    // Validate: displayName, if provided, must be a non-empty string
    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        res.status(400).json({ error: 'displayName must be a non-empty string.' });
        return;
      }
    }

    // Build the update — only apply fields that were actually provided
    const updates: Partial<User> = {};
    if (displayName !== undefined) {
      updates.displayName = displayName.trim();
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No updatable fields were provided.' });
      return;
    }

    try {
      const result = await users.findOneAndUpdate(
        { id: userId },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const userDoc = result as unknown as User;
      const user: User = {
        id: userDoc.id,
        email: userDoc.email,
        displayName: userDoc.displayName,
        createdAt: userDoc.createdAt,
        lastLoginAt: userDoc.lastLoginAt,
      };

      res.status(200).json(user);
    } catch (err) {
      console.error('Failed to update user profile:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Could not update profile. Please try again.' });
    }
  });

  return router;
}
