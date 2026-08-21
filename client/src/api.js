async function request(path, options = {}) {
  // Let the browser set its own multipart boundary for FormData bodies.
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: options.body && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData }),
};
