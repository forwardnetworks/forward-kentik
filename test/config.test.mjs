import assert from "node:assert/strict";
import test from "node:test";
import { kentikPortalConfigFromEnv, parseKentikTokenFile } from "../src/config.mjs";

test("parses token email and portal password lines", () => {
  const parsed = parseKentikTokenFile("abc123abc123abc123abc123abc123ab\n\nuser@example.com\nsecret-password\n");
  assert.equal(parsed.token, "abc123abc123abc123abc123abc123ab");
  assert.equal(parsed.email, "user@example.com");
  assert.equal(parsed.portalPassword, "secret-password");
});

test("parses env-style auth file", () => {
  const parsed = parseKentikTokenFile("EMAIL=user@example.com\nTOKEN=abc123abc123abc123abc123abc123ab\nPASSWORD=secret\n");
  assert.equal(parsed.token, "abc123abc123abc123abc123abc123ab");
  assert.equal(parsed.email, "user@example.com");
  assert.equal(parsed.portalPassword, "secret");
});

test("builds Kentik portal auth from environment without local token file", async () => {
  const originalEmail = process.env.KENTIK_EMAIL;
  const originalPassword = process.env.KENTIK_PORTAL_PASSWORD;
  try {
    process.env.KENTIK_EMAIL = "user@example.com";
    process.env.KENTIK_PORTAL_PASSWORD = "secret";
    const config = await kentikPortalConfigFromEnv();
    assert.equal(config.email, "user@example.com");
    assert.equal(config.password, "secret");
  } finally {
    setOptionalEnv("KENTIK_EMAIL", originalEmail);
    setOptionalEnv("KENTIK_PORTAL_PASSWORD", originalPassword);
  }
});

const setOptionalEnv = (key, value) => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};
