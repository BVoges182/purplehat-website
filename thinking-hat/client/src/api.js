export const TOKEN_KEY = "thinkingHatToken";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError("Cannot reach Thinking Hat. Start the server and try again.", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register")) {
    onUnauthorized();
  }
  if (!response.ok) throw new ApiError(data.error || "Something went wrong.", response.status);
  return data;
}

function photoBody(file) {
  const body = new FormData();
  body.append("photo", file);
  return body;
}

export const api = {
  login: (body) => request("/api/auth/login", { method: "POST", body }),
  register: (body) => request("/api/auth/register", { method: "POST", body }),
  me: () => request("/api/auth/me"),
  updateMe: (body) => request("/api/me", { method: "PATCH", body }),
  uploadPhoto: (file) => request("/api/me/photo", { method: "POST", body: photoBody(file) }),
  finances: () => request("/api/me/finances"),
  invoices: () => request("/api/me/invoices"),
  requests: () => request("/api/me/requests"),
  createRequest: (body) => request("/api/me/requests", { method: "POST", body }),
  users: () => request("/api/admin/users"),
  user: (id) => request(`/api/admin/users/${id}`),
  updateUser: (id, body) => request(`/api/admin/users/${id}`, { method: "PATCH", body }),
  uploadUserPhoto: (id, file) => request(`/api/admin/users/${id}/photo`, { method: "POST", body: photoBody(file) }),
  saveFinances: (id, body) => request(`/api/admin/users/${id}/finances`, { method: "PUT", body }),
  addInvoice: (id, body) => request(`/api/admin/users/${id}/invoices`, { method: "POST", body }),
  updateInvoice: (id, body) => request(`/api/admin/invoices/${id}`, { method: "PATCH", body }),
  invites: () => request("/api/admin/invites"),
  createInvite: (body) => request("/api/admin/invites", { method: "POST", body }),
  revokeInvite: (id) => request(`/api/admin/invites/${id}/revoke`, { method: "POST" }),
  adminRequests: () => request("/api/admin/requests"),
  updateRequest: (id, body) => request(`/api/admin/requests/${id}`, { method: "PATCH", body }),
};
