import { API_BASE_URL } from '../config/api.js';

export interface StaffUserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface PortalUserInfo {
  id: string;
  customer_id: string;
  email: string;
  full_name?: string;
  phone?: string;
}

export interface UnifiedLoginResponse {
  message: string;
  userId: string;
  role: 'admin' | 'customer';
  token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: string;
  user: StaffUserInfo | PortalUserInfo;
  requires_two_factor?: boolean;
  pending_token?: string;
}

export class ApiError extends Error {
  status: number;
  body: any;

  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Unified login used by BOTH portals (admin.primeerp.com and portal.primeerp.com).
 * The backend authenticates the account and returns its role ('admin' | 'customer').
 * Wrong-portal attempts are rejected with a 403 and a friendly message.
 */
export async function loginWithApi(payload: {
  email: string;
  password: string;
  portal: 'admin' | 'customer';
  two_factor_code?: string;
}): Promise<UnifiedLoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      body.message || body.error || `Login failed (${response.status})`,
      response.status,
      body
    );
  }

  return body as UnifiedLoginResponse;
}
