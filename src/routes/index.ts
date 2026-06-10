import type { Express } from 'express';
import type { Db } from 'mongodb';
import { createAuthRouter } from './auth';
import { createUsersRouter } from './users';

/**
 * Register every API route here.
 *
 * Create route modules under src/ (e.g. src/routes/tasks.ts) and call them from
 * this function. `db` is the connected MongoDB database (native driver) —
 * use `db.collection('name')` directly; there are NO schemas or models.
 *
 * The shared API contract lives in ./contract (engine-owned — DO NOT edit it).
 * Import its types so your request/response shapes match the frontend exactly.
 */
export function registerRoutes(app: Express, db: Db): void {
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/users', createUsersRouter(db));
}
