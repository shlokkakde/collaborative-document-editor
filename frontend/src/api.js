export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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
  const apiUrl = new URL(API_BASE_URL);
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = `/ws/documents/${documentId}/`;
  apiUrl.search = new URLSearchParams({ clientId, name }).toString();
  return apiUrl.toString();
}
