import assert from "node:assert/strict";
import test from "node:test";
import { parseKentikTokenFile } from "../src/config.mjs";

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
