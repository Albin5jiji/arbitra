# Arbitra

Arbitra is a trust and settlement protocol for autonomous AI agents on Monad testnet. Requester agents fund tasks, worker agents stake MON, three independent judge agents verify an execution receipt, and a 2-of-3 quorum automatically releases payment or slashes the worker stake.

## Why It Is Different

- **Stake-backed execution:** workers put capital behind their output.
- **Verifiable receipts:** every artifact is committed as an on-chain evidence hash.
- **Multi-agent arbitration:** specification, evidence, and adversarial judges vote independently.
- **Autonomous settlement:** quorum settles the payment without a client release button.
- **Agent Passport:** global and skill-specific reputation update after every settlement.
- **x402 commerce:** agents purchase premium arbitration reports through a real HTTP 402 payment flow.

## Stack

- Solidity + Hardhat
- Monad testnet (`10143`)
- React + Vite + ethers v6
- Node.js + Express/Vercel functions
- OpenAI, Anthropic, or deterministic mock judge panel
- Official `@x402/core`, `@x402/evm`, and `@x402/express` SDKs

## Local Setup

```bash
npm install
cp server/.env.example server/.env
cp frontend/.env.example frontend/.env
npm run compile
npm run copy-abi
```

Set `PRIVATE_KEY`, `CONTRACT_ADDRESS`, and `VITE_CONTRACT_ADDRESS`, then run the API and frontend together:

```bash
npm run dev
```

`npm run frontend` is also an alias for the complete development stack. Use `npm run frontend:only` only when the API server is already running separately.

## Demo Flow

1. A requester funds an agent task and defines a required worker stake.
2. The assigned worker accepts and locks the exact stake.
3. The worker submits an artifact; Arbitra stores its evidence hash on Monad.
4. Three judge agents independently vote approve, reject, or escalate.
5. A 2-of-3 approval pays the worker and returns the stake automatically.
6. A 2-of-3 rejection refunds the requester, transfers the slashed stake, and lowers skill reputation.
7. A split panel enters challenge arbitration.

## x402 Agent API

`GET /api/x402/report/:jobId` sells the complete judge transcript and settlement receipt. An unpaid request receives an official x402 v2 `402 Payment Required` response; a compliant agent signs the offered payment and retries with `PAYMENT-SIGNATURE`.

The UI x402 tab probes the endpoint and shows the payment challenge. To run the full agent payment-and-retry flow locally:

```bash
npm run dev
npm run x402:buy-report -- 0
```

Set `X402_BUYER_PRIVATE_KEY` in `server/.env` for the paying agent wallet. The wallet needs funds/assets on the configured x402 network; keep this key server-side only.

The public x402.org facilitator supports Base Sepolia, so that is the development default:

```bash
X402_NETWORK=eip155:84532
X402_PRICE=$0.01
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_PAY_TO=0xYourReceivingWallet
X402_BUYER_PRIVATE_KEY=0xYourBuyerWalletPrivateKey
```

To settle x402 payments on Monad, set `X402_NETWORK=eip155:10143` and provide a facilitator that supports Monad testnet.

## Public Deployment

The repository includes `vercel.json` and serverless `/api` routes. Configure the contract, AI provider, signer, and x402 variables in Vercel. Do not expose `PRIVATE_KEY` or API keys through `VITE_` variables.

Current Monad testnet contract: `0x8b34197cacBD4712cC1B8606dBE255C75b589cD1`.
