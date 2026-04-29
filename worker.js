export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/result") {
      const race = url.searchParams.get("race");

      // 仮：サンプル（ここ後で自動取得に差し替え）
      return Response.json({
        ok: true,
        race,
        result: {
          first: "1",
          second: "2",
          third: "3"
        },
        payout: {
          umaren: 1230,
          sanrenpuku: 4560
        }
      });
    }

    return Response.json({ ok: false });
  }
};
