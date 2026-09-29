// Builds the Shenandoah National Park website using the nps_mcp server.
//
// 1. Starts the MCP server and calls its tools:
//      park-details, park-alerts, park-campgrounds, park-visitor-centers, park-things-to-do,
//      park-events, park-webcams, park-places, weather-forecast, trail-features
// 2. Saves everything to ../shen-data.json
// 3. Pours that data into site-template.html and writes ../shenandoah.html
//
// Usage:  node build-site.mjs            (reads API_KEY from .env)
//         node build-site.mjs yose       (any other park code)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const here = path.dirname(fileURLToPath(import.meta.url));
const PARK_CODE = process.argv[2] || "shen";
const OUT_NAME = PARK_CODE === "shen" ? "shenandoah" : PARK_CODE;

if (!process.env.API_KEY) {
  console.error("Missing API_KEY. Add a line like API_KEY=your_key to the .env file in this folder.");
  process.exit(1);
}

// --- 1. Talk to the MCP server ---------------------------------------------
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "build", "index.js")],
  env: { ...process.env, API_KEY: process.env.API_KEY },
});
const client = new Client({ name: "park-site-builder", version: "2.0.0" });
await client.connect(transport);

async function call(name, args, fallback) {
  process.stdout.write(`  ${name.padEnd(22)}`);
  try {
    const result = await client.callTool({ name, arguments: args });
    const data = JSON.parse(result.content?.[0]?.text ?? "null") ?? fallback;
    const count = Array.isArray(data) ? `${data.length} items`
      : data && typeof data === "object" ? Object.entries(data).map(([k, v]) => `${Array.isArray(v) ? v.length : 1} ${k}`).join(", ") : "";
    console.log(`✓ ${count}`);
    return data;
  } catch (err) {
    console.log(`✗ skipped (${err.message ?? err})`);
    return fallback;
  }
}

console.log(`Collecting data for "${PARK_CODE}" through the nps_mcp server…`);
const details = await call("park-details", { parkCode: PARK_CODE }, []);
const park = Array.isArray(details) ? details[0] : null;
if (!park) {
  await client.close();
  console.error("\nThe park-details tool returned no data. Check that your API key in .env is correct.");
  process.exit(1);
}
const lat = parseFloat(park.latitude), lon = parseFloat(park.longitude);

const data = {
  generatedAt: new Date().toISOString(),
  park,
  alerts: await call("park-alerts", { parkCode: PARK_CODE }, []),
  campgrounds: await call("park-campgrounds", { parkCode: PARK_CODE }, []),
  visitorCenters: await call("park-visitor-centers", { parkCode: PARK_CODE }, []),
  thingsToDo: await call("park-things-to-do", { parkCode: PARK_CODE }, []),
  events: await call("park-events", { parkCode: PARK_CODE }, []),
  webcams: await call("park-webcams", { parkCode: PARK_CODE }, []),
  places: await call("park-places", { parkCode: PARK_CODE }, []),
  forecast: isNaN(lat) ? [] : await call("weather-forecast", { latitude: lat, longitude: lon }, []),
  trailFeatures: await call("trail-features", { areaName: park.fullName }, { trails: [], points: [] }),
};
await client.close();

// --- 2. Save the raw data ----------------------------------------------------
const dataPath = path.join(here, "..", `${PARK_CODE}-data.json`);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

// --- 3. Build the page -------------------------------------------------------
const template = fs.readFileSync(path.join(here, "site-template.html"), "utf8");
const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
const html = template
  .replace("__PARK_DATA__", () => safeJson)
  .replace(/__PARK_TITLE__/g, () => String(park.fullName).replace(/[<>&"]/g, ""));
const outPath = path.join(here, "..", `${OUT_NAME}.html`);
fs.writeFileSync(outPath, html);

console.log(`\nDone! Your site: ${outPath}`);
console.log(`Raw data:       ${dataPath}`);
