export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ヘルスチェック
    if (path === "/api/health") {
      return new Response(JSON.stringify({
        ok: true,
        name: "rev-result-roi-worker"
      }), { headers: { "Content-Type": "application/json" } });
    }

    // 結果登録
    if (path === "/api/result/import" && request.method === "POST") {
      const body = await request.json();
      const race = body.race;

      if (!race) {
        return new Response(JSON.stringify({ ok:false, error:"race required"}));
      }

      await env.RESULT_DB.put(race, JSON.stringify(body));

      return new Response(JSON.stringify({ ok:true }));
    }

    // 結果取得
    if (path === "/api/result") {
      const race = url.searchParams.get("race");

      if (!race) {
        return new Response(JSON.stringify({ ok:false, error:"race required"}));
      }

      const data = await env.RESULT_DB.get(race, { type:"json" });

      if (!data) {
        return new Response(JSON.stringify({ ok:false, error:"no data"}));
      }

      return new Response(JSON.stringify({ ok:true, data }));
    }

    // ROI分析
    if (path === "/api/roi/analyze" && request.method === "POST") {
      const body = await request.json();
      const races = body.races || [];

      let totalBet = 0;
      let totalReturn = 0;

      races.forEach(r => {
        const bet = (r.bet || 0);
        const payout = (r.payout || 0);
        totalBet += bet;
        totalReturn += payout;
      });

      const roi = totalBet ? (totalReturn / totalBet * 100) : 0;

      return new Response(JSON.stringify({
        ok:true,
        totalBet,
        totalReturn,
        roi
      }));
    }

    return new Response(JSON.stringify({
      ok:false,
      error:"not found",
      paths:[
        "/api/health",
        "/api/result",
        "/api/result/import",
        "/api/roi/analyze"
      ]
    }));
  }
};
