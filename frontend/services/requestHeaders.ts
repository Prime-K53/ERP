import { ensureSessionAuthState, getStoredUserSession } from './authSession';

type HeaderMap = Record<string, string>;

const applyIdentityHeaders = (headers: HeaderMap): HeaderMap => {
  const authState = ensureSessionAuthState();
  const nextHeaders = { ...headers };

  if (authState.accessToken) {
    nextHeaders.Authorization = `Bearer ${authState.accessToken}`;
  }
  nextHeaders['x-auth-mode'] = authState.authMode;

  if (typeof sessionStorage === 'undefined') {
    return nextHeaders;
  }

  const user = getStoredUserSession();
  if (!user) {
    return nextHeaders;
  }

  if (user?.id) nextHeaders['x-user-id'] = String(user.id);
  if (user?.role) nextHeaders['x-user-role'] = String(user.role);
  if (user?.email) nextHeaders['x-user-email'] = String(user.email);
  nextHeaders['x-user-is-super-admin'] = user?.isSuperAdmin === true ? 'true' : 'false';

  return nextHeaders;
};

export const getRequestIdentityHeaders = (headers: HeaderMap = {}): HeaderMap =>
  applyIdentityHeaders(headers);

export const getJsonRequestHeaders = (headers: HeaderMap = {}): HeaderMap =>
  applyIdentityHeaders({
    'Content-Type': 'application/json',
    ...headers,
  });
