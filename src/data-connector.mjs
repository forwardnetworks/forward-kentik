export const buildForwardDataConnectorConfig = ({
  baseUrl,
  name = "forward-kentik-observed-flows",
  collect = false,
} = {}) => {
  if (!baseUrl) {
    throw new Error("baseUrl is required");
  }
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return {
    name,
    baseUrl: normalizedBaseUrl,
    collect,
    extraHeaders: {
      Accept: "application/json",
    },
    endpoints: [
      {
        name: "observed-flows",
        path: "/observed-flows.json",
      },
      {
        name: "forward-kentik-report",
        path: "/forward-kentik-report.json",
      },
      {
        name: "forward-kentik-manifest",
        path: "/forward-kentik-manifest.json",
      },
    ],
  };
};
