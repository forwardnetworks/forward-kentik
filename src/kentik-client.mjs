const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

export class KentikClient {
  constructor({ apiUrl, email, token, fetchImpl = globalThis.fetch }) {
    if (!apiUrl) {
      throw new Error("apiUrl is required");
    }
    if (!fetchImpl) {
      throw new Error("fetch is required");
    }
    this.apiUrl = trimTrailingSlash(apiUrl);
    this.email = email;
    this.token = token;
    this.fetch = fetchImpl;
  }

  async queryTopXData(query) {
    return this.postJson("/api/v5/query/topXdata", query);
  }

  async listDevices() {
    const response = await this.getJson("/api/v5/devices");
    if (Array.isArray(response)) {
      return response;
    }
    if (Array.isArray(response?.devices)) {
      return response.devices;
    }
    return [];
  }

  async getJson(path) {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      method: "GET",
      headers: this.authHeaders(),
    });

    const text = await response.text();
    const parsed = parseJsonResponse(text);
    if (!response.ok) {
      const message = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      throw new Error(`Kentik API ${response.status}: ${message.slice(0, 500)}`);
    }
    return parsed;
  }

  async postJson(path, body) {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const parsed = parseJsonResponse(text);
    if (!response.ok) {
      const message = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      throw new Error(`Kentik API ${response.status}: ${message.slice(0, 500)}`);
    }
    return parsed;
  }

  authHeaders() {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-CH-Auth-Email": this.email,
      "X-CH-Auth-API-Token": this.token,
    };
  }
}

const parseJsonResponse = (text) => {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
