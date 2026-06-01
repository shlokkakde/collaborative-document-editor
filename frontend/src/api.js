const isLocalDevelopment =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

function withoutTrailingSlash(value) {
  return value ? value.replace(/\/$/, "") : "";
}

export const API_BASE_URL = withoutTrailingSlash(
  import.meta.env.VITE_API_BASE_URL ||
    (isLocalDevelopment ? "http://localhost:8000" : ""),
);

export const WS_BASE_URL = withoutTrailingSlash(
  import.meta.env.VITE_WS_BASE_URL || API_BASE_URL || window.location.origin,
);

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

export function listDocuments() {
  return request("/api/documents/");
}

export function createDocument(payload) {
  return request("/api/documents/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getDocument(documentId) {
  return request(`/api/documents/${documentId}/`);
}

export function updateDocument(documentId, payload) {
  return request(`/api/documents/${documentId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteDocument(documentId) {
  return request(`/api/documents/${documentId}/`, {
    method: "DELETE",
  });
}

export function websocketUrl(documentId, clientId, name) {
  const wsUrl = new URL(WS_BASE_URL);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.pathname = `/ws/documents/${documentId}/`;
  wsUrl.search = new URLSearchParams({ clientId, name }).toString();
  return wsUrl.toString();
}
