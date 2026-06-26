export const buildLocationMapTemplate = ({ flows, devices }) => {
  const siteKeys = uniqueSites(flows);
  const deviceNames = devices.map(deviceName).filter(Boolean);
  if (deviceNames.length === 0) {
    throw new Error("No Forward devices were returned for the target network.");
  }

  const assignments = new Map();
  siteKeys.forEach((site, index) => {
    assignments.set(site, chooseDeviceForSite(site, deviceNames, index));
  });

  return {
    version: "forward-kentik-location-map/v0.1",
    reviewRequired: true,
    note: "Generated from Forward device inventory. Review before import or apply.",
    src: Object.fromEntries(siteKeys.map((site) => [site, deviceFilter(assignments.get(site))])),
    dst: Object.fromEntries(siteKeys.map((site) => [site, deviceFilter(assignments.get(site))])),
  };
};

export const uniqueSites = (flows) =>
  [
    ...new Set(
      flows.flatMap((flow) => [flow.srcSite, flow.dstSite]).filter((site) => typeof site === "string" && site.trim()),
    ),
  ].sort();

const chooseDeviceForSite = (site, deviceNames, index) => {
  const siteTokens = String(site)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  const match = deviceNames.find((name) => {
    const lower = name.toLowerCase();
    return siteTokens.some((token) => lower.includes(token));
  });
  return match || deviceNames[index % deviceNames.length];
};

const deviceFilter = (value) => ({ type: "DeviceFilter", value });

const deviceName = (device) => device?.name || device?.displayName || device?.deviceName;
