export const TOKEN_KEY = "thinkingHatToken";

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || null;
  }
}

let onUnauthorized = () => {};

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = "GET", body, cache } = {}) {
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
    response = await fetch(path, { method, headers, body: payload, cache });
  } catch {
    throw new ApiError("Cannot reach Thinking Hat. Start the server and try again.", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register")) {
    onUnauthorized();
  }
  if (!response.ok) throw new ApiError(data.error || "Something went wrong.", response.status, data);
  return data;
}

function photoBody(file) {
  const body = new FormData();
  body.append("photo", file);
  return body;
}

export async function downloadAuthorized(path, filename) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(path, { headers });
  } catch {
    throw new ApiError("Cannot reach Thinking Hat. Start the server and try again.", 0);
  }
  if (response.status === 401) onUnauthorized();
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || "Could not download the report.", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const api = {
  login: (body) => request("/api/auth/login", { method: "POST", body }),
  register: (body) => request("/api/auth/register", { method: "POST", body }),
  me: () => request("/api/auth/me"),
  updateMe: (body) => request("/api/me", { method: "PATCH", body }),
  uploadPhoto: (file) => request("/api/me/photo", { method: "POST", body: photoBody(file) }),
  finances: () => request("/api/me/finances"),
  insights: () => request(`/api/me/insights?cb=${Date.now()}`, { cache: "no-store" }),
  reports: () => request("/api/me/reports"),
  report: (month) => request(`/api/me/reports/${month}`),
  userReport: (id, month) => request(`/api/admin/users/${id}/reports/${month}`),
  adminReports: () => request("/api/admin/reports"),
  uploadReport: (userId, month, file, replace) => {
    const body = new FormData();
    body.append("userId", String(userId));
    body.append("month", month);
    body.append("file", file);
    if (replace) body.append("replace", "1");
    return request("/api/admin/reports", { method: "POST", body });
  },
  deleteReport: (userId, month) => request(`/api/admin/users/${userId}/reports/${month}`, { method: "DELETE" }),
  invoices: () => request("/api/me/invoices"),
  requests: () => request("/api/me/requests"),
  createRequest: (body) => request("/api/me/requests", { method: "POST", body }),
  users: () => request("/api/admin/users"),
  user: (id) => request(`/api/admin/users/${id}`),
  updateUser: (id, body) => request(`/api/admin/users/${id}`, { method: "PATCH", body }),
  assignUserTemplate: (id, templateId) => request(`/api/admin/users/${id}/template`, { method: "PATCH", body: { templateId } }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: "DELETE" }),
  uploadUserPhoto: (id, file) => request(`/api/admin/users/${id}/photo`, { method: "POST", body: photoBody(file) }),
  saveFinances: (id, body) => request(`/api/admin/users/${id}/finances`, { method: "PUT", body }),
  addInvoice: (id, body) => request(`/api/admin/users/${id}/invoices`, { method: "POST", body }),
  updateInvoice: (id, body) => request(`/api/admin/invoices/${id}`, { method: "PATCH", body }),
  deleteInvoice: (id) => request(`/api/admin/invoices/${id}`, { method: "DELETE" }),
  templates: () => request("/api/admin/templates"),
  renameTemplate: (id, body) => request(`/api/admin/templates/${id}`, { method: "PATCH", body }),
  deleteTemplate: (id) => request(`/api/admin/templates/${id}`, { method: "DELETE" }),
  downloadTemplate: (id, format, filename) => downloadAuthorized(
    `/api/admin/templates/${id}/file?format=${format === "csv" ? "csv" : "text"}`,
    filename,
  ),
  uploadTemplate: (file) => {
    const body = new FormData();
    body.append("file", file);
    return request("/api/admin/templates/upload", { method: "POST", body });
  },
  templateBuilder: () => request("/api/admin/template-builder"),
  createGrokBot: (body) => request("/api/admin/grok-bots", { method: "POST", body }),
  updateGrokBot: (id, body) => request(`/api/admin/grok-bots/${id}`, { method: "PATCH", body }),
  deleteGrokBot: (id) => request(`/api/admin/grok-bots/${id}`, { method: "DELETE" }),
  assignBuilderBot: (clientId, botId) => request(
    `/api/admin/template-builder/clients/${clientId}/bot`,
    { method: "PATCH", body: { botId } },
  ),
  templateBuilderTemplate: (clientId, templateId) => request(`/api/admin/template-builder/clients/${clientId}/templates/${templateId}`),
  createBuilderClient: (body) => request("/api/admin/template-builder/clients", { method: "POST", body }),
  deleteBuilderClient: (clientId) => request(`/api/admin/template-builder/clients/${clientId}`, { method: "DELETE" }),
  createBuilderTemplate: (clientId, body) => request(`/api/admin/template-builder/clients/${clientId}/templates`, { method: "POST", body }),
  copyBuilderTemplate: (clientId, sourceId) => request(`/api/admin/template-builder/clients/${clientId}/templates/copy`, { method: "POST", body: { sourceId } }),
  importBuilderTemplate: (clientId, file) => {
    const body = new FormData();
    body.append("file", file);
    return request(`/api/admin/template-builder/clients/${clientId}/templates/import`, { method: "POST", body });
  },
  saveTemplateSections: (clientId, templateId, body) => request(
    `/api/admin/template-builder/clients/${clientId}/templates/${templateId}/sections`,
    { method: "POST", body },
  ),
  previewTemplateExcel: (clientId, templateId, file) => {
    const body = new FormData();
    body.append("file", file);
    return request(`/api/admin/template-builder/clients/${clientId}/templates/${templateId}/excel`, { method: "POST", body });
  },
  importTemplateExcel: (clientId, templateId, file, mapping) => {
    const body = new FormData();
    body.append("file", file);
    body.append("mapping", JSON.stringify(mapping));
    return request(`/api/admin/template-builder/clients/${clientId}/templates/${templateId}/excel`, { method: "POST", body });
  },
  renameBuilderTemplate: (clientId, templateId, name) => request(
    `/api/admin/template-builder/clients/${clientId}/templates/${templateId}`,
    { method: "PATCH", body: { name } },
  ),
  builderTemplateUsage: (clientId, templateId) => request(
    `/api/admin/template-builder/clients/${clientId}/templates/${templateId}/usage`,
  ),
  archiveBuilderTemplate: (clientId, templateId) => request(
    `/api/admin/template-builder/clients/${clientId}/templates/${templateId}`,
    { method: "DELETE" },
  ),
  mailStatus: () => request("/api/admin/mail"),
  invites: () => request("/api/admin/invites"),
  createInvite: (body) => request("/api/admin/invites", { method: "POST", body }),
  resendInvite: (id) => request(`/api/admin/invites/${id}/resend`, { method: "POST" }),
  revokeInvite: (id) => request(`/api/admin/invites/${id}/revoke`, { method: "POST" }),
  adminRequests: () => request("/api/admin/requests"),
  updateRequest: (id, body) => request(`/api/admin/requests/${id}`, { method: "PATCH", body }),
};
