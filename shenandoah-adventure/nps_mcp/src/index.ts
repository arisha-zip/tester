import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

// environment variables
dotenv.config();

const BASE_URL = "https://developer.nps.gov/api/v1";
const API_KEY = process.env.API_KEY || "Key Not Supplied";

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY
}

interface ParamsType {
  start: Number
  limit: Number
  parkCode?: String
  stateCode?: String
}

/**********************************************************************************************************************
 *  This function will perform the fetch given an endpoint and params; the NPS endpoints are all GET methods
 *********************************************************************************************************************/
export const fetchData = async (endpoint: string, params: any | {}) => {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.search = new URLSearchParams(params).toString();

  const options = {
    method: 'GET',
    headers
  };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

/**********************************************************************************************************************
 *  This function will fetch all of the national parks and return the code, states array, and full name
 *  These codes can then be used to fetch detailed information for specific parks and/or states
 *********************************************************************************************************************/
export const fetchAllParkCodes = async () => {
  let codes = [];
  let start = 0;
  const limit = 50;
  let data;
  let paginating = true;

  while (paginating) {
    const body = await fetchData('parks', { start, limit });
    data = body.data;
    // @ts-ignore
    codes.push(...data.map(item => ({ parkCode: item.parkCode, fullName: item.fullName, states: item.states.split(',') })));
    start += limit;
    if (body.total < start) {
      paginating = false;
    }
  }
  return codes;
}

/**********************************************************************************************************************
 *  This function will fetch details for a national park given a park code
 *********************************************************************************************************************/
export const fetchParkDetails = async (parkCode: String) => {
  let start = 0;
  const limit = 50;
  let data = []
  let paginating = true;
  let params: ParamsType = { start, limit, parkCode };

  while (paginating) {
    const body = await fetchData('parks', params);
    data.push(...body.data);
    start += limit;
    if (body.total < start) {
      paginating = false;
    }
  }
  return data;
}

/**********************************************************************************************************************
 *  This function will return a list of parks for a given state
 *********************************************************************************************************************/
export const fetchParksList = async (stateCode: String) => {
  let start = 0;
  const limit = 50;
  let data = []
  let paginating = true;
  let params: ParamsType = { start, limit, stateCode };

  while (paginating) {
    const body = await fetchData('parks', params);
    data.push(...body.data);
    start += limit;
    if (body.total < start) {
      paginating = false;
    }
  }
  return data.map(item => ({ fullName: item.fullName, description: item.description, parkCode: item.parkCode }));
}

/**********************************************************************************************************************
 *  MCP Server for National Park Services data
 *  - retrieve list of parks given a state
 *  - get details about a park given a park code
 *********************************************************************************************************************/
const server = new McpServer(
  {
    name: "nps",
    version: "1.0.0",
  }
);

/**********************************************************************************************************************
 *  NEW: generic paginated fetch for any NPS endpoint that is filtered by parkCode
 *  (alerts, campgrounds, visitorcenters, thingstodo, webcams, places, ...)
 *********************************************************************************************************************/
export const fetchParkEndpoint = async (endpoint: string, parkCode: string) => {
  const limit = 50;
  let start = 0;
  const data: any[] = [];
  while (true) {
    const body = await fetchData(endpoint, { start, limit, parkCode });
    if (!body || !Array.isArray(body.data)) break;
    data.push(...body.data);
    start += limit;
    if (Number(body.total) <= start || body.data.length === 0) break;
  }
  return data;
}

// The events endpoint pages differently (pageSize / pageNumber)
export const fetchParkEvents = async (parkCode: string) => {
  const body = await fetchData('events', { parkCode, pageSize: 50, pageNumber: 1 });
  return body?.data ?? [];
}

/**********************************************************************************************************************
 *  NEW: National Weather Service forecast (free, no key) for a latitude/longitude
 *********************************************************************************************************************/
export const fetchForecast = async (lat: number, lon: number) => {
  const nwsHeaders = { 'User-Agent': 'nps-mcp (personal park website)', 'Accept': 'application/geo+json' };
  try {
    const point = await (await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: nwsHeaders })).json();
    const forecastUrl = point?.properties?.forecast;
    if (!forecastUrl) return [];
    const forecast = await (await fetch(forecastUrl, { headers: nwsHeaders })).json();
    return (forecast?.properties?.periods ?? []).map((p: any) => ({
      name: p.name, startTime: p.startTime, isDaytime: p.isDaytime, temperature: p.temperature,
      temperatureUnit: p.temperatureUnit, shortForecast: p.shortForecast, detailedForecast: p.detailedForecast,
      windSpeed: p.windSpeed, icon: p.icon
    }));
  } catch (error) {
    console.error("Error fetching forecast:", error);
    return [];
  }
}

/**********************************************************************************************************************
 *  NEW: OpenStreetMap trail data (free, no key) via the Overpass API.
 *  Returns named hiking paths, trailheads, viewpoints, waterfalls and peaks inside a named protected area.
 *********************************************************************************************************************/
export const fetchTrailFeatures = async (areaName: string) => {
  const query = `[out:json][timeout:90];
area["name"="${areaName.replace(/"/g, '')}"]["boundary"~"national_park|protected_area"]->.park;
(
  way["highway"~"path|footway|track"]["name"](area.park);
  node["highway"="trailhead"](area.park);
  node["tourism"="viewpoint"](area.park);
  node["waterway"="waterfall"](area.park);
  node["natural"="peak"]["name"](area.park);
);
out geom qt;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'nps-mcp (personal park website)' },
      body: 'data=' + encodeURIComponent(query)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    const trails: any[] = [];
    const points: any[] = [];
    for (const el of body.elements ?? []) {
      const t = el.tags ?? {};
      if (el.type === 'way' && el.geometry) {
        // keep every other vertex to keep the file small
        const line = el.geometry.filter((_: any, i: number, a: any[]) => i % 2 === 0 || i === a.length - 1)
          .map((g: any) => [round(g.lat), round(g.lon)]);
        trails.push({ name: t.name, line });
      } else if (el.type === 'node') {
        const kind = t.highway === 'trailhead' ? 'trailhead' : t.tourism === 'viewpoint' ? 'viewpoint'
          : t.waterway === 'waterfall' ? 'waterfall' : 'peak';
        points.push({ kind, name: t.name ?? null, lat: round(el.lat), lon: round(el.lon), ele: t.ele ?? null });
      }
    }
    return { trails, points };
  } catch (error) {
    console.error("Error fetching trail features:", error);
    return { trails: [], points: [] };
  }
}

const jsonResult = (data: any) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

// NEW tools: one per NPS endpoint
const parkEndpointTools: [string, string, string][] = [
  ["park-alerts", "alerts", "Get current alerts and closures for a national park"],
  ["park-campgrounds", "campgrounds", "Get campgrounds for a national park"],
  ["park-visitor-centers", "visitorcenters", "Get visitor centers for a national park"],
  ["park-things-to-do", "thingstodo", "Get suggested things to do (hikes, drives, programs) for a national park"],
  ["park-webcams", "webcams", "Get webcams for a national park"],
  ["park-places", "places", "Get notable places (overlooks, landmarks, trails) for a national park"],
];
for (const [name, endpoint, description] of parkEndpointTools) {
  server.tool(
    name,
    description,
    { parkCode: z.string().describe("National Park lookup code") },
    async ({ parkCode }: { parkCode: string }) => jsonResult(await fetchParkEndpoint(endpoint, parkCode))
  );
}

server.tool(
  "park-events",
  "Get upcoming events and ranger programs for a national park",
  { parkCode: z.string().describe("National Park lookup code") },
  async ({ parkCode }: { parkCode: string }) => jsonResult(await fetchParkEvents(parkCode))
);

server.tool(
  "weather-forecast",
  "Get the 7-day National Weather Service forecast for a latitude/longitude in the U.S.",
  { latitude: z.number(), longitude: z.number() },
  async ({ latitude, longitude }: { latitude: number, longitude: number }) => jsonResult(await fetchForecast(latitude, longitude))
);

server.tool(
  "trail-features",
  "Get OpenStreetMap hiking trails, trailheads, viewpoints, waterfalls and peaks inside a park, by the park's full name",
  { areaName: z.string().describe("Full park name, e.g. Shenandoah National Park") },
  async ({ areaName }: { areaName: string }) => jsonResult(await fetchTrailFeatures(areaName))
);

// tool for fetching park details
server.tool(
  "park-details",
  "Get details for a specific national park",
  {
    parkCode: z.string().describe("National Park lookup code"),
  },
  async ({ parkCode }: { parkCode: string }) => {
    const data = await fetchParkDetails(parkCode);
    return { content: [{ type: "text", text: JSON.stringify(data) }] }
  }
);

server.tool(
  "park-list",
  "Get list of parks for a given state",
  {
    stateCode: z.string().describe("Two-letter state code")
  },
  async ({ stateCode }: { stateCode: string }) => {
    const data = await fetchParksList(stateCode);
    return { content: [{ type: "text", text: JSON.stringify(data) }] }
  }
);

server.prompt(
  "parks-by-state",
  { stateCode: z.string() },
  ({ stateCode }: { stateCode: string }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `What National Parks are in the state of ${stateCode}`
      }
    }]
  })
);

server.prompt(
  "details-for-park",
  { park: z.string() },
  ({ park }: { park: string }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Give me details about ${park}`
      }
    }]
  })
);

// connect and start receiving messages
const transport = new StdioServerTransport();
await server.connect(transport);
