# PayGuard

**AI-assisted escrow for freelance work on Monad.**

PayGuard locks a client's MON in a smart contract, lets the assigned freelancer submit work, and uses an AI evaluator to compare the submission with the agreed requirements. Approved jobs can be paid out by the client; uncertain results are escalated to a human reviewer.

> **Demo software:** PayGuard runs on Monad testnet and has not been audited. Do not use it with real funds.

## Deployed Contract

Monad testnet:

```text
0x22b55701516A49fcD274aa4A07236b900387413b
```

- Chain ID: `10143`
- Currency: `MON`
- RPC: `https://testnet-rpc.monad.xyz`
- Faucet: `https://faucet.monad.xyz`

## How It Works

1. A client creates a job, assigns a freelancer, defines the acceptance criteria, and locks MON in escrow.
2. The assigned freelancer submits a URL or delivery summary on-chain.
3. The backend asks OpenAI, Anthropic, or the built-in mock evaluator for an `approved`, `rejected`, or `escalated` verdict.
4. The backend owner wallet records that verdict on-chain.
5. Escalated jobs are sent to the Reviewer portal for an owner decision.
6. After approval, the client releases the escrowed MON to the freelancer.

Funds remain in the contract until an approved job is explicitly released by its client.

## Stack

- Solidity `0.8.24` and Hardhat
- Monad testnet
- React, Vite, and ethers v6
- Node.js and Express
- OpenAI, Anthropic, or deterministic mock evaluation

## Prerequisites

- Node.js 20 or newer
- MetaMask or another EIP-1193 wallet
- Monad testnet MON for deployment and transactions
- A separate client and freelancer wallet for the full demo flow

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the backend environment file:

   ```bash
   cp server/.env.example server/.env
   ```

3. Add the contract-owner wallet to `server/.env`:

   ```dotenv
   MONAD_RPC_URL=https://testnet-rpc.monad.xyz
   CONTRACT_ADDRESS=0x22b55701516A49fcD274aa4A07236b900387413b
   PRIVATE_KEY=0xYourOwnerWalletPrivateKey
   AI_PROVIDER=mock
   ```

   The backend signer must own the deployed contract because AI verdicts and reviewer decisions are owner-only actions. Never commit this file or expose its private key to the frontend.

4. Create the frontend environment file:

   ```bash
   cp frontend/.env.example frontend/.env
   ```

5. Configure `frontend/.env`:

   ```dotenv
   VITE_CONTRACT_ADDRESS=0x22b55701516A49fcD274aa4A07236b900387413b
   VITE_API_BASE_URL=http://localhost:3001
   ```

6. Start the backend:

   ```bash
   npm run server
   ```

7. In another terminal, start the frontend:

   ```bash
   npm run frontend
   ```

8. Open `http://localhost:5173`.

The default `mock` provider needs no API key and is the quickest way to test the complete workflow.

## Deploying Your Own Contract

1. Set a funded Monad testnet wallet as `PRIVATE_KEY` in `server/.env`.

2. Compile and deploy:

   ```bash
   npm run compile
   npm run deploy:monad
   ```

3. Put the printed contract address in:

   ```dotenv
   # server/.env
   CONTRACT_ADDRESS=0xYourDeployedPayGuardAddress

   # frontend/.env
   VITE_CONTRACT_ADDRESS=0xYourDeployedPayGuardAddress
   ```

4. Copy the freshly compiled ABI to the backend and frontend:

   ```bash
   npm run copy-abi
   ```

5. Restart both applications.

## AI Providers

Use one provider configuration in `server/.env`.

### Mock

```dotenv
AI_PROVIDER=mock
```

The mock evaluator is deterministic and intended for local demos.

### OpenAI

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

### Anthropic

```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

## Demo Walkthrough

1. Connect the client wallet on Monad testnet.
2. Create a job, enter the freelancer wallet, and lock `0.01` MON.
3. Switch to the assigned freelancer wallet.
4. Submit a URL or concise work summary.
5. Wait for the backend to evaluate the work and record its verdict.
6. For an escalated result, connect the contract-owner wallet and decide from the Reviewer tab.
7. Switch back to the client wallet and release payment after approval.

## API

The local backend runs on `http://localhost:3001`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check backend, chain, contract, and provider configuration |
| `POST` | `/api/evaluate` | Evaluate a submission and record its verdict on-chain |
| `GET` | `/api/job/:jobId` | Read a normalized job and its saved evaluation |
| `GET` | `/api/evaluation/:jobId` | Read saved AI reasoning and confidence |

AI evaluation metadata is stored in `server/data/evaluations.json` for demo persistence.

## Project Structure

```text
contracts/       PayGuard smart contract
scripts/         Deployment and ABI-copy scripts
server/          Express API and AI evaluator
frontend/        React application
artifacts/       Hardhat build output
```

## Important Design Notes

- `createJob` uses `msg.value` as the escrow amount.
- Only the assigned freelancer can submit work.
- Only the contract owner can record AI or reviewer verdicts.
- Only the original client can release an approved payment.
- A rejected job currently has no refund or dispute path.
- The AI evaluates submitted text or URLs as strings; it does not fetch and inspect linked content.
- Evaluation storage is file-based and is not suitable for production or serverless persistence.

## Current Limitations

- Testnet-only and unaudited
- Centralized backend owner key
- No cancellation, refund, timeout, or appeal mechanism
- No production database or authentication
- No on-chain reputation system in the current contract
- No Vercel serverless routes in the current repository

## License

No license has been added yet. Add a `LICENSE` file before distributing or accepting outside contributions.
