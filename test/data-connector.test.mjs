import assert from "node:assert/strict";
import test from "node:test";
import { buildForwardDataConnectorConfig } from "../src/data-connector.mjs";

test("builds Forward Data Connector config", () => {
  const config = buildForwardDataConnectorConfig({
    baseUrl: "https://example.com/forward-kentik/latest/",
  });
  assert.equal(config.name, "forward-kentik-observed-flows");
  assert.equal(config.baseUrl, "https://example.com/forward-kentik/latest");
  assert.equal(config.collect, false);
  assert.deepEqual(
    config.endpoints.map((endpoint) => endpoint.name),
    ["observed-flows", "forward-kentik-report", "forward-kentik-manifest"],
  );
});
