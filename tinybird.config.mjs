/** @type {import("@tinybirdco/sdk").TinybirdConfig} */
export default {
  include: ["lib/tinybird.ts"],
  token: process.env.TINYBIRD_TOKEN,
  baseUrl: process.env.TINYBIRD_URL || "https://api.us-east.aws.tinybird.co",
  devMode: "branch",
};
