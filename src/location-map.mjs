const ENDPOINT_ALIASES = {
  from: ["from", "src"],
  to: ["to", "dst"],
};

const ENDPOINT_CANDIDATES = {
  from: [
    ["srcIp", "srcIp"],
    ["srcName", "srcName"],
    ["srcSite", "srcSite"],
    ["deviceName", "deviceName"],
  ],
  to: [
    ["dstIp", "dstIp"],
    ["dstName", "dstName"],
    ["dstSite", "dstSite"],
  ],
};

export const ALLOWED_FORWARD_LOCATION_TYPES = new Set(["HostFilter", "DeviceFilter", "InterfaceFilter"]);

export const applyLocationMap = (flows, locationMap) =>
  flows.map((flow) => resolveFlowLocations(flow, locationMap));

export const resolveFlowLocations = (flow, locationMap = {}) => {
  validateLocationMap(locationMap);
  const from = resolveEndpointLocation("from", flow, locationMap);
  const to = resolveEndpointLocation("to", flow, locationMap);
  if (!from && !to) {
    return flow;
  }

  return {
    ...flow,
    forwardLocations: {
      ...(from ? { from: from.location } : {}),
      ...(to ? { to: to.location } : {}),
    },
    forwardLocationMapping: {
      ...(from ? { from: from.reason } : {}),
      ...(to ? { to: to.reason } : {}),
    },
  };
};

export const locationMappingStats = (flows) => {
  const stats = {
    fromMapped: 0,
    toMapped: 0,
    bothMapped: 0,
  };

  for (const flow of flows) {
    const fromMapped = Boolean(flow.forwardLocations?.from);
    const toMapped = Boolean(flow.forwardLocations?.to);
    if (fromMapped) stats.fromMapped += 1;
    if (toMapped) stats.toMapped += 1;
    if (fromMapped && toMapped) stats.bothMapped += 1;
  }

  return stats;
};

export const validateLocationMap = (locationMap) => {
  if (!locationMap || typeof locationMap !== "object" || Array.isArray(locationMap)) {
    throw new Error("Location map must be a JSON object.");
  }

  for (const endpoint of ["from", "to"]) {
    for (const alias of ENDPOINT_ALIASES[endpoint]) {
      validateDirectMap(locationMap[alias], alias);
    }
    const defaultLocation = locationMap.defaults?.[endpoint] || locationMap.defaults?.[ENDPOINT_ALIASES[endpoint][1]];
    if (defaultLocation) {
      normalizeLocation(defaultLocation, `defaults.${endpoint}`);
    }
  }

  if (locationMap.rules !== undefined && !Array.isArray(locationMap.rules)) {
    throw new Error("Location map rules must be an array.");
  }
  for (const [index, rule] of (locationMap.rules || []).entries()) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error(`Location map rule ${index} must be an object.`);
    }
    if (!rule.match || typeof rule.match !== "object" || Array.isArray(rule.match)) {
      throw new Error(`Location map rule ${index} must include a match object.`);
    }
    const fromLocation = rule.from || rule.src;
    const toLocation = rule.to || rule.dst;
    if (!fromLocation && !toLocation) {
      throw new Error(`Location map rule ${index} must include from/src or to/dst.`);
    }
    if (fromLocation) normalizeLocation(fromLocation, `rules[${index}].from`);
    if (toLocation) normalizeLocation(toLocation, `rules[${index}].to`);
  }
};

export const normalizeLocation = (location, label = "location") => {
  if (!location || typeof location !== "object" || Array.isArray(location)) {
    throw new Error(`${label} must be an object.`);
  }
  if (!ALLOWED_FORWARD_LOCATION_TYPES.has(location.type)) {
    throw new Error(
      `${label}.type must be one of ${[...ALLOWED_FORWARD_LOCATION_TYPES].join(", ")}.`,
    );
  }

  const hasValue = typeof location.value === "string" && location.value.trim().length > 0;
  const hasValues = Array.isArray(location.values) && location.values.length > 0;
  if (hasValue === hasValues) {
    throw new Error(`${label} must include exactly one of value or values.`);
  }
  if (hasValues && !location.values.every((value) => typeof value === "string" && value.trim())) {
    throw new Error(`${label}.values must contain non-empty strings.`);
  }

  return hasValue
    ? { type: location.type, value: location.value.trim() }
    : { type: location.type, values: [...new Set(location.values.map((value) => value.trim()))] };
};

const validateDirectMap = (map, label) => {
  if (map === undefined) {
    return;
  }
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    throw new Error(`Location map ${label} must be an object.`);
  }
  for (const [key, location] of Object.entries(map)) {
    if (!key.trim()) {
      throw new Error(`Location map ${label} contains an empty key.`);
    }
    normalizeLocation(location, `${label}.${key}`);
  }
};

const resolveEndpointLocation = (endpoint, flow, locationMap) => {
  const direct = resolveDirectEndpointLocation(endpoint, flow, locationMap);
  if (direct) {
    return direct;
  }

  const rule = resolveRuleEndpointLocation(endpoint, flow, locationMap);
  if (rule) {
    return rule;
  }

  const defaultLocation = locationMap.defaults?.[endpoint] || locationMap.defaults?.[ENDPOINT_ALIASES[endpoint][1]];
  if (defaultLocation) {
    return {
      location: normalizeLocation(defaultLocation, `defaults.${endpoint}`),
      reason: `default:${endpoint}`,
    };
  }

  return null;
};

const resolveDirectEndpointLocation = (endpoint, flow, locationMap) => {
  for (const alias of ENDPOINT_ALIASES[endpoint]) {
    const map = locationMap[alias];
    if (!map) {
      continue;
    }
    for (const [field, reasonField] of ENDPOINT_CANDIDATES[endpoint]) {
      const value = flow[field];
      if (value !== undefined && value !== null && map[String(value)]) {
        return {
          location: normalizeLocation(map[String(value)], `${alias}.${value}`),
          reason: `${alias}:${reasonField}=${value}`,
        };
      }
    }
  }
  return null;
};

const resolveRuleEndpointLocation = (endpoint, flow, locationMap) => {
  for (const [index, rule] of (locationMap.rules || []).entries()) {
    if (!matchesFlow(rule.match, flow)) {
      continue;
    }
    const location = endpoint === "from" ? rule.from || rule.src : rule.to || rule.dst;
    if (!location) {
      continue;
    }
    return {
      location: normalizeLocation(location, `rules[${index}].${endpoint}`),
      reason: `rule:${index}`,
    };
  }
  return null;
};

const matchesFlow = (match, flow) =>
  Object.entries(match).every(([field, expected]) => {
    const actual = flow[field];
    if (Array.isArray(expected)) {
      return expected.map(String).includes(String(actual));
    }
    return String(actual) === String(expected);
  });
