import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { extractKentikRows, flowEligibility, normalizeKentikPayload, normalizeProtocol } from "../src/normalize.mjs";

test("extracts rows from Kentik results data", async () => {
  const payload = JSON.parse(await readFile("fixtures/kentik-topxdata.demo.json", "utf8"));
  const rows = extractKentikRows(payload);
  assert.equal(rows.length, 4);
});

test("normalizes Kentik rows into observed flows", async () => {
  const payload = JSON.parse(await readFile("fixtures/kentik-topxdata.demo.json", "utf8"));
  const flows = normalizeKentikPayload(payload);
  assert.equal(flows[0].srcIp, "10.20.10.15");
  assert.equal(flows[0].dstIp, "172.16.40.20");
  assert.equal(flows[0].protocol, "tcp");
  assert.equal(flows[0].dstPort, 443);
  assert.equal(flows[0].confidence, "high");
});

test("detects missing destination port for tcp and udp", async () => {
  const payload = JSON.parse(await readFile("fixtures/kentik-topxdata.demo.json", "utf8"));
  const flows = normalizeKentikPayload(payload);
  const eligibility = flowEligibility(flows[3]);
  assert.equal(eligibility.eligible, false);
  assert.deepEqual(eligibility.reasons, ["missing destination port"]);
});

test("normalizes protocol names and numbers", () => {
  assert.equal(normalizeProtocol("6"), "tcp");
  assert.equal(normalizeProtocol("17"), "udp");
  assert.equal(normalizeProtocol("TCP"), "tcp");
  assert.equal(normalizeProtocol("99"), "other");
});
