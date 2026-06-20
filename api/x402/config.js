const { getX402Config } = require("../../server/x402");
const { handleOptions, sendJson } = require("../_payguard");

module.exports = function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
  sendJson(res, 200, getX402Config());
};
