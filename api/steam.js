// Steam 공개 데이터 중계. 브라우저는 Steam에 직접 요청할 수 없어서(CORS) 서버가 대신 가져온다.
// 아무 주소나 대신 열어 주지 않도록 허용한 경로만 통과시킨다.
const { checkCode } = require("./_auth");
const ALLOW = [
  /^\/appreviews\/\d+\/?$/,          // 리뷰 목록
  /^\/appreviewhistogram\/\d+\/?$/,  // 월별 리뷰 추이
  /^\/search\/results\/?$/,          // 태그 검색
  /^\/api\/storesearch\/?$/,         // 게임 이름 검색
  /^\/api\/appdetails\/?$/,          // 게임 상세(출시 연도, 본편/DLC 구분)
];
module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  if (!checkCode(req, res)) return;
  let u;
  try { u = new URL(String((req.query && req.query.u) || "")); } catch (e) {
    return res.status(400).json({ error: "bad_url", message: "잘못된 주소입니다." });
  }
  if (u.pathname.startsWith("/api/appdetails") && !/^\d{1,10}$/.test(u.searchParams.get("appids") || "")) {
    return res.status(400).json({ error: "bad_url", message: "게임 번호는 하나만 조회할 수 있습니다." });
  }
  if (u.protocol !== "https:" || u.hostname !== "store.steampowered.com" || !ALLOW.some((r) => r.test(u.pathname))) {
    return res.status(400).json({ error: "bad_url", message: "허용되지 않은 Steam 주소입니다." });
  }
  let r, txt;
  try {
    r = await fetch(u.toString(), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SteamReviewRadar/1.0)", accept: "application/json,text/plain,*/*" },
      signal: AbortSignal.timeout(25000),
    });
    txt = await r.text();
  } catch (e) {
    return res.status(504).json({ error: "steam_timeout", message: "Steam이 제때 응답하지 않았습니다." });
  }
  if (!r.ok) return res.status(502).json({ error: "steam_http", message: `Steam 응답 오류 (${r.status})` });
  let j;
  try { j = JSON.parse(txt); } catch (e) {
    return res.status(502).json({ error: "steam_bad_response", message: "Steam이 예상과 다른 응답을 보냈습니다." });
  }
  res.status(200).json(j);
};
