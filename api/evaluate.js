const { evaluateAndRecord, handleOptions, sendError, sendJson } = require("./_payguard");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const evaluation = await evaluateAndRecord(req.body);
    sendJson(res, 200, evaluation);
  } catch (error) {
    sendError(res, error);
  }
};
