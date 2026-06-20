const { getEvaluation, handleOptions, sendError, sendJson } = require("../_payguard");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const evaluation = getEvaluation(req.query.jobId);
    sendJson(res, 200, evaluation);
  } catch (error) {
    sendError(res, error);
  }
};
