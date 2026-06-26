import { createHash } from "node:crypto";

const PROTOCOL_BY_NUMBER = new Map([
  ["1", "icmp"],
  ["6", "tcp"],
  ["17", "udp"],
]);

const firstPresent = (row, names) => {
  for (const name of names) {
    if (Object.hasOwn(row, name) && row[name] !== null && row[name] !== undefined && row[name] !== "") {
      return row[name];
    }
  }
  return undefined;
};

const stringValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
};

const numberValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const extractKentikRows = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.rows)) {
    return payload.rows;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.results)) {
    return payload.results.flatMap((result) => {
      if (Array.isArray(result?.data)) {
        return result.data;
      }
      if (Array.isArray(result?.rows)) {
        return result.rows;
      }
      return [];
    });
  }
  return [];
};

export const normalizeKentikRow = (row, index = 0) => {
  const srcIp = stringValue(firstPresent(row, [
    "src_addr",
    "src_ip",
    "inet_src_addr",
    "src",
    "Source IP",
    "IP_src",
  ]));
  const dstIp = stringValue(firstPresent(row, [
    "dst_addr",
    "dst_ip",
    "inet_dst_addr",
    "dst",
    "Destination IP",
    "IP_dst",
  ]));
  const protocolRaw = stringValue(firstPresent(row, [
    "protocol",
    "proto",
    "l4_proto",
    "Protocol",
    "Proto",
  ]));
  const protocol = normalizeProtocol(protocolRaw);
  const dstPort = numberValue(firstPresent(row, [
    "i_dst_port",
    "dst_port",
    "l4_dst_port",
    "Destination Port",
    "Port_dst",
    "port",
  ]));
  const bytes = numberValue(firstPresent(row, [
    "sum_bytes",
    "bytes",
    "sum_both_bytes",
    "f_sum_both_bytes",
  ]));
  const packets = numberValue(firstPresent(row, [
    "sum_packets",
    "packets",
    "sum_both_packets",
    "f_sum_both_packets",
  ]));
  const flowCount = numberValue(firstPresent(row, [
    "sum_flows",
    "flow_count",
    "flows",
  ]));

  const flow = {
    sourceSystem: "kentik",
    sourceEvidenceId: stableEvidenceId(row, index),
    srcIp,
    srcName: stringValue(firstPresent(row, ["src_name", "src_hostname", "src_host"])),
    srcSite: stringValue(firstPresent(row, ["src_site", "src_geo_site", "site_src", "kt_src_site_title"])),
    dstIp,
    dstName: stringValue(firstPresent(row, ["dst_name", "dst_hostname", "dst_host"])),
    dstSite: stringValue(firstPresent(row, ["dst_site", "dst_geo_site", "site_dst", "kt_dst_site_title"])),
    protocol,
    dstPort,
    application: stringValue(firstPresent(row, [
      "application",
      "app",
      "service",
      "Application",
      "i_device_custom_name_app",
    ])),
    bytes,
    packets,
    flowCount,
    maxBitsPerSecond: numberValue(firstPresent(row, ["max_bits_per_sec", "max_bps"])),
    firstSeen: stringValue(firstPresent(row, ["first_seen", "firstSeen", "start_time"])),
    lastSeen: stringValue(firstPresent(row, ["last_seen", "lastSeen", "end_time"])),
    deviceName: stringValue(firstPresent(row, ["device_name", "device", "Device"])),
    confidence: "low",
    evidence: row,
  };

  flow.confidence = scoreFlowConfidence(flow);
  return flow;
};

export const normalizeKentikPayload = (payload) =>
  extractKentikRows(payload).map((row, index) => normalizeKentikRow(row, index));

export const flowEligibility = (flow) => {
  const reasons = [];
  if (!flow.srcIp) {
    reasons.push("missing source IP");
  }
  if (!flow.dstIp) {
    reasons.push("missing destination IP");
  }
  if (!flow.protocol || flow.protocol === "other") {
    reasons.push("missing supported protocol");
  }
  if ((flow.protocol === "tcp" || flow.protocol === "udp") && !Number.isInteger(flow.dstPort)) {
    reasons.push("missing destination port");
  }
  return {
    eligible: reasons.length === 0,
    reasons,
  };
};

export const normalizeProtocol = (value) => {
  if (!value) {
    return undefined;
  }
  const lower = String(value).trim().toLowerCase();
  if (PROTOCOL_BY_NUMBER.has(lower)) {
    return PROTOCOL_BY_NUMBER.get(lower);
  }
  if (["tcp", "udp", "icmp"].includes(lower)) {
    return lower;
  }
  return "other";
};

const scoreFlowConfidence = (flow) => {
  const hasEndpoints = Boolean(flow.srcIp && flow.dstIp);
  const hasL4 = Boolean(flow.protocol && (flow.protocol === "icmp" || Number.isInteger(flow.dstPort)));
  const hasVolume = Boolean((flow.bytes || 0) > 0 || (flow.flowCount || 0) > 0);
  if (hasEndpoints && hasL4 && hasVolume) {
    return "high";
  }
  if (hasEndpoints && hasL4) {
    return "medium";
  }
  return "low";
};

const stableEvidenceId = (row, index) => {
  const material = JSON.stringify({
    src: firstPresent(row, ["src_addr", "src_ip", "inet_src_addr", "src"]),
    dst: firstPresent(row, ["dst_addr", "dst_ip", "inet_dst_addr", "dst"]),
    proto: firstPresent(row, ["protocol", "proto", "l4_proto", "Protocol", "Proto"]),
    port: firstPresent(row, ["i_dst_port", "dst_port", "l4_dst_port", "Destination Port", "Port_dst", "port"]),
    index,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
};
