export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = localStorage.getItem('incidenthub_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${import.meta.env.VITE_API_URL || ''}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const detail = payload?.error?.details?.[0]?.message;
    const error = new Error(detail || payload?.error?.message || 'Request failed');
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}
