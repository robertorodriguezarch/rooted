export class ApiError extends Error {
  constructor(message, status = 0, code = 'request_failed') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, options = {}, accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), 20_000);
  const forwardAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  const headers = { Accept: 'application/json', ...options.headers };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(path, { ...options, body, headers, signal: controller.signal, credentials: 'omit' });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error?.message || 'We couldn’t complete that request. Please try again.', response.status, data?.error?.code);
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? 'The request took too long. Please try again.' : 'We couldn’t reach Rooted. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}
