// Cloudflare Worker sample for /api/schedule and /api/results
// 注意: JRA公式ページの構造変更や利用条件に影響されます。本番では取得先HTMLに合わせてparseSchedule/parseResultsを調整してください。
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname.endsWith('/api/schedule')) {
      // ここにJRA公式の今週出馬表/開催情報取得処理を接続します。
      return new Response(JSON.stringify({ ok: true, source: 'worker-sample', races: sampleRaces() }), { headers });
    }
    if (url.pathname.endsWith('/api/results')) {
      return new Response(JSON.stringify({ ok: true, source: 'worker-sample', results: [] }), { headers });
    }
    return new Response(JSON.stringify({ ok: true, endpoints: ['/api/schedule','/api/results'] }), { headers });
  }
}
function sampleRaces(){
  return [{
    date: new Date().toISOString().slice(0,10), place:'東京', raceNo:11, raceName:'今週メインサンプル', surface:'芝', grade:'G2', condition:'別定', headcount:18,
    horses: Array.from({length:18},(_,i)=>({frame:Math.min(8,Math.ceil((i+1)/2)), no:i+1, name:`サンプル${i+1}`, last1:String((i%9)+1), last2:String(((i+3)%9)+1), last3:String(((i+5)%9)+1), odds:(2+i*1.4).toFixed(1)}))
  }];
}
