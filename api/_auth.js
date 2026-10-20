// 선택 사항: Vercel 환경 변수 ACCESS_CODE 를 설정하면 그 코드를 아는 사람만 수집 서버를 쓸 수 있다.
// 설정하지 않으면 누구나 쓸 수 있다(비용이 들지 않으므로 기본값은 공개).
function checkCode(req, res) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return true;
  if (String(req.headers["x-access-code"] || "") !== expected) {
    res.status(401).json({ error: "bad_code", message: "접근 코드가 맞지 않습니다." });
    return false;
  }
  return true;
}
module.exports = { checkCode };
