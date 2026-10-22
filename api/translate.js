// 영어·중국어 리뷰 원문을 한국어로 번역한다(비용 0, API 키 불필요).
// 1순위: Google 번역 공개 웹 엔드포인트(translate.googleapis.com, client=gtx)
// 2순위: MyMemory 무료 번역 API (1순위가 막히거나 실패했을 때)
// 둘 다 무료 공개 서비스라 요청이 몰리면 일시적으로 거절될 수 있다. 그때는 원문이 그대로 남는다.
const { checkCode } = require("./_auth");
const UA = "Mozilla/5.0 (compatible; SteamReviewRadar/1.0)";
const MAX_ITEMS = 40, MAX_CHARS = 16000, MAX_ONE = 2000;

// 긴 글은 문장 경계에서 잘라 여러 번 요청한다(주소 길이 제한 대비).
function chunks(t, size) {
  const parts = String(t).split(/(?<=[.!?。！？；\n])/);
  const out = []; let cur = "";
  for (const p of parts) {
    if ((cur + p).length > size && cur) { out.push(cur); cur = ""; }
    if (p.length > size) { for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size)); continue; }
    cur += p;
  }
  if (cur) out.push(cur);
  return out;
}
async function google(t) {
  let res = "", src = "";
  for (const c of chunks(t, 600)) {
    const u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=" + encodeURIComponent(c);
    const r = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error("google_" + r.status);
    const j = await r.json();
    const seg = (Array.isArray(j) && Array.isArray(j[0]) ? j[0] : []).map((x) => (x && x[0]) || "").join("");
    if (!seg) throw new Error("google_empty");
    res += seg; src = src || (typeof j[2] === "string" ? j[2] : "");
  }
  return { t: res, src, by: "google" };
}
async function mymemory(t) {
  const from = /[一-鿿]/.test(t) ? "zh-CN" : "en";
  let res = "";
  for (const c of chunks(t, 450)) {
    const u = "https://api.mymemory.translated.net/get?langpair=" + from + "|ko&q=" + encodeURIComponent(c);
    const r = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error("mymemory_" + r.status);
    const j = await r.json();
    const seg = j && j.responseData && j.responseData.translatedText;
    if (Number(j && j.responseStatus) !== 200 || !seg || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(seg)) throw new Error("mymemory_bad");
    res += (res ? " " : "") + seg;
  }
  return { t: res, src: from, by: "mymemory" };
}
async function one(t) {
  try { return await google(t); } catch (e) {}
  try { return await mymemory(t); } catch (e) {}
  return null;
}
module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  if (!checkCode(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method", message: "POST로 요청해 주세요." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const texts = body && Array.isArray(body.texts) ? body.texts : null;
  if (!texts || !texts.length || texts.length > MAX_ITEMS || texts.some((t) => typeof t !== "string")) {
    return res.status(400).json({ error: "bad_input", message: `번역할 문장을 1~${MAX_ITEMS}개 보내 주세요.` });
  }
  const list = texts.map((t) => t.slice(0, MAX_ONE));
  if (list.reduce((s, t) => s + t.length, 0) > MAX_CHARS) return res.status(413).json({ error: "too_long", message: "한 번에 번역할 글이 너무 깁니다." });
  const out = new Array(list.length).fill(null);
  let i = 0;
  const worker = async () => { while (i < list.length) { const k = i++; out[k] = list[k].trim() ? await one(list[k]) : { t: "", src: "", by: "none" }; } };
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
  if (out.every((x) => !x)) return res.status(502).json({ error: "translate_failed", message: "무료 번역 서비스가 지금 응답하지 않습니다. 잠시 뒤 다시 눌러 주세요." });
  res.status(200).json({ out });
};
