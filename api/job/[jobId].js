const { getJob, handleOptions, sendError, sendJson } = require("../_payguard");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) {
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const job = await getJob(req.query.jobId);
    sendJson(res, 200, job);
  } catch (error) {
    sendError(res, error);
  }
};
