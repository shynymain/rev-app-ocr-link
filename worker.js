export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") {
      return new Response(JSON.stringify({ ok: true }));
    }

    if (path === "/api/result") {
      const race = url.searchParams.get("race");
      return new Response(JSON.stringify({ ok:true, race }));
    }

    return new Response(JSON.stringify({
      ok:false,
      error:"not found"
    }));
  }
};
