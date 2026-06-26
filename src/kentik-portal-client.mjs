const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  store(response) {
    const setCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")]
        : [];
    for (const cookie of setCookies) {
      const [first] = cookie.split(";");
      const separator = first.indexOf("=");
      if (separator > 0) {
        this.cookies.set(first.slice(0, separator), first.slice(separator + 1));
      }
    }
  }
}

export class KentikPortalClient {
  constructor({ portalUrl, email, password, fetchImpl = globalThis.fetch }) {
    if (!portalUrl) {
      throw new Error("portalUrl is required");
    }
    if (!fetchImpl) {
      throw new Error("fetch is required");
    }
    this.portalUrl = trimTrailingSlash(portalUrl);
    this.email = email;
    this.password = password;
    this.fetch = fetchImpl;
    this.cookies = new CookieJar();
  }

  async login() {
    const loginPage = await this.fetch(`${this.portalUrl}/login`, {
      headers: this.headers("text/html"),
    });
    this.cookies.store(loginPage);
    const html = await loginPage.text();
    if (!loginPage.ok) {
      throw new Error(`Kentik portal login page failed: ${loginPage.status}`);
    }

    const csrfToken = extractCsrfToken(html);
    const response = await this.fetch(`${this.portalUrl}/api/ui/login`, {
      method: "POST",
      headers: {
        ...this.headers("application/json"),
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        user_email: this.email,
        password: this.password,
        "g-recaptcha-response": "",
        noRedirect: true,
      }),
    });
    this.cookies.store(response);
    const body = await parseBody(response);
    if (!response.ok) {
      throw new Error(`Kentik portal login failed: ${response.status}`);
    }
    return body;
  }

  async getJson(path) {
    const response = await this.fetch(`${this.portalUrl}${path}`, {
      headers: this.headers("application/json"),
    });
    this.cookies.store(response);
    const body = await parseBody(response);
    if (!response.ok) {
      throw new Error(`Kentik portal ${path} failed: ${response.status}`);
    }
    return body;
  }

  async fetchDemoCatalog() {
    const [dashboards, savedViews] = await Promise.all([
      this.getJson("/api/ui/dashboards"),
      this.getJson("/api/ui/saved-views"),
    ]);
    return {
      dashboards: Array.isArray(dashboards) ? dashboards : [],
      savedViews: Array.isArray(savedViews) ? savedViews : [],
    };
  }

  headers(accept) {
    return {
      "Accept": accept,
      "Cookie": this.cookies.header(),
    };
  }
}

const extractCsrfToken = (html) => {
  const match =
    html.match(/name="_token" content="([^"]+)"/) ||
    html.match(/name="csrf-token" content="([^"]+)"/);
  if (!match) {
    throw new Error("Could not find Kentik portal CSRF token");
  }
  return match[1];
};

const parseBody = async (response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
