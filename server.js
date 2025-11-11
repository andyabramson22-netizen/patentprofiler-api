// ------------------------------
// PatentProfiler IP Data Backend
// ------------------------------

// Install dependencies once: npm install express node-fetch
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

async function safeFetch(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch (err) {
    console.error("Fetch error:", url, err.message);
    return null;
  }
}

app.get("/api/ipdata", async (req, res) => {
  const assignee = req.query.assignee;
  if (!assignee) return res.status(400).json({ error: "Missing ?assignee=" });

  const encoded = encodeURIComponent(assignee);

  const patentsViewURL = `https://api.patentsview.org/patents/query?q={"assignee_organization":"${encoded}"}&f=["patent_number"]`;
  const ibdURL = `https://developer.uspto.gov/ibd-api/v1/application?searchText=applicant:${encoded}`;
  const trademarkURL = `https://developer.uspto.gov/trademark/v1/trademark/search?searchText=owner:${encoded}`;

  const [patentsData, ibdData, tmData] = await Promise.all([
    safeFetch(patentsViewURL),
    safeFetch(ibdURL),
    safeFetch(trademarkURL)
  ]);

  const patents = patentsData?.patents?.length || 0;
  const pendingApps = ibdData?.results?.length || 0;
  const provisionals = (ibdData?.results || []).filter(r => /provisional/i.test(JSON.stringify(r))).length;
  const trademarks = tmData?.response?.docs?.length || 0;

  const pctApps = (ibdData?.results || []).filter(r => /"WO|WO\/|WO\d{2}/i.test(JSON.stringify(r))).length;
  const foreignNational = (ibdData?.results || []).filter(r => /NATIONAL|COUNTRY|DESIGNATED/i.test(JSON.stringify(r))).length;

  const result = {
    assignee,
    patents,
    pendingApps,
    pctApps,
    foreignNational,
    provisionals,
    trademarks,
    source: ["USPTO", "WIPO", "EPO"],
    lastUpdated: new Date().toISOString(),
    links: {
      wipo: `https://patentscope.wipo.int/search/en/result.jsf?query=AP%3A%22${encoded}%22`,
      epo: `https://worldwide.espacenet.com/searchResults?query=PA:${encoded}`
    }
  };

  res.setHeader("Access-Control-Allow-Origin", "*"); // so Framer can call this
  res.json(result);
});

app.listen(PORT, () => console.log(`✅ PatentProfiler API running on port ${PORT}`));
