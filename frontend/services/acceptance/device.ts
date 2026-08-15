// Stable per-browser device identity for the acceptance framework.

const DEVICE_ID_KEY = 'prime_erp_acceptance_device_id';
const DEVICE_LABEL_KEY = 'prime_erp_acceptance_device_label';

function generateDeviceId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `dev-${Date.now().toString(36)}-${rand}`;
}

function detectLabel(): string {
  const ua = navigator.userAgent;
  let browser = 'Unknown Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';
  let os = 'Unknown OS';
  if (navigator.platform.includes('Win')) os = 'Windows';
  else if (navigator.platform.includes('Mac')) os = 'macOS';
  else if (navigator.platform.includes('Linux')) os = 'Linux';
  else if (navigator.platform.includes('Android')) os = 'Android';
  else if (navigator.platform.includes('iPhone') || navigator.platform.includes('iPad')) os = 'iOS';
  return `${browser} on ${os}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceLabel(): string {
  let label = localStorage.getItem(DEVICE_LABEL_KEY);
  if (!label) {
    label = detectLabel();
    localStorage.setItem(DEVICE_LABEL_KEY, label);
  }
  return label;
}
