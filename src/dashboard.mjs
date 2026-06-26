const STATUS = {
  ready: "Ready",
  review: "Review",
};

export const buildDashboardHtml = ({ flows, checks, manifest, report, importReport = null }) => {
  const rows = dashboardRows(flows, checks);
  const mapped = report.locationMapping || { bothMapped: 0, fromMapped: 0, toMapped: 0 };
  const createCount = importReport?.counts?.create ?? checks.length;
  const unchangedCount = importReport?.counts?.unchanged ?? 0;
  const changedCount = importReport?.counts?.changed ?? 0;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Forward Kentik Dashboard</title>
  <style>${css()}</style>
</head>
<body>
  <header class="topbar">
    <div class="brand">FORW<span>↗</span>RD</div>
    <div class="select">Forward Kentik</div>
    <div class="timestamp">${escapeHtml(formatTimestamp(manifest.generatedAt))}</div>
    <div class="user">Field integration</div>
  </header>
  <aside class="sidebar">
    <div class="nav-section">Snapshot</div>
    ${navItem("Search")}
    ${navItem("Network Maps")}
    ${navItem("Inventory")}
    <div class="nav-section">Verify</div>
    ${navItem("NQE")}
    ${navItem("Predefined")}
    ${navItem("Intent", true)}
    ${navItem("Advanced")}
    <div class="nav-section">Network</div>
    ${navItem("Dashboard")}
  </aside>
  <main class="content">
    <section class="title-row">
      <div>
        <h1>Kentik Intent Candidate Correlation</h1>
        <p>Observed flow evidence mapped to modeled Forward locations before check import.</p>
      </div>
      <div class="actions">
        <a class="button secondary" href="../forward-intent-checks.json" download>Export package</a>
        <button class="button secondary" data-action="dry-run">Dry run</button>
        <button class="button primary" data-action="push">Push into Forward</button>
      </div>
    </section>
    <section class="correlation">
      ${metricBlock("KENTIK", "Observed flows", report.observedFlows, "source, destination, protocol, port, volume")}
      ${arrow()}
      ${metricBlock("FORWARD", "Modeled correlation", mapped.bothMapped, `${mapped.fromMapped} source and ${mapped.toMapped} destination mappings`)}
      ${arrow()}
      ${metricBlock("INTENT CHECKS", "Ready to create", checks.length, `${createCount} create, ${unchangedCount} unchanged, ${changedCount} changed`)}
    </section>
    <section class="report-head">
      <h2>Candidate checks</h2>
      <div class="report-meta">${rows.filter((row) => row.status === STATUS.ready).length} ready checks</div>
    </section>
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Application</th>
            <th>Kentik flow</th>
            <th>Forward source</th>
            <th>Forward destination</th>
            <th>Service</th>
            <th>Traffic</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(rowHtml).join("")}
        </tbody>
      </table>
    </section>
    <section class="output" id="output">No Forward action has run in this dashboard session.</section>
  </main>
  <script>${clientScript()}</script>
</body>
</html>
`;
};

export const dashboardRows = (flows, checks) => {
  const eligibleFlows = flows.filter((flow) => flow.protocol && flow.dstPort);
  return checks.map((check, index) => {
    const flow = eligibleFlows[index] || {};
    const from = check.definition?.filters?.from?.location || {};
    const to = check.definition?.filters?.to?.location || {};
    const mapped = Boolean(flow.forwardLocations?.from && flow.forwardLocations?.to);
    return {
      application: flow.application || "unknown",
      kentikFlow: `${flow.srcIp || "unknown"} → ${flow.dstIp || "unknown"}`,
      from: locationLabel(from),
      to: locationLabel(to),
      service: `${flow.protocol || "other"}/${flow.dstPort || "any"}`,
      traffic: formatBytes(flow.bytes || 0),
      status: mapped ? STATUS.ready : STATUS.review,
      checkName: check.name || "",
    };
  });
};

const rowHtml = (row) => `
          <tr>
            <td><a>${escapeHtml(row.application)}</a><div class="muted">${escapeHtml(row.checkName)}</div></td>
            <td>${escapeHtml(row.kentikFlow)}</td>
            <td>${escapeHtml(row.from)}</td>
            <td>${escapeHtml(row.to)}</td>
            <td>${escapeHtml(row.service)}</td>
            <td>${escapeHtml(row.traffic)}</td>
            <td><span class="pill ${row.status === STATUS.ready ? "good" : "warn"}">${escapeHtml(row.status)}</span></td>
          </tr>`;

const metricBlock = (source, label, value, detail) => `
      <div class="metric-block">
        <div class="source">${sourceLogo(source)}</div>
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(String(value))}</div>
        <div class="detail">${escapeHtml(detail)}</div>
      </div>`;

const sourceLogo = (source) => {
  if (source === "KENTIK") {
    return `<div class="logo kentik-logo" aria-label="Kentik">kentik<span></span></div>`;
  }
  if (source === "FORWARD") {
    return `<div class="logo forward-logo" aria-label="Forward">FORW<span>↗</span>RD</div>`;
  }
  return `<div class="logo checks-logo" aria-label="Intent checks">◇ ${escapeHtml(source)}</div>`;
};

const arrow = () => `<div class="arrow">→</div>`;

const navItem = (label, active = false) => `
    <div class="nav-item ${active ? "active" : ""}"><span></span>${escapeHtml(label)}</div>`;

const locationLabel = (location) => {
  if (!location?.type) {
    return "Unmapped";
  }
  const value = location.value || (Array.isArray(location.values) ? location.values.join(", ") : "");
  return `${location.type}: ${value}`;
};

const formatBytes = (bytes) => {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
};

const formatTimestamp = (value) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value || "not generated";
  }
  return new Date(parsed).toISOString().replace("T", " ").replace(".000Z", " UTC");
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const clientScript = () => `
const output = document.querySelector("#output");
const runForwardImport = async (apply) => {
  output.textContent = apply ? "Pushing missing checks..." : "Running dry run...";
  try {
    const response = await fetch("/api/forward-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply })
    });
    const payload = await response.json();
    output.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    output.textContent = "Dashboard server is not running, or the Forward environment is not configured. Use npm run dashboard:serve.";
  }
};
document.querySelector("[data-action='dry-run']").addEventListener("click", () => runForwardImport(false));
document.querySelector("[data-action='push']").addEventListener("click", () => {
  if (confirm("Create missing Kentik-managed intent checks in Forward?")) {
    runForwardImport(true);
  }
});
`;

const css = () => `
:root {
  color-scheme: dark;
  --bg: #08141c;
  --panel: #0d1c28;
  --panel-2: #132635;
  --line: #314252;
  --line-soft: #263645;
  --text: #d7dde4;
  --muted: #98a6b2;
  --blue: #88d8f2;
  --red: #ff5b45;
  --good: #74d5a6;
  --warn: #ffd36d;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-width: 1180px;
  min-height: 860px;
  background: radial-gradient(circle at 62% 12%, #102838 0, #08141c 38%, #061017 100%);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
}
.topbar {
  position: fixed;
  inset: 0 0 auto 0;
  height: 58px;
  display: flex;
  align-items: center;
  gap: 22px;
  border-bottom: 1px solid var(--line);
  background: #0b1724;
  z-index: 3;
}
.brand {
  width: 234px;
  padding-left: 24px;
  font-size: 35px;
  font-weight: 800;
  letter-spacing: 5px;
  color: #f3f7fb;
}
.brand span { color: var(--red); letter-spacing: 0; }
.select, .timestamp {
  border: 1px solid #415568;
  background: #102133;
  color: #c8d2dd;
  border-radius: 4px;
  padding: 9px 14px;
  min-width: 178px;
  font-size: 18px;
}
.timestamp { min-width: 330px; color: #aee6f7; }
.user { margin-left: auto; padding-right: 24px; color: #c2cbd4; font-size: 18px; }
.sidebar {
  position: fixed;
  top: 58px;
  bottom: 0;
  left: 0;
  width: 234px;
  border-right: 1px solid var(--line);
  background: linear-gradient(#102847, #081017);
  padding: 28px 22px;
}
.nav-section {
  margin: 14px 0 10px;
  color: #c5d2de;
  font-size: 14px;
  font-weight: 700;
}
.nav-item {
  height: 45px;
  display: flex;
  align-items: center;
  gap: 13px;
  color: #c5ccd4;
  font-size: 18px;
}
.nav-item span {
  width: 24px;
  height: 24px;
  border: 2px solid currentColor;
  border-radius: 6px;
  opacity: .78;
}
.nav-item.active {
  color: #8edbf2;
  background: rgba(142, 219, 242, .16);
  margin-left: -8px;
  padding-left: 8px;
  border-radius: 4px;
}
.content {
  margin-left: 234px;
  padding: 86px 28px 40px 22px;
}
.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  padding-bottom: 28px;
}
h1 {
  margin: 0 0 12px;
  font-size: 31px;
  font-weight: 650;
}
p {
  margin: 0;
  color: #aeb8c2;
  font-size: 18px;
}
.actions {
  display: flex;
  gap: 12px;
  padding-top: 4px;
}
.button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  height: 42px;
  padding: 0 18px;
  border: 1px solid #75cdec;
  border-radius: 4px;
  background: transparent;
  color: #86d8f2;
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  text-decoration: none;
  cursor: pointer;
}
.button.primary {
  background: #76cfe9;
  color: #0b1a25;
}
.correlation {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 38px minmax(260px, 1fr) 38px minmax(260px, 1fr);
  gap: 24px;
  align-items: stretch;
  padding: 46px 0 50px;
}
.metric-block {
  min-height: 188px;
  border-bottom: 1px solid var(--line);
  padding: 8px 22px 24px;
}
.source {
  height: 44px;
  color: #f4f7fa;
}
.logo {
  display: inline-flex;
  align-items: center;
  height: 44px;
}
.kentik-logo {
  position: relative;
  padding-left: 42px;
  color: #f3f7fb;
  font-size: 31px;
  font-weight: 780;
  letter-spacing: .5px;
  text-transform: lowercase;
}
.kentik-logo::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  width: 26px;
  height: 26px;
  border: 4px solid #69c8f0;
  border-right-color: #ff6a3d;
  border-bottom-color: #ff6a3d;
  transform: rotate(45deg);
}
.kentik-logo span {
  width: 8px;
  height: 8px;
  margin-left: 6px;
  border-radius: 50%;
  background: #ff6a3d;
  align-self: flex-end;
  margin-bottom: 9px;
}
.forward-logo {
  color: #f3f7fb;
  font-size: 31px;
  font-weight: 820;
  letter-spacing: 5px;
}
.forward-logo span {
  color: var(--red);
  letter-spacing: 0;
  margin: 0 2px;
}
.checks-logo {
  color: #bfeaf6;
  font-size: 23px;
  font-weight: 760;
  letter-spacing: 1px;
}
.label {
  color: #aab5c0;
  font-size: 18px;
  margin-top: 18px;
}
.value {
  margin-top: 22px;
  color: #d8dde3;
  font-size: 46px;
  font-weight: 300;
}
.detail {
  color: #a5afb9;
  font-size: 18px;
}
.arrow {
  align-self: center;
  color: #b9c4ce;
  font-size: 32px;
  text-align: center;
}
.report-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  margin-bottom: 14px;
}
h2 {
  margin: 0;
  font-size: 23px;
  font-weight: 600;
}
.report-meta {
  color: #aeb9c3;
  font-size: 16px;
}
.table-wrap {
  overflow: hidden;
  border-top: 1px solid var(--line);
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
th {
  height: 74px;
  color: #aeb7c0;
  text-align: left;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid #83909b;
}
td {
  height: 112px;
  padding: 20px 18px 20px 0;
  border-bottom: 1px solid rgba(70, 88, 101, .55);
  color: #cbd3da;
  font-size: 17px;
  vertical-align: top;
}
tbody tr:nth-child(odd) {
  background: rgba(128, 147, 160, .16);
}
a { color: #86d8f2; text-decoration: none; }
.muted {
  margin-top: 8px;
  color: #82909d;
  font-size: 12px;
  line-height: 1.25;
}
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  height: 28px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 700;
}
.pill.good { background: rgba(116, 213, 166, .16); color: var(--good); border: 1px solid rgba(116, 213, 166, .55); }
.pill.warn { background: rgba(255, 211, 109, .14); color: var(--warn); border: 1px solid rgba(255, 211, 109, .5); }
.output {
  white-space: pre-wrap;
  margin-top: 20px;
  min-height: 58px;
  border: 1px solid var(--line-soft);
  background: rgba(8, 20, 28, .78);
  padding: 16px;
  color: #aeb9c3;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}
`;
