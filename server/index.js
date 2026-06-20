const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const contractAbi = require("./abi/PayGuard.json");
const { evaluatePanel, resolveAIProvider } = require("./evaluation-engine");

dotenv.config({ path: path.join(__dirname, ".env") });
const { createX402Middleware, getX402Config } = require("./x402");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const DATA_FILE = path.join(__dirname, "data", "evaluations.json");
const STATUS_NAMES = ["Open", "Accepted", "Submitted", "Settled", "Rejected", "Escalated", "Cancelled"];
const allowedOrigins = new Set(FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()));

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, callback) {
      callback(!origin || allowedOrigins.has(origin) ? null : new Error("Origin is not allowed by CORS"), true);
    }
  })
);

let evaluations = loadEvaluations();

app.get("/health", (_req, res) => {
  res.json({ ok: true, chainId: 10143, contractConfigured: Boolean(CONTRACT_ADDRESS), aiProvider: resolveAIProvider(), x402: getX402Config() });
});

app.get("/api/x402/config", (_req, res) => {
  res.json(getX402Config());
});

app.post("/api/evaluate", async (req, res) => {
  try {
    const { jobId, description, requirements, submissionUrl, evidenceHash } = req.body || {};
    const normalizedJobId = normalizeJobId(jobId);
    if (!description || !requirements || !submissionUrl || !ethers.isHexString(evidenceHash, 32)) {
      res.status(400).json({ error: "jobId, description, requirements, submissionUrl, and evidenceHash are required." });
      return;
    }

    const result = await evaluatePanel({
      jobId: normalizedJobId,
      description,
      requirements,
      submissionUrl,
      evidenceHash
    });
    const tx = await getWriteContract().recordConsensus(
      normalizedJobId,
      result.consensusHash,
      result.votes.approved,
      result.votes.rejected,
      result.votes.escalated
    );
    const receipt = await tx.wait();
    const evaluation = {
      ...result,
      jobId: normalizedJobId.toString(),
      txHash: receipt.hash,
      updatedAt: new Date().toISOString()
    };
    evaluations[normalizedJobId.toString()] = evaluation;
    saveEvaluations();
    res.json(evaluation);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/job/:jobId", async (req, res) => {
  try {
    const jobId = normalizeJobId(req.params.jobId);
    const job = await getReadContract().getJob(jobId);
    res.json({ ...normalizeJob(jobId, job), evaluation: evaluations[jobId.toString()] || null });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/evaluation/:jobId", (req, res) => {
  try {
    const jobId = normalizeJobId(req.params.jobId).toString();
    res.json({ jobId, evaluation: evaluations[jobId] || null });
  } catch (error) {
    sendError(res, error);
  }
});

const x402Middleware = createX402Middleware();
if (x402Middleware) {
  app.use(x402Middleware);
}

app.get("/api/x402/report/:jobId", (req, res) => {
  try {
    const jobId = normalizeJobId(req.params.jobId).toString();
    const evaluation = evaluations[jobId];
    if (!evaluation) {
      res.status(404).json({ error: "No arbitration report exists for this task." });
      return;
    }
    res.json({
      protocol: "x402-v2",
      jobId,
      verdict: evaluation.verdict,
      confidence: evaluation.confidence,
      votes: evaluation.votes,
      panel: evaluation.panel,
      consensusHash: evaluation.consensusHash,
      settlementTx: evaluation.txHash,
      generatedAt: evaluation.updatedAt
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`Arbitra server listening on http://localhost:${PORT}`);
});

function getReadContract() {
  assertContract();
  return new ethers.Contract(CONTRACT_ADDRESS, contractAbi, new ethers.JsonRpcProvider(MONAD_RPC_URL));
}

function getWriteContract() {
  assertContract();
  if (!PRIVATE_KEY) {
    throw withStatus("Set PRIVATE_KEY so the arbitration panel can record consensus.", 500);
  }
  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, contractAbi, new ethers.Wallet(PRIVATE_KEY, provider));
}

function assertContract() {
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    throw withStatus("Set CONTRACT_ADDRESS in server/.env.", 500);
  }
}

function normalizeJobId(jobId) {
  try {
    const value = BigInt(jobId);
    if (value < 0n) throw new Error("negative");
    return value;
  } catch (_error) {
    throw withStatus("jobId must be a non-negative integer.", 400);
  }
}

function normalizeJob(jobId, job) {
  const status = Number(job.status);
  return {
    id: jobId.toString(),
    client: job.client,
    freelancer: job.freelancer,
    description: job.description,
    requirements: job.requirements,
    skill: job.skill,
    amountWei: job.amount.toString(),
    amountMon: ethers.formatEther(job.amount),
    stakeRequiredWei: job.stakeRequired.toString(),
    stakeRequiredMon: ethers.formatEther(job.stakeRequired),
    stakeLockedWei: job.stakeLocked.toString(),
    stakeLockedMon: ethers.formatEther(job.stakeLocked),
    status,
    statusLabel: STATUS_NAMES[status] || "Unknown",
    submissionUrl: job.submissionUrl,
    evidenceHash: job.evidenceHash,
    consensusHash: job.consensusHash,
    votes: {
      approved: Number(job.approveVotes),
      rejected: Number(job.rejectVotes),
      escalated: Number(job.escalateVotes)
    },
    humanReviewed: Boolean(job.humanReviewed)
  };
}

function loadEvaluations() {
  try {
    return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
  } catch (error) {
    console.warn(`Could not read ${DATA_FILE}: ${error.message}`);
    return {};
  }
}

function saveEvaluations() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(evaluations, null, 2)}\n`);
}

function withStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendError(res, error) {
  const status = error.status || error.statusCode || 500;
  const message = error.shortMessage || error.reason || error.info?.error?.message || error.message || "Unexpected server error.";
  console.error(message);
  res.status(status).json({ error: message });
}
