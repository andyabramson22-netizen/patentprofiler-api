// ==============================================
// PatentProfiler Backend API — Final Clean Version
// ==============================================

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS (for Framer and web apps)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/", (req, res) => {
  res.send("✅ PatentProfiler API is running and ready");
});

// ----------------------------------------------------
// Helper: Safe fetch with error handling
// ----------------------------------------------------
async function safeFetch(url) {
  try {
    const response = await fetch(url);
    const json = await response.json();
    return { ok: response.ok, json };
  } catch (error) {
    console.error("Fetch error:", error.message);
    return { ok: false, error: error.message };
  }
}

// ----------------------------------------------------
// Route 1: /api/ipdata — Lookup by assignee (public data)
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

  res.json({
    assignee,
    patents,
    trademarks,
    debug: { patentsViewURL, trademarkURL }
  });
});

// ----------------------------------------------------
// Route 2: /api/ipdata/byCustomer — Simulated lookup
// ----------------------------------------------------
app.get("/api/ipdata/byCustomer", async (req, res) => {
  const custNum = (req.query.number || "").trim();
  if (!custNum) return res.status(400).json({ error: "Missing ?number=" });

  // Simulated data (since USPTO customer APIs are private)
  const pendingApps = Math.floor(Math.random() * 4) + 1;
  const provisionals = Math.floor(Math.random() * 3);
  const pctApps = Math.floor(Math.random() * 2);
  const foreignNational = Math.floor(Math.random() * 3);

  res.json({
    customerNumber: custNum,
    pendingApps,
    provisionals,
    pctApps,
    foreignNational,
    totalApps: pendingApps + provisionals + pctApps + foreignNational,
    note: "Simulated public data (private USPTO data not accessible)"
  });
});

// ----------------------------------------------------
// Route 3: /api/ipdata/full — Combined for Framer Dashboard
// ----------------------------------------------------
app.get("/api/ipdata/full", async (req, res) => {
  const assignee = (req.query.assignee || "").trim();
  const custNum = (req.query.number || "").trim();

  if (!assignee || !custNum) {
    return res.status(400).json({ error: "Missing assignee or customer number" });
  }

  // Public APIs
  const patentsViewURL = `https://api.patentsview.org/patents/query?q={"assignee_organization":"${assignee}"}&f=["patent_number","patent_title","assignee_organization"]&o={"per_page":1000}`;
  const trademarkURL = `https://developer.uspto.gov/trademark/v1/trademark/search?searchText=owner:${assignee}`;
  const patentCenterURL = `https://patentcenter.uspto.gov/partner/applications?customerNumber=${custNum}`;

  const [patentsRes, trademarksRes] = await Promise.all([
    safeFetch(patentsViewURL),
    safeFetch(trademarkURL)
  ]);

  // Publicly visible counts
  const patents = (patentsRes.json?.patents || []).length || 0;
  const trademarks = (trademarksRes.json?.results || []).length || 0;

  // Simulated placeholders for private data
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
// Start the Server
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ PatentProfiler API running on port ${PORT}`);
});
