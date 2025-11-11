// server.js -- improved debug + assignee-variations + correct PatentsView query
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send('✅ PatentProfiler API is running. Use /api/ipdata?assignee=YourCompanyName');
}

);

async function safeFetchJson(url) {
  try {
    const r = await fetch(url, { timeout: 30000 });
    const txt = await r.text();
    if (!r.ok) {
      return { ok: false, status: r.status, statusText: r.statusText, bodyText: txt };
    }
    try {
      const json = JSON.parse(txt);
      return { ok: true, json };
    } catch (e) {
      return { ok: false, status: r.status, statusText: 'invalid-json', bodyText: txt };
    }
  } catch (err) {
    return { ok: false, status: 'fetch-error', statusText: err.message };
  }
}

// Build PatentsView query properly
async function fetchPatentsForAssignee(assignee) {
  const qObj = { assignee_organization: assignee };
  const q = encodeURIComponent(JSON.stringify(qObj));
  const url = `https://api.patentsview.org/patents/query?q=${q}&f=["patent_number","patent_title"]&o={"per_page":1000}`;
  const resp = await safeFetchJson(url);
  if (!resp.ok) return { ok:false, url, resp };
  const items = resp.json.patents || [];
  // normalize patent numbers
  const patentNumbers = items.map(p => p.patent_number).filter(Boolean);
  return { ok:true, url, count: patentNumbers.length, patentNumbers, rawCount: items.length };
}

async function fetchTrademarksForAssignee(assignee) {
  // USPTO trademark search endpoint (best-effort)
  // note: some responses may vary; we return debug info
  const base = 'https://developer.uspto.gov/trademark/v1/trademark';
  const q = encodeURIComponent(assignee);
  const url = `${base}/search?searchText=owner:${q}&rows=200&start=0`;
  const resp = await safeFetchJson(url);
  if (!resp.ok) return { ok:false, url, resp };
  const docs = resp.json?.response?.docs || [];
  return { ok:true, url, count: docs.length, docsSample: docs.slice(0,5) };
}

// Try IBD application endpoint (pending apps). The IBD API has inconsistent shapes, so we pull results when available.
async function fetchPendingAppsForAssignee(assignee) {
  // two attempt URLs: "application" and "application/publications" (best-effort)
  const attempts = [
    `https://developer.uspto.gov/ibd-api/v1/application?searchText=applicant:${encodeURIComponent(assignee)}&rows=200`,
    `https://developer.uspto.gov/ibd-api/v1/application/publications?searchText=applicant:${encodeURIComponent(assignee)}&rows=200`
  ];
  for (const url of attempts) {
    const resp = await safeFetchJson(url);
    if (!resp.ok) {
      // continue to next attempt
      continue;
    }
    // try several possible fields
    const items = resp.json?.results || resp.json?.results?.docs || resp.json?.response?.docs || resp.json?.applications || resp.json?.data || [];
    if (items && items.length >= 0) {
      return { ok:true, url, count: items.length, itemsSample: items.slice(0,5) };
    }
  }
  return { ok:false, attempts };
}

// dedupe helper
function uniqueBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const k = keyFn(it);
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
}

app.get("/api/ipdata", async (req, res) => {
  const assigneeRaw = (req.query.assignee || '').trim();
  if (!assigneeRaw) return res.status(400).json({ error: "Missing ?assignee=" });

  // Auto try variations to improve match
  const variations = [
    assigneeRaw,
    `${assigneeRaw} LLC`,
    `${assigneeRaw} L.L.C.`,
    `${assigneeRaw} INC`,
    `${assigneeRaw} INC.`,
    `${assigneeRaw} CORP`,
    `${assigneeRaw} LTD`,
    `${assigneeRaw} COMPANY`
  ].map(s => s.trim()).filter((v, i, a) => v && a.indexOf(v) === i);

  // Optionally allow caller to pass ?tryVariants=false
  const tryVariants = req.query.tryVariants !== 'false';

  const assigneesToTry = tryVariants ? variations : [assigneeRaw];

  const debug = { tries: assigneesToTry };

  // aggregate sets
  let allPatentNums = [];
  let totalTmCount = 0;
  let totalPendingCount = 0;
  let rawProvCount = 0;

  // track per-assignee debug
  debug.perAssignee = [];

  for (const a of assigneesToTry) {
    const pd = { assignee: a, patents: null, pending: null, trademarks: null };
    // patents
    try {
      const pResp = await fetchPatentsForAssignee(a);
      pd.patents = { ok: pResp.ok, url: pResp.url, count: pResp.count || 0 };
      if (pResp.ok && Array.isArray(pResp.patentNumbers)) {
        allPatentNums = allPatentNums.concat(pResp.patentNumbers);
      }
    } catch (e) {
      pd.patents = { ok:false, error: e.message };
    }

    // pending apps
    try {
      const pendingResp = await fetchPendingAppsForAssignee(a);
      pd.pending = pendingResp.ok ? { ok:true, url: pendingResp.url, count: pendingResp.count } : { ok:false, attempts: pendingResp.attempts || null };
      if (pendingResp.ok && Array.isArray(pendingResp.itemsSample)) {
        // look for "provisional" mention to count provisional filings
        const sample = JSON.stringify(pendingResp.itemsSample).toLowerCase();
        // best-effort provisional count approximation for this assignee
        const prov = (sample.match(/provisional/g) || []).length;
        rawProvCount += prov;
      }
      if (pendingResp.ok && Array.isArray(pendingResp.itemsSample)) {
        totalPendingCount += pendingResp.count || 0;
      }
    } catch (e) {
      pd.pending = { ok:false, error: e.message };
    }

    // trademarks
    try {
      const tmResp = await fetchTrademarksForAssignee(a);
      pd.trademarks = tmResp.ok ? { ok:true, url: tmResp.url, count: tmResp.count } : { ok:false, resp: tmResp.resp };
      if (tmResp.ok) totalTmCount += (tmResp.count || 0);
    } catch (e) {
      pd.trademarks = { ok:false, error: e.message };
    }

    debug.perAssignee.push(pd);
  }

  // dedupe patent numbers
  const uniquePatentNums = Array.from(new Set(allPatentNums)).filter(Boolean);

  // simple provisional best-effort: use rawProvCount as approximation (since real detection needs full items)
  const provisionals = rawProvCount;

  // totals (use deduped patents, aggregated trademarks, pending)
  const patents = uniquePatentNums.length;
  const pendingApps = totalPendingCount;
  const trademarks = totalTmCount;

  // simple PCT/foreign heuristics left out here because pending items parsing varies per endpoint.
  // For now we return zeros for pctApps/foreignNational but include debug so you can see pending items to inspect.
  const pctApps = 0;
  const foreignNational = 0;

  // Final result with debug
  const result = {
    assigneeQueried: assigneeRaw,
    triedAssignees: assigneesToTry,
    patents,
    pendingApps,
    pctApps,
    foreignNational,
    provisionals,
    trademarks,
    debug
  };

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(result);
});

app.listen(PORT, () => console.log(`✅ PatentProfiler API running on port ${PORT}`));
