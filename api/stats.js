// 게임 성과 지표 모으기: 현재 동시 접속(Steam 공식), 월별 동시 접속(SteamCharts),
// 보유자 추정(SteamSpy), 한국 정가(Steam 스토어). 하나가 실패해도 나머지는 돌려준다.
const { checkCode } = require("./_auth");
const UA = { "user-agent": "Mozilla/5.0 (compatible; SteamReviewRadar/1.0)" };
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
async function get(url, asText) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return asText ? r.text() : r.json();
}
const num = (s) => Number(String(s).replace(/[^\d.\-]/g, "")) || 0;
function parseCharts(html) {
  const stats = [...html.matchAll(/<div class="app-stat">\s*<span class="num">([\d,]+)<\/span>/g)].map((m) => num(m[1]));
  const body = (html.split("<tbody>")[1] || "").split("</tbody>")[0];
  const months = [];
  for (const row of body.split("</tr>")) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
    if (cells.length < 5) continue;
    const label = cells[0];
    let key = null;
    if (/last 30 days/i.test(label)) key = "last30";
    else { const m = label.match(/([A-Za-z]+)\s+(\d{4})/); if (m && MONTHS[m[1].toLowerCase()]) key = `${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}`; }
    if (!key) continue;
    months.push({ m: key, avg: Math.round(num(cells[1])), peak: num(cells[4]) });
  }
  return { now: stats[0] ?? null, peak24: stats[1] ?? null, peakAll: stats[2] ?? null, months };
}
module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  if (!checkCode(req, res)) return;
  const appid = String((req.query && req.query.appid) || "");
  if (!/^\d{1,10}$/.test(appid)) return res.status(400).json({ error: "bad_appid", message: "잘못된 게임 번호입니다." });
  const [cur, charts, spy, store] = await Promise.allSettled([
    get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`),
    get(`https://steamcharts.com/app/${appid}`, true),
    get(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`),
    get(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=kr&l=koreana&filters=price_overview,release_date`),
  ]);
  const out = { appid: Number(appid), at: Date.now(), errors: {} };
  if (cur.status === "fulfilled" && cur.value?.response?.result === 1) out.current = cur.value.response.player_count;
  else out.errors.current = cur.reason?.message || "no data";
  if (charts.status === "fulfilled") { const c = parseCharts(charts.value); if (c.months.length || c.peakAll) out.charts = c; else out.errors.charts = "no data"; }
  else out.errors.charts = charts.reason?.message || "no data";
  if (spy.status === "fulfilled" && spy.value?.owners) {
    const [lo, hi] = String(spy.value.owners).split("..").map(num);
    out.spy = { owners: spy.value.owners, lo, hi };
  } else out.errors.spy = spy.reason?.message || "no data";
  const sd = store.status === "fulfilled" ? store.value?.[appid] : null;
  if (sd?.success && sd.data) {
    const p = sd.data.price_overview;
    out.store = { free: !p, currency: p?.currency || null, initial: p ? p.initial / 100 : 0, final: p ? p.final / 100 : 0, discount: p?.discount_percent || 0, release: sd.data.release_date?.date || null };
  } else out.errors.store = store.reason?.message || "no data";
  res.status(200).json(out);
};
module.exports.parseCharts = parseCharts;
