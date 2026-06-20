const { ethers } = require("ethers");
const contractAbi = require("../server/abi/PayGuard.json");
const { evaluatePanel } = require("../server/evaluation-engine");

const DEFAULT_CONTRACT_ADDRESS = "0x8b34197cacBD4712cC1B8606dBE255C75b589cD1";
const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || process.env.VITE_CONTRACT_ADDRESS || DEFAULT_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const STATUS_NAMES = ["Open", "Accepted", "Submitted", "Settled", "Rejected", "Escalated", "Cancelled"];

globalThis.arbitraEvaluations = globalThis.arbitraEvaluations || {};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function handleOptions(req, res) {
  if (req.method !== "OPTIONS") {
    return false;
  }
  setCors(res);
  res.status(204).end();
  return true;
}

function getReadContract() {
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    throw withStatus("Set CONTRACT_ADDRESS before reading contract data.", 500);
  }
  return new ethers.Contract(CONTRACT_ADDRESS, contractAbi, new ethers.JsonRpcProvider(MONAD_RPC_URL));
}

function getWriteContract() {
  if (!PRIVATE_KEY) {
    throw withStatus("Set PRIVATE_KEY so the arbitration panel can record consensus.", 500);
  }
  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, contractAbi, new ethers.Wallet(PRIVATE_KEY, provider));
}

async function evaluateAndRecord(body) {
  const { jobId, description, requirements, submissionUrl, evidenceHash } = body || {};
  const normalizedJobId = normalizeJobId(jobId);
  if (!description || !requirements || !submissionUrl || !ethers.isHexString(evidenceHash, 32)) {
    throw withStatus("jobId, description, requirements, submissionUrl, and evidenceHash are required.", 400);
  }

  const result = await evaluatePanel({ jobId: normalizedJobId, description, requirements, submissionUrl, evidenceHash });
  const contract = getWriteContract();
  const tx = await contract.recordConsensus(
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
  globalThis.arbitraEvaluations[normalizedJobId.toString()] = evaluation;
  return evaluation;
}

async function getJob(jobIdParam) {
  const jobId = normalizeJobId(jobIdParam);
  const job = await getReadContract().getJob(jobId);
  return { ...normalizeJob(jobId, job), evaluation: globalThis.arbitraEvaluations[jobId.toString()] || null };
}

function getEvaluation(jobIdParam) {
  const jobId = normalizeJobId(jobIdParam).toString();
  return { jobId, evaluation: globalThis.arbitraEvaluations[jobId] || null };
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

function withStatus(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(res, status, data) {
  setCors(res);
  res.status(status).json(data);
}

function sendError(res, error) {
  const status = error.status || error.statusCode || 500;
  const message = error.shortMessage || error.reason || error.info?.error?.message || error.message || "Unexpected server error.";
  console.error(message);
  sendJson(res, status, { error: message });
}

module.exports = { evaluateAndRecord, getEvaluation, getJob, handleOptions, sendError, sendJson };
