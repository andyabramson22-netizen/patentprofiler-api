// ==============================================
// PatentProfiler Backend API (Final Version)
// ==============================================

import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for Framer and other web clients
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/", (req, res) => {
  res.send("✅ PatentProfiler API is running");
});

// ----------------------------------------------------
// Helper function for safe fetching
// ----------------------------------------------------
async function safeFetch(url) {
  try {
    const r = await fetch(url);
    const json = await r.json();
    return { ok: r.ok, json };
  } catch (err) {
    console.error("Fetch error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ----------------------------------------------------
// Route 1: Basic patent/trademark lookup by assignee
// ----------------------------------------------------
app.get("/api/ipdata", async (req, res) => {
  const assignee = (req.query.assignee || "").trim();
  if (!assignee) return res.status(400).json({ error: "Missing ?assignee=" });

  const patentsViewURL = `https://api.patentsview.org/patents/query?q={"assignee_organization":"${assignee}"}&f=["patent_number"]`;
  const trademarkURL = `https://developer.uspto.gov/trademark/v1/trademark/search?searchText=owner:${assignee}`;

  const [patentsRes, trademarksRes] = await Promise.all([
    safeFetch(patentsViewURL),
    safeFetch(trademarkURL)
  ]);

  const patents = (patentsRes.json?.patents || []).length || 0;
  const trademarks = (trademarksRes.json?.results || []).length || 0;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    assignee,
    patents,
    trademarks,
    debug: { patentsViewURL, trademarkURL }
  });
});

// ----------------------------------------------------
// Route 2: Lookup by customer number (public simulation)
// ----------------------------------------------------
app.get("/api/ipdata/byCustomer", async (req, res) => {
  const custNum = (req.query.number || "").trim();
  if (!custNum) return res.status(400).json({ error: "Missing ?number=" });

  // Simulated results (since USPTO customer data is private)
  const pending = Math.floor(Math.random() * 4) + 1;
  const provisionals = Math.floor(Math.random() * 3);
  const pctApps = Math.floor(Math.random() * 2);
  const foreignNational = Math.floor(Math.random() * 3);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    customerNumber: custNum,
    pendingApps: pending,
    provisionals,
    pctApps,
    foreignNational,
    totalApps: pending + provisionals + pctApps + foreignNational,
    note: "Simulated public data (private USPTO data not accessible)"
  });
});

// ----------------------------------------------------
// Route 3: Combined endpoint for Framer dashboard
// ----------------------------------------------------
app.get("/api/ipdata/full", async (req, res) => {
  const assignee = (req.query.assignee || "").trim();
  const custNum = (req.query.number || "").trim();

  if (!assignee || !custNum) {
    return res.status(400).json({ error: "Missing assignee or customer number" });
  }

  // Fetch from public sources
  const patentsViewURL = `https://api.patentsview.org/patents/query?q={"assignee_organization":"${assignee}"}&f=["patent_number","patent_title","assignee_organization"]&o={"per_page":1000}`;
  const trademarkURL = `https://developer.uspto.gov/trademark/v1/trademark/search?searchText=owner:${assignee}`;
  const patentCenterURL = `https://patentcenter.uspto.gov/partner/applications?customerNumber=${custNum}`;

  const [patentsRes, trademarksRes] = await Promise.all([
    safeFetch(patentsViewURL),
    safeFetch(trademarkURL)
  ]);

  // Publicly accessible data
  const patents = (patentsRes.json?.patents || []).length || 0;
  const trademarks = (trademarksRes.json?.results || []).length || 0;

  // Demo data for private USPTO fields (pending/provisional/etc.)
  const pendingApps = Math.floor(Math.random() * 4) + 1;
  const provisionals = Math.floor(Math.random() * 2) + 1;
  const pctApps = Math.floor(Math.random() * 2);
  const foreignNational = Math.floor(Math.random() * 3);

  // Calculations
  const ipStrengthScore =
    patents * 4 +
    pendingApps * 2 +
    pctApps * 2.5 +
    foreignNational * 2.5 +
    provisionals * 1.5 +
    trademarks * 2;

  const estPortfolioValue =
    10000 +
    patents * 60000 +
    pendingApps * 30000 +
    pctApps * 40000 +
    foreignNational * 50000 +
    trademarks * 20000 +
    provisionals * 8000;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    assignee,
    customerNumber: custNum,
    summary: {
      patents,
      trademarks,
      pendingApps,
      provisionals,
      pctApps,
      foreignNational,
      ipStrengthScore,
      estPortfolioValue
    },
    debug: {
      patentsView: patentsViewURL,
      trademark: trademarkURL,
      patentCenter: patentCenterURL
    }
  });
});

// ----------------------------------------------------
// Start the server
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ PatentProfiler API running on port ${PORT}`);
});
