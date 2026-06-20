const { Wallet } = require("ethers");
const { HTTPFacilitatorClient } = require("@x402/core/server");
const { ExactEvmScheme } = require("@x402/evm/exact/server");
const { paymentMiddleware, x402ResourceServer } = require("@x402/express");

const network = process.env.X402_NETWORK || "eip155:84532";
const price = process.env.X402_PRICE || "$0.01";
const facilitatorUrl = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
const payTo = resolvePayTo();

function resolvePayTo() {
  if (process.env.X402_PAY_TO) {
    return process.env.X402_PAY_TO;
  }
  if (process.env.PRIVATE_KEY) {
    try {
      return new Wallet(process.env.PRIVATE_KEY).address;
    } catch (_error) {
      return "";
    }
  }
  return "";
}

function getX402Config() {
  return {
    enabled: Boolean(payTo),
    protocol: "x402-v2",
    route: "/api/x402/report/:jobId",
    network,
    price,
    facilitatorUrl,
    payTo
  };
}

function createX402Middleware() {
  if (!payTo) {
    return null;
  }

  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(network, new ExactEvmScheme());

  return paymentMiddleware(
    {
      "GET /api/x402/report/*": {
        accepts: {
          scheme: "exact",
          price,
          network,
          payTo
        },
        description: "Machine-readable Arbitra judge transcript and on-chain execution receipt"
      }
    },
    resourceServer,
    undefined,
    undefined,
    true
  );
}

module.exports = { createX402Middleware, getX402Config };
