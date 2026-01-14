/**
 * Fetch wrapper with retry logic, timeout support, and proper error handling.
 * Replaces raw fetch() calls throughout the codebase for improved reliability.
 */

export interface FetchWithRetryOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Use exponential backoff for retries (default: true) */
  exponentialBackoff?: boolean;
  /** Skip retry for specific HTTP status codes */
  noRetryStatuses?: number[];
}

export interface FetchResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  retryCount?: number;
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors are retryable
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }
    // Don't retry aborts (timeouts)
    if (error.name === 'AbortError') {
      return false;
    }
  }
  return true;
}

/**
 * Determines if an HTTP status code is retryable
 */
function isRetryableStatus(status: number, noRetryStatuses: number[] = []): boolean {
  // Don't retry if explicitly excluded
  if (noRetryStatuses.includes(status)) {
    return false;
  }
  // Retry on server errors and rate limits
  return status >= 500 || status === 429 || status === 408;
}

/**
 * Fetch with automatic retry, timeout, and error handling
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<FetchResult<T>> {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    exponentialBackoff = true,
    noRetryStatuses = [400, 401, 403, 404],
    ...fetchOptions
  } = options;

  let lastError: string = 'Unknown error';
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      lastStatus = response.status;

      // Check if response is OK
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Failed to read error response');
        lastError = `HTTP ${response.status}: ${errorText.slice(0, 200)}`;

        // Check if we should retry this status
        if (isRetryableStatus(response.status, noRetryStatuses) && attempt < retries - 1) {
          const delay = exponentialBackoff
            ? retryDelay * Math.pow(2, attempt)
            : retryDelay;
          console.warn(`[fetchWithRetry] Retry ${attempt + 1}/${retries} for ${url} after ${response.status}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        return {
          success: false,
          error: lastError,
          status: response.status,
          retryCount: attempt,
        };
      }

      // Parse JSON response
      const data = await response.json() as T;
      return {
        success: true,
        data,
        status: response.status,
        retryCount: attempt,
      };

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = `Request timeout after ${timeout}ms`;
          // Don't retry timeouts - they indicate the service is slow
          return {
            success: false,
            error: lastError,
            retryCount: attempt,
          };
        }
        lastError = error.message;
      } else {
        lastError = String(error);
      }

      // Check if we should retry
      if (isRetryableError(error) && attempt < retries - 1) {
        const delay = exponentialBackoff
          ? retryDelay * Math.pow(2, attempt)
          : retryDelay;
        console.warn(`[fetchWithRetry] Retry ${attempt + 1}/${retries} for ${url}: ${lastError}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  return {
    success: false,
    error: lastError,
    status: lastStatus,
    retryCount: retries - 1,
  };
}

/**
 * Convenience wrapper for POST requests with JSON body
 */
export async function postWithRetry<T = unknown, B = unknown>(
  url: string,
  body: B,
  options: Omit<FetchWithRetryOptions, 'method' | 'body'> = {}
): Promise<FetchResult<T>> {
  return fetchWithRetry<T>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Convenience wrapper for GET requests
 */
export async function getWithRetry<T = unknown>(
  url: string,
  options: Omit<FetchWithRetryOptions, 'method' | 'body'> = {}
): Promise<FetchResult<T>> {
  return fetchWithRetry<T>(url, {
    ...options,
    method: 'GET',
  });
}
