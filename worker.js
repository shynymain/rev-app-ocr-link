
const MEMORY = new Map();

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type"
    }
  });
}

function normalizeRecord(x){
  const raceObj = x.race && typeof x.race === "object" ? x.race : {};
  const raceName = x.raceName || raceObj.raceName || x.name || "";
  const date = x.date || raceObj.date || "";
  const race = x.race && typeof x.race === "string" ? x.race : `${date}_${raceName}`.replace(/^_/, "");
  return {
    race,
    raceName,
    date,
    place: x.place || raceObj.place || "",
    grade: x.grade || raceObj.grade || "",
    surface: x.surface || raceObj.surface || "",
    result: x.result || {},
    payout: x.payout || {},
    bet: x.bet || x.predictionBet || {},
    prediction: x.prediction || {},
    updatedAt: new Date().toISOString()
  };
}

function getStore(env){
  // KV binding RESULT_DB があればKV、なければメモリで動作確認
  return env && env.RESULT_DB ? "kv" : "memory";
}

async function putRecord(env, record){
  if(env && env.RESULT_DB){
    await env.RESULT_DB.put(record.race, JSON.stringify(record));
  } else {
    MEMORY.set(record.race, record);
  }
}
async function getRecord(env, key){
  if(env && env.RESULT_DB){
    return await env.RESULT_DB.get(key, { type:"json" });
  }
  return MEMORY.get(key) || null;
}
async function listRecords(env){
  if(env && env.RESULT_DB){
    const keys = await env.RESULT_DB.list();
    const records = [];
    for(const k of keys.keys){
      const v = await env.RESULT_DB.get(k.name, { type:"json" });
      if(v) records.push(v);
    }
    return records;
  }
  return Array.from(MEMORY.values());
}

function sumBet(bet){
  if(typeof bet === "number") return bet;
  if(!bet || typeof bet !== "object") return 0;
  return Number(bet.umaren || 0) + Number(bet.sanrenpuku || 0);
}
function sumReturn(payout, prediction, result){
  // 単純版：predictionが空なら払戻0。的中した場合のみ払戻を返す。
  if(!payout || !prediction) return 0;
  let ret = 0;
  const f = result?.first, s = result?.second, t = result?.third;
  const umarenResult = [f,s].filter(Boolean).sort((a,b)=>Number(a)-Number(b)).join("-");
  const sanrenResult = [f,s,t].filter(Boolean).sort((a,b)=>Number(a)-Number(b)).join("-");
  const umarenHits = (prediction.umaren || []).map(x => String(x).split("-").sort((a,b)=>Number(a)-Number(b)).join("-"));
  const sanrenHits = (prediction.sanrenpuku || []).map(x => String(x).split("-").sort((a,b)=>Number(a)-Number(b)).join("-"));
  if(umarenHits.includes(umarenResult)) ret += Number(payout.umaren || 0);
  if(sanrenHits.includes(sanrenResult)) ret += Number(payout.sanrenpuku || 0);
  return ret;
}

export default {
  async fetch(request, env) {
    if(request.method === "OPTIONS") return json({ok:true});

    const url = new URL(request.url);
    const path = url.pathname;

    if(path === "/" || path === "/api/health"){
      return json({
        ok:true,
        name:"rev-full-auto-result-ocr-db-worker",
        store:getStore(env),
        paths:[
          "/api/health",
          "/api/result?race=2025_%E5%A4%A7%E9%98%AA%E6%9D%AF",
          "/api/result/import",
          "/api/result/list",
          "/api/roi/analyze"
        ]
      });
    }

    if(path === "/api/result/import" && request.method === "POST"){
      try{
        const body = await request.json();
        let records = [];
        if(Array.isArray(body)) records = body;
        else if(Array.isArray(body.records)) records = body.records;
        else if(Array.isArray(body.results)) records = body.results;
        else records = [body];

        const normalized = records.map(normalizeRecord).filter(r => r.race);
        for(const r of normalized) await putRecord(env, r);

        return json({ok:true, count:normalized.length, records:normalized});
      }catch(e){
        return json({ok:false, error:String(e)}, 400);
      }
    }

    if(path === "/api/result"){
      const race = url.searchParams.get("race");
      if(!race) return json({ok:false, error:"race required"}, 400);

      const data = await getRecord(env, race);
      if(data) return json({ok:true, data});

      // 未登録でもWorker疎通確認できるようにする
      return json({ok:true, race, registered:false, message:"no data yet. POST /api/result/import first."});
    }

    if(path === "/api/result/list"){
      const records = await listRecords(env);
      return json({ok:true, count:records.length, records});
    }

    if(path === "/api/roi/analyze"){
      let records = [];
      if(request.method === "POST"){
        const body = await request.json();
        if(Array.isArray(body)) records = body;
        else if(Array.isArray(body.records)) records = body.records;
        else if(Array.isArray(body.races)) records = body.races;
      } else {
        records = await listRecords(env);
      }

      records = records.map(normalizeRecord);
      let totalBet = 0;
      let totalReturn = 0;
      let umarenHit = 0, sanrenHit = 0;
      let umarenCount = 0, sanrenCount = 0;

      const details = records.map(r => {
        const bet = sumBet(r.bet);
        const ret = sumReturn(r.payout, r.prediction, r.result);
        totalBet += bet;
        totalReturn += ret;

        if((r.prediction.umaren || []).length) umarenCount++;
        if((r.prediction.sanrenpuku || []).length) sanrenCount++;

        const f = r.result?.first, s = r.result?.second, t = r.result?.third;
        const ur = [f,s].filter(Boolean).sort((a,b)=>Number(a)-Number(b)).join("-");
        const sr = [f,s,t].filter(Boolean).sort((a,b)=>Number(a)-Number(b)).join("-");
        const uh = (r.prediction.umaren || []).map(x => String(x).split("-").sort((a,b)=>Number(a)-Number(b)).join("-")).includes(ur);
        const sh = (r.prediction.sanrenpuku || []).map(x => String(x).split("-").sort((a,b)=>Number(a)-Number(b)).join("-")).includes(sr);
        if(uh) umarenHit++;
        if(sh) sanrenHit++;

        return { race:r.race, raceName:r.raceName, bet, return:ret, umarenHit:uh, sanrenpukuHit:sh };
      });

      return json({
        ok:true,
        count:records.length,
        totalBet,
        totalReturn,
        roi: totalBet ? Math.round((totalReturn / totalBet * 100) * 10) / 10 : 0,
        umarenHitRate: umarenCount ? Math.round((umarenHit / umarenCount * 100) * 10) / 10 : 0,
        sanrenpukuHitRate: sanrenCount ? Math.round((sanrenHit / sanrenCount * 100) * 10) / 10 : 0,
        details
      });
    }

    return json({
      ok:false,
      error:"not found",
      paths:["/api/health","/api/result","/api/result/import","/api/result/list","/api/roi/analyze"]
    }, 404);
  }
};　
