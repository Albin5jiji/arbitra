const { createX402Middleware, getX402Config } = require("../../../server/x402");
const { getEvaluation, handleOptions, sendError, sendJson } = require("../../_payguard");

const middleware = createX402Middleware();

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
  if (!middleware) {
    sendJson(res, 503, { error: "x402 is not configured.", config: getX402Config() });
    return;
  }

  try {
    await middleware(req, res, () => {
      const { evaluation } = getEvaluation(req.query.jobId);
      if (!evaluation) {
        sendJson(res, 404, { error: "No arbitration report exists for this task." });
        return;
      }
      sendJson(res, 200, {
        protocol: "x402-v2",
        jobId: String(req.query.jobId),
        verdict: evaluation.verdict,
        confidence: evaluation.confidence,
        votes: evaluation.votes,
        panel: evaluation.panel,
        consensusHash: evaluation.consensusHash,
        settlementTx: evaluation.txHash,
        generatedAt: evaluation.updatedAt
      });
    });
  } catch (error) {
    sendError(res, error);
  }
};
