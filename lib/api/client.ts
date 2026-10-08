export class ApiError extends Error {
  constructor(public status: number, public message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

function getApiBaseUrl(): string {
  // 1. Server-side runtime (Next.js SSR / Server Actions / Route Handlers):
  // Use Vercel internal service binding if injected
  if (typeof window === 'undefined' && process.env.API_URL) {
    const internalUrl = process.env.API_URL.replace(/\/$/, '');
    return internalUrl.endsWith('/api/v1') ? internalUrl : `${internalUrl}/api/v1`;
  }

  // 2. Explicit public URL if configured
  if (process.env.NEXT_PUBLIC_API_URL) {
    const publicUrl = process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
    return publicUrl.endsWith('/api/v1') ? publicUrl : `${publicUrl}/api/v1`;
  }

  // 3. Client-side on Vercel (same-origin relative URL routed via top-level rewrite)
  if (typeof window !== 'undefined') {
    return '/api/v1';
  }

  // 4. Fallback for local server-side dev
  return 'http://localhost:4000/api/v1';
}

function buildApiUrl(endpoint: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const cleanEndpoint = endpoint.replace(/^\//, '');

  if (cleanEndpoint.startsWith('api/v1/')) {
    const rootOrigin = base.replace(/\/api\/v1$/, '');
    return `${rootOrigin}/${cleanEndpoint}`;
  }

  return `${base}/${cleanEndpoint}`;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = buildApiUrl(endpoint);

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Sends httpOnly cookies
  };

  try {
    const response = await fetch(url, config);

    if (response.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'Unauthorized session');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message = errorData?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new ApiError(response.status, message, errorData);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(500, err.message || 'Network error occurred');
  }
}
