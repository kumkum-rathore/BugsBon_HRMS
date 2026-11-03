
const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

let accessToken = null;
let restorePromise = null;
let refreshPromise = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

// Parse API response safely
async function parseResponse(response) {
  return response.json().catch(() => ({
    success: false,
    message: 'Server returned an unreadable response.'
  }));
}

// Create API error
function createApiError(result, status) {
  const error = new Error(result.message || 'Request failed.');

  error.status = status;
  error.code = result.error?.code;
  error.details = result.error?.details || [];

  return error;
}

// Check if response is successful
async function handleResponse(response) {
  const result = await parseResponse(response);

  if (!response.ok || result.success === false) {
    throw createApiError(result, response.status);
  }

  return result;
}

// Get request headers
function getHeaders(options = {}) {
  const isFormData =
    typeof FormData !== 'undefined' &&
    options.body instanceof FormData;

  return {
    ...(options.body && !isFormData
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {}),
    ...(options.headers || {})
  };
}

/**
 * Automatically refresh Access Token.
 *
 * Multiple API requests share the same refresh request.
 */
export async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}),
        credentials: 'include'
      });

      const result = await parseResponse(response);

      if (!response.ok || result.success === false) {
        throw createApiError(result, response.status);
      }

      const newToken = result.data?.accessToken;

      if (!newToken) {
        throw new Error('New access token was not received.');
      }

      setAccessToken(newToken);

      return result.data;
    } catch (error) {
      setAccessToken(null);
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Fetch with automatic token refresh.
 */
async function fetchWithAuth(path, options = {}) {
  const url = path.startsWith('http')
    ? path
    : `${API_URL}${path}`;

  const isAuthEndpoint =
    path.includes('/auth/login') ||
    path.includes('/auth/refresh') ||
    path.includes('/auth/logout');

  const makeRequest = () =>
    fetch(url, {
      ...options,
      headers: getHeaders(options),
      credentials: 'include'
    });

  let response = await makeRequest();

  // Do not refresh for login, refresh or logout requests.
  if (response.status !== 401 || isAuthEndpoint) {
    return response;
  }

  // Access Token expired.
  // Refresh Token will be used automatically.
  try {
    await refreshAccessToken();
  } catch (error) {
    // Refresh failed. Session is no longer valid.
    throw error;
  }

  // Retry original API with new Access Token.
  response = await makeRequest();

  return response;
}

/**
 * Main API function.
 */
export async function api(path, options = {}) {
  const response = await fetchWithAuth(path, options);

  return handleResponse(response);
}

/**
 * Login
 */
export async function login(email, password) {
  const result = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password
    })
  });

  setAccessToken(result.data.accessToken);

  return result.data;
}

/**
 * Restore session when app loads.
 */
export async function restoreSession() {
  if (restorePromise) {
    return restorePromise;
  }

  restorePromise = (async () => {
    try {
      return await refreshAccessToken();
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      restorePromise = null;
    }
  })();

  return restorePromise;
}

/**
 * Logout
 */
export async function logout() {
  try {
    await api('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    });
  } finally {
    setAccessToken(null);
  }
}

/**
 * Download private file.
 */
export async function downloadFile(
  path,
  filename = 'download'
) {
  const response = await fetchWithAuth(path);

  if (!response.ok) {
    const data = await parseResponse(response);

    throw new Error(
      data.message || 'File download failed.'
    );
  }

  const blob = await response.blob();

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    60_000
  );
}

/**
 * Fetch private file as Blob for preview.
 */
export async function fetchFileBlob(path) {
  const response = await fetchWithAuth(path);

  if (!response.ok) {
    const data = await parseResponse(response);

    throw new Error(
      data.message || 'File preview failed.'
    );
  }

  return response.blob();
}
