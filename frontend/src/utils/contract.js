import { ethers } from "ethers";
import payGuardAbi from "../abi/PayGuard.json";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const MONAD_RPC_URL = "https://testnet-rpc.monad.xyz";
export const MONAD_TESTNET = {
  chainId: "0x279f",
  chainName: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18
  },
  rpcUrls: [MONAD_RPC_URL]
};

export const JOB_STATUS = {
  Open: 0,
  Accepted: 1,
  Submitted: 2,
  Settled: 3,
  Rejected: 4,
  Escalated: 5,
  Cancelled: 6
};

export const STATUS_LABELS = ["Open", "Accepted", "Submitted", "Settled", "Rejected", "Escalated", "Cancelled"];

const CUSTOM_ERRORS = {
  EmptyEscrow: "Enter an escrow amount greater than zero.",
  EmptyEvidence: "The execution receipt could not be generated.",
  IncorrectStake: "Accept this task with exactly the required MON stake.",
  InvalidAddress: "Check the wallet address and try again.",
  InvalidJob: "That job does not exist on the contract.",
  InvalidStatus: "This job is not in the right status for that action.",
  InvalidVotes: "The judge panel must submit exactly three valid votes.",
  NotClient: "Only the client who created this job can do that.",
  NotFreelancer: "Only the assigned freelancer can submit work.",
  NotOwner: "Only the contract owner can do that.",
  PaymentFailed: "The settlement transfer failed.",
  ReentrantCall: "Settlement is already in progress."
};

export function isContractConfigured() {
  return Boolean(CONTRACT_ADDRESS) && ethers.isAddress(CONTRACT_ADDRESS);
}

export function getBrowserProvider() {
  if (!window.ethereum) {
    throw new Error("MetaMask is required to use Arbitra.");
  }
  return new ethers.BrowserProvider(window.ethereum);
}

export function getReadContract() {
  if (!isContractConfigured()) {
    throw new Error("Set VITE_CONTRACT_ADDRESS in frontend/.env.");
  }

  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, payGuardAbi, provider);
}

export async function getSignerContract() {
  if (!isContractConfigured()) {
    throw new Error("Set VITE_CONTRACT_ADDRESS in frontend/.env.");
  }

  await ensureMonadNetwork();
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, payGuardAbi, signer);
}

export async function ensureMonadNetwork() {
  if (!window.ethereum) {
    throw new Error("MetaMask is required to use Arbitra.");
  }

  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (String(currentChainId).toLowerCase() === MONAD_TESTNET.chainId) {
    return;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_TESTNET.chainId }]
    });
  } catch (error) {
    if (error.code !== 4902) {
      throw error;
    }

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [MONAD_TESTNET]
    });
  }
}

export function normalizeJob(id, rawJob) {
  const status = Number(rawJob.status ?? rawJob[8]);
  const amount = rawJob.amount ?? rawJob[5];
  const stakeRequired = rawJob.stakeRequired ?? rawJob[6];
  const stakeLocked = rawJob.stakeLocked ?? rawJob[7];

  return {
    id: id.toString(),
    client: rawJob.client ?? rawJob[0],
    freelancer: rawJob.freelancer ?? rawJob[1],
    description: rawJob.description ?? rawJob[2],
    requirements: rawJob.requirements ?? rawJob[3],
    skill: rawJob.skill ?? rawJob[4],
    amountWei: amount.toString(),
    amountMon: ethers.formatEther(amount),
    stakeRequiredWei: stakeRequired.toString(),
    stakeRequiredMon: ethers.formatEther(stakeRequired),
    stakeLockedWei: stakeLocked.toString(),
    stakeLockedMon: ethers.formatEther(stakeLocked),
    status,
    statusLabel: STATUS_LABELS[status] || "Unknown",
    submissionUrl: rawJob.submissionUrl ?? rawJob[9],
    evidenceHash: rawJob.evidenceHash ?? rawJob[10],
    consensusHash: rawJob.consensusHash ?? rawJob[11],
    votes: {
      approved: Number(rawJob.approveVotes ?? rawJob[12]),
      rejected: Number(rawJob.rejectVotes ?? rawJob[13]),
      escalated: Number(rawJob.escalateVotes ?? rawJob[14])
    },
    humanReviewed: Boolean(rawJob.humanReviewed ?? rawJob[15])
  };
}

export function createEvidenceHash(job, submissionUrl) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(
      JSON.stringify({
        jobId: job.id,
        requirements: job.requirements,
        submissionUrl: submissionUrl.trim()
      })
    )
  );
}

export function sameAddress(left, right) {
  return Boolean(left && right) && left.toLowerCase() === right.toLowerCase();
}

export function shortenAddress(address) {
  if (!address) {
    return "";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatStatusClass(statusLabel) {
  return String(statusLabel || "unknown").toLowerCase();
}

export function extractErrorMessage(error) {
  const customName = error?.revert?.name || error?.errorName || error?.data?.errorName;
  if (customName && CUSTOM_ERRORS[customName]) {
    return CUSTOM_ERRORS[customName];
  }

  if (error?.code === "ACTION_REJECTED" || error?.code === 4001) {
    return "Transaction rejected in wallet.";
  }

  const message =
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.message ||
    "Something went wrong.";

  for (const [name, friendlyMessage] of Object.entries(CUSTOM_ERRORS)) {
    if (message.includes(name)) {
      return friendlyMessage;
    }
  }

  if (message.includes("insufficient funds")) {
    return "This wallet does not have enough MON for the transaction.";
  }
  if (message.includes("user rejected")) {
    return "Transaction rejected in wallet.";
  }

  return message;
}
