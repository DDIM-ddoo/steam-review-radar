const { checkCode } = require("./_auth");
module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  if (!checkCode(req, res)) return;
  res.status(200).json({ ok: true });
};
