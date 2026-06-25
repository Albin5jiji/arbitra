const path = require("path");
const dotenv = require("dotenv");
const { x402Client } = require("@x402/core/client");
const { x402HTTPClient } = require("@x402/core/http");
const { registerExactEvmScheme } = require("@x402/evm/exact/client");
const { privateKeyToAccount } = require("viem/accounts");

dotenv.config({ path: path.join(__dirname, "../server/.env") });

const jobId = process.argv[2];
const baseUrl = (process.argv[3] || process.env.X402_AGENT_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const privateKey = normalizePrivateKey(process.env.X402_BUYER_PRIVATE_KEY || "");
const network = process.env.X402_NETWORK || "eip155:84532";
const rpcUrl = process.env.X402_RPC_URL || (network === "eip155:84532" ? "https://sepolia.base.org" : "");

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

async function main() {
  if (!jobId) {
    throw new Error("Usage: npm run x402:buy-report -- <jobId> [baseUrl]");
  }
  if (!privateKey) {
    throw new Error("Set X402_BUYER_PRIVATE_KEY in server/.env before buying a report.");
  }

  const account = privateKeyToAccount(privateKey);
  const coreClient = new x402Client();
  registerExactEvmScheme(coreClient, {
    signer: account,
    schemeOptions: rpcUrl ? { rpcUrl } : undefined
  });

  const client = new x402HTTPClient(coreClient);
  const url = `${baseUrl}/api/x402/report/${encodeURIComponent(jobId)}`;
  await assertReportExists(baseUrl, jobId);
  const firstResponse = await fetchJson(url);

  if (firstResponse.status !== 402) {
    printResult({
      url,
      buyer: account.address,
      status: firstResponse.status,
      paymentStatus: firstResponse.ok ? "none" : "failed",
      body: firstResponse.body
    });
    if (!firstResponse.ok) process.exit(1);
    return;
  }

  const paymentRequired = client.getPaymentRequiredResponse(
    (name) => firstResponse.headers.get(name),
    firstResponse.body
  );
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const paymentHeaders = client.encodePaymentSignatureHeader(paymentPayload);
  const paidResponse = await fetchJson(url, {
    headers: {
      Accept: "application/json",
      ...paymentHeaders
    }
  });

  let settlement = null;
  try {
    settlement = client.getPaymentSettleResponse((name) => paidResponse.headers.get(name));
  } catch (_error) {
    settlement = null;
  }

  printResult({
    url,
    buyer: account.address,
    status: paidResponse.status,
    paymentStatus: paidResponse.ok ? "settled" : "failed",
    settlement,
    report: paidResponse.body
  });

  if (!paidResponse.ok) process.exit(1);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_error) {
    body = text;
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    body
  };
}

async function assertReportExists(baseUrl, jobId) {
  const evaluationUrl = `${baseUrl}/api/evaluation/${encodeURIComponent(jobId)}`;
  const response = await fetchJson(evaluationUrl);
  if (!response.ok) {
    throw new Error(`Could not verify report availability before payment. ${JSON.stringify(response.body)}`);
  }
  if (!response.body?.evaluation) {
    throw new Error(`No arbitration report exists for task ${jobId}. Evaluate the task before buying the x402 report.`);
  }
}

function normalizePrivateKey(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}
