const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function normalizeRaceName(v = "") {
  return String(v)
    .trim()
    .replace(/ステークス/g, "S")
    .replace(/記念/g, "記念")
    .replace(/カップ/g, "C")
    .replace(/杯/g, "杯")
    .replace(/\s+/g, "");
}

function normalizeCombo(v) {
  if (!v) return "";
  return String(v)
    .replace(/[－ー―]/g, "-")
    .split("-")
    .map(x => String(Number(String(x).trim())))
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b))
    .join("-");
}

function hitUmaren(pred = [], result = {}) {
  const actual = normalizeCombo(result.umaren || `${result.first}-${result.second}`);
  return pred.map(normalizeCombo).includes(actual);
}

function hitSanrenpuku(pred = [], result = {}) {
  const actual = normalizeCombo(result.sanrenpuku || `${result.first}-${result.second}-${result.third}`);
  return pred.map(normalizeCombo).includes(actual);
}

const SAMPLE_RESULTS = [
  {
    race: {
      date: "2025/04/06",
      place: "阪神",
      raceName: "大阪杯",
      grade: "G1",
      surface: "芝"
    },
    result: {
      first: "5",
      second: "13",
      third: "7",
      umaren: "5-13",
      sanrenpuku: "5-7-13"
    },
    payout: {
      umaren: 3880,
      sanrenpuku: 6910
    },
    prediction: {
      umaren: [],
      sanrenpuku: []
    }
  }
];

async function readBodyJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}

async function importResults(request, env) {
  const body = await readBodyJson(request);
  const items = Array.isArray(body) ? body : body?.races || body?.results || [];

  if (!Array.isArray(items) || items.length === 0) {
    return json({ ok: false, error: "JSON array or {races:[...]} is required" }, 400);
  }

  const cleaned = items.map(item => ({
    race: item.race || {},
    result: item.result || {},
    payout: item.payout || {},
    prediction: item.prediction || { umaren: [], sanrenpuku: [] }
  }));

  if (env.RESULT_DB) {
    for (const item of cleaned) {
      const key = `${item.race.date || ""}_${normalizeRaceName(item.race.raceName || "")}`;
      await env.RESULT_DB.put(key, JSON.stringify(item));
    }
  }

  return json({ ok: true, imported: cleaned.length, races: cleaned });
}

async function getResult(request, env) {
  const url = new URL(request.url);
  const race = normalizeRaceName(url.searchParams.get("race") || "");
  const date = url.searchParams.get("date") || "";

  let data = null;

  if (env.RESULT_DB && race) {
    if (date) data = await env.RESULT_DB.get(`${date}_${race}`, { type: "json" });

    if (!data) {
      const list = await env.RESULT_DB.list();
      for (const key of list.keys || []) {
        if (key.name.includes(race)) {
          data = await env.RESULT_DB.get(key.name, { type: "json" });
          break;
        }
      }
    }
  }

  if (!data && race) {
    data = SAMPLE_RESULTS.find(x => normalizeRaceName(x.race.raceName) === race) || null;
  }

  if (!data) {
    return json({ ok: false, error: "no data", hint: "Use /api/result/import first or query race=大阪杯" }, 404);
  }

  return json({ ok: true, data });
}

async function analyzeRoi(request) {
  const body = request.method === "POST" ? await readBodyJson(request) : null;
  const items = Array.isArray(body) ? body : body?.races || body?.results || SAMPLE_RESULTS;

  const stakePerBet = Number(body?.stakePerBet || 100);
  let umarenBets = 0;
  let sanrenpukuBets = 0;
  let umarenHits = 0;
  let sanrenpukuHits = 0;
  let totalStake = 0;
  let totalReturn = 0;

  const details = items.map(item => {
    const pred = item.prediction || {};
    const result = item.result || {};
    const payout = item.payout || {};
    const uPred = Array.isArray(pred.umaren) ? pred.umaren : [];
    const sPred = Array.isArray(pred.sanrenpuku) ? pred.sanrenpuku : [];
    const uHit = hitUmaren(uPred, result);
    const sHit = hitSanrenpuku(sPred, result);

    const uStake = uPred.length * stakePerBet;
    const sStake = sPred.length * stakePerBet;
    const uReturn = uHit ? Number(payout.umaren || 0) : 0;
    const sReturn = sHit ? Number(payout.sanrenpuku || 0) : 0;

    umarenBets += uPred.length;
    sanrenpukuBets += sPred.length;
    if (uHit) umarenHits += 1;
    if (sHit) sanrenpukuHits += 1;
    totalStake += uStake + sStake;
    totalReturn += uReturn + sReturn;

    return {
      race: item.race,
      umaren: { bets: uPred.length, hit: uHit, stake: uStake, return: uReturn },
      sanrenpuku: { bets: sPred.length, hit: sHit, stake: sStake, return: sReturn }
    };
  });

  return json({
    ok: true,
    count: items.length,
    stakePerBet,
    summary: {
      totalStake,
      totalReturn,
      roi: totalStake ? Math.round((totalReturn / totalStake) * 1000) / 10 : 0,
      umaren: {
        bets: umarenBets,
        hits: umarenHits,
        hitRate: items.length ? Math.round((umarenHits / items.length) * 1000) / 10 : 0
      },
      sanrenpuku: {
        bets: sanrenpukuBets,
        hits: sanrenpukuHits,
        hitRate: items.length ? Math.round((sanrenpukuHits / items.length) * 1000) / 10 : 0
      }
    },
    details
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/api/health") {
      return json({
        ok: true,
        name: "rev-result-roi-worker",
        paths: [
          "/api/health",
          "/api/result?race=大阪杯",
          "/api/result/import",
          "/api/roi/analyze"
        ]
      });
    }

    if (path === "/api/result" && request.method === "GET") {
      return getResult(request, env);
    }

    if (path === "/api/result/import" && request.method === "POST") {
      return importResults(request, env);
    }

    if (path === "/api/roi/analyze") {
      return analyzeRoi(request);
    }

    return json({
      ok: false,
      error: "not found",
      paths: [
        "/api/health",
        "/api/result?race=大阪杯",
        "/api/result/import",
        "/api/roi/analyze"
      ]
    }, 404);
  }
};
