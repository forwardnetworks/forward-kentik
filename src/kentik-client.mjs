const trimTrailingSlash = (value) => value.replace(/\/+$/, "");
const TRANSIENT_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;

export class KentikClient {
  constructor({ apiUrl, email, token, fetchImpl = globalThis.fetch, maxRetries = DEFAULT_MAX_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS }) {
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
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
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
    return this.requestJson("GET", path);
  }

  async postJson(path, body) {
    return this.requestJson("POST", path, body);
  }

  async requestJson(method, path, body) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response;
      try {
        response = await this.fetch(`${this.apiUrl}${path}`, {
          method,
          headers: this.authHeaders(),
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (attempt < this.maxRetries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw new Error(`Kentik API ${method} ${path} failed: ${error.message}`, { cause: error });
      }

      const text = await response.text();
      const parsed = parseJsonResponse(text);
      if (response.ok) {
        return parsed;
      }

      if (TRANSIENT_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
        await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
        continue;
      }

      const message = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      throw new Error(`Kentik API ${response.status}: ${message.slice(0, 500)}`);
    }

    throw new Error(`Kentik API ${method} ${path} failed after retry budget was exhausted.`);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryDelayMs = (attempt, retryAfter) => {
  if (retryAfter) {
    const parsed = Number.parseFloat(retryAfter);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed * 1000;
    }
  }
  return Math.min(250 * 2 ** attempt, 4000);
};

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
