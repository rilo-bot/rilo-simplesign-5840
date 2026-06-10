/**
 * AUTO-GENERATED — DO NOT EDIT.
 * This is the shared API contract for this app, regenerated from the plan on
 * every build. Both the frontend (@/contract) and the backend (./contract)
 * import these types so the request/response shapes can never drift.
 */


export interface User {
  /** Unique user identifier */
  id: string;
  /** User's email address, used for OTP delivery and identity */
  email: string;
  /** User's chosen display name */
  displayName?: string;
  /** ISO timestamp of account creation */
  createdAt: string;
  /** ISO timestamp of the most recent successful sign-in */
  lastLoginAt?: string;
}

export interface OtpCode {
  /** Unique record identifier */
  id: string;
  /** Email address the code was sent to */
  email: string;
  /** The 6-digit one-time code */
  code: string;
  /** ISO timestamp after which the code is invalid */
  expiresAt: string;
  /** ISO timestamp of code creation */
  createdAt: string;
  /** Whether the code has already been consumed */
  used: boolean;
}

export interface ApiContract {
  "request-code": { method: "POST"; path: "/api/auth/request-code"; request: { email: string }; response: { ok: boolean } };
  "verify-code": { method: "POST"; path: "/api/auth/verify-code"; request: { email: string; code: string }; response: { token: string; user: User } };
  "get-me": { method: "GET"; path: "/api/auth/me"; request: void; response: User };
  "update-profile": { method: "PATCH"; path: "/api/users/me"; request: { displayName?: string }; response: User };
}

export const API_ROUTES = {
  "request-code": { method: "POST", path: "/api/auth/request-code" },
  "verify-code": { method: "POST", path: "/api/auth/verify-code" },
  "get-me": { method: "GET", path: "/api/auth/me" },
  "update-profile": { method: "PATCH", path: "/api/users/me" },
} as const;
