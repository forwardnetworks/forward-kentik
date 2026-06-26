import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_TOKEN_FILE = "~/kentik.token";
const DEFAULT_API_URL = "https://api.kentik.com";
const DEFAULT_PORTAL_URL = "https://portal.kentik.com";

export const expandHome = (value) => {
  if (!value) {
    return value;
  }
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
};

export const readKentikToken = async (tokenFile = process.env.KENTIK_TOKEN_FILE || DEFAULT_TOKEN_FILE) => {
  const { token } = await readKentikAuthFile(tokenFile);
  if (!token) {
    throw new Error(`Kentik token file is empty: ${tokenFile}`);
  }
  return token;
};

export const parseKentikTokenFile = (content) => {
  const trimmed = content.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    return {
      email: parsed.email || parsed.user || parsed.username,
      token: parsed.token || parsed.apiToken || parsed.api_token,
      portalPassword: parsed.password || parsed.portalPassword || parsed.portal_password,
      apiUrl: parsed.apiUrl || parsed.api_url,
      portalUrl: parsed.portalUrl || parsed.portal_url,
    };
  }

  const envEntries = Object.fromEntries(
    trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
  if (Object.keys(envEntries).length > 0) {
    return {
      email: envEntries.KENTIK_EMAIL || envEntries.EMAIL,
      token: envEntries.KENTIK_TOKEN || envEntries.KENTIK_API_TOKEN || envEntries.TOKEN,
      portalPassword:
        envEntries.KENTIK_PORTAL_PASSWORD || envEntries.KENTIK_PASSWORD || envEntries.PASSWORD,
      apiUrl: envEntries.KENTIK_API_URL,
      portalUrl: envEntries.KENTIK_PORTAL_URL,
    };
  }

  const parts = trimmed
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 1 && parts[0].includes(":") && parts[0].includes("@")) {
    const [email, token] = parts[0].split(":", 2);
    return { email, token };
  }

  const email = parts.find((part) => part.includes("@"));
  const token = parts.find((part) => !part.includes("@") && /^[A-Za-z0-9_-]{20,}$/.test(part));
  const apiUrl = parts.find((part) => /^https:\/\/api\.kentik\./.test(part));
  const portalUrl = parts.find((part) => /^https:\/\/portal\.kentik\./.test(part));
  const portalPassword = [...parts]
    .reverse()
    .find(
      (part) =>
        part !== email &&
        part !== token &&
        part !== apiUrl &&
        part !== portalUrl &&
        !part.includes("@"),
    );

  return {
    email,
    token,
    portalPassword,
    apiUrl,
    portalUrl,
  };
};

export const readKentikAuthFile = async (tokenFile = process.env.KENTIK_TOKEN_FILE || DEFAULT_TOKEN_FILE) => {
  const tokenPath = expandHome(tokenFile);
  const parsed = parseKentikTokenFile(await readFile(tokenPath, "utf8"));
  if (!parsed.token) {
    throw new Error(`Kentik token file does not contain a token: ${tokenFile}`);
  }
  return parsed;
};

export const kentikConfigFromEnv = async () => {
  const fileAuth = process.env.KENTIK_TOKEN ? {} : await readKentikAuthFile();
  return {
    apiUrl: process.env.KENTIK_API_URL || fileAuth.apiUrl || DEFAULT_API_URL,
    portalUrl: process.env.KENTIK_PORTAL_URL || fileAuth.portalUrl || DEFAULT_PORTAL_URL,
    email: process.env.KENTIK_EMAIL || fileAuth.email || "",
    token: process.env.KENTIK_TOKEN || fileAuth.token,
  };
};

export const requireKentikAuth = (config) => {
  const missing = [];
  if (!config.email) {
    missing.push("KENTIK_EMAIL");
  }
  if (!config.token) {
    missing.push("KENTIK_TOKEN or KENTIK_TOKEN_FILE");
  }
  if (missing.length > 0) {
    throw new Error(`Missing Kentik auth: ${missing.join(", ")}`);
  }
};

export const kentikPortalConfigFromEnv = async () => {
  const fileAuth = await readKentikAuthFile();
  return {
    portalUrl: process.env.KENTIK_PORTAL_URL || fileAuth.portalUrl || DEFAULT_PORTAL_URL,
    email: process.env.KENTIK_EMAIL || fileAuth.email || "",
    password:
      process.env.KENTIK_PORTAL_PASSWORD ||
      process.env.KENTIK_PASSWORD ||
      fileAuth.portalPassword ||
      "",
  };
};

export const requireKentikPortalAuth = (config) => {
  const missing = [];
  if (!config.email) {
    missing.push("KENTIK_EMAIL");
  }
  if (!config.password) {
    missing.push("KENTIK_PORTAL_PASSWORD");
  }
  if (missing.length > 0) {
    throw new Error(`Missing Kentik portal auth: ${missing.join(", ")}`);
  }
};
