# VeriSkill

**VeriSkill** is a gas-optimized blockchain credentialing protocol designed specifically for self-taught developers in Sub-Saharan Africa (starting with Kigali, Rwanda). This project aims to bridge the gap between untappped digital talent and employment opportunities by providing a scalable, affordable, and instantly verifiable credentialing system.

This project is based on the research and architectural design outlined in the proposal document: **Akhigbe Simeon_VeriSkill_Proposal_mission Capstone.docx.pdf**.

## Project Description

Traditional hiring relies heavily on institutional credentials, systematically excluding self-taught developers who acquire skills through non-formal channels (bootcamps, self-study, open-source). Existing blockchain solutions are often too expensive (high gas fees) and lack robust verification mechanisms.

VeriSkill addresses these issues through a dual-platform system:

1. **Web Application (Developers):** A Next.js dashboard where developers can mint credentials, submit direct verification links (e.g., Coursera Verify URLs), and submit GitHub repositories for automated analysis.

2. **Mobile Application (Recruiters):** An Expo React Native app featuring a QR-code scanner for instant (< 2 seconds) on-site credential verification and trust score display.

### Key Features

* **Gas-Optimized Smart Contracts:** Utilizes Yul-optimized Assembly within the Ethereum Virtual Machine (EVM) to significantly reduce the gas costs of minting non-transferable Soulbound Tokens (SBTs).

* **Main 4-Layer Verification System:**

  1. *Evidence Submission:* Direct verification links (eliminates PDF forgery).

  2. *Automated Verification:* Integration with GitHub API and GH-Repo-Analyzer for automated language, framework, and skill detection.

  3. *Peer Verification:* Community vouching.

  4. *Expert Review:* Admin panel verification.

#### Verification Layers and Trust Levels

The system calculates a dynamic Trust Score based on the completion of the verification layers to give recruiters a clear gradient of credential reliability:

| Layer | Action | Trust Score | Recruiter Confidence | 
| ----- | ----- | ----- | ----- | 
| 1 | Self-Declaration | 0-10% | Low - Consider with caution | 
| 2 | Direct Link Submitted (Certificate Verified) | 20-40% | Medium - Review evidence | 
| 3 | GitHub Repo Scanned (Languages Detected) | 40-60% | Higher - System validated | 
| 4 | Peer Verified (1-2 peers) | 60-80% | High - Community trust | 
| 5 | Community Verified (3+ peers) | 80-90% | Very High - Community endorsed | 
| 6 | Expert Verified | 90-100% | Highest - Expert validated | 


## Tech Stack

* **Smart Contracts:** Solidity ^0.8.24, Hardhat, OpenZeppelin AccessControl + ERC721, Ethereum Attestation Service (EAS), Ethers v6, TypeChain
* **Backend:** Node.js, Express, PostgreSQL, Sequelize (ORM), Ethers v6, JWT, Bull (Redis-backed job queues)
* **Web Frontend:** Vite + React, TypeScript, React Router, CSS Modules, Zustand, TanStack Query, Zod, Axios
* **Mobile App:** Expo (React Native) with Expo Router
* **Deployment:** Render.com (API + worker), Supabase (managed PostgreSQL), Vercel (web app), EAS Build (mobile binary)

## Project Structure

```text
veriskill/
│
├── apps/
│   ├── web/                        # Developer-facing web app (Vite + React)
│   │   ├── src/
│   │   │   ├── components/         # UI primitives, layout, wallet widgets
│   │   │   │   ├── layout/
│   │   │   │   ├── ui/
│   │   │   │   └── wallet/
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   ├── lib/                # API client, formatters, credential helpers
│   │   │   ├── pages/              # Route components (React Router) + co-located CSS modules
│   │   │   ├── store/              # Zustand stores
│   │   │   ├── styles/             # Global styles, design tokens
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── index.css
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── vercel.json
│   │   ├── tsconfig.json
│   │   ├── .env.example
│   │   └── package.json
│   │
│   ├── mobile/                     # Recruiter-facing app (Expo + Expo Router)
│   │   ├── app/                    # File-based routes
│   │   │   ├── (app)/
│   │   │   ├── (auth)/
│   │   │   ├── _layout.tsx
│   │   │   └── index.tsx
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   ├── stores/
│   │   │   └── theme/
│   │   ├── app.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── backend/                    # API server + verification engine
│       ├── src/
│       │   ├── config/             # Env schema (Zod), Sequelize config
│       │   ├── middleware/         # auth, error, logger
│       │   ├── migrations/         # Sequelize migrations
│       │   ├── models/             # Sequelize models (User, Credential, …)
│       │   ├── routes/             # Express routers (admin, auth, credential, …)
│       │   ├── services/           # Business logic (flat `*.service.ts` files)
│       │   │   ├── auth.service.ts
│       │   │   ├── blockchain.service.ts
│       │   │   ├── credential.service.ts
│       │   │   ├── expert-review.service.ts
│       │   │   ├── github-scan.service.ts
│       │   │   ├── mailer.service.ts
│       │   │   ├── peer-review.service.ts
│       │   │   ├── trust-score.service.ts
│       │   │   └── url-verification.service.ts
│       │   ├── jobs/               # Bull queue definitions
│       │   ├── seeders/            # Sequelize seeders
│       │   ├── types/              # Express request augmentations
│       │   ├── app.ts              # Express app wiring
│       │   ├── server.ts           # API process entry
│       │   └── worker.ts           # Separate worker process entry
│       ├── sql/                    # Out-of-band SQL (e.g. supabase-cron.sql)
│       ├── tests/
│       │   ├── unit/
│       │   └── integration/        # Mint-flow end-to-end test
│       ├── jest.config.js
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── contracts/                  # Hardhat workspace
│   │   ├── contracts/
│   │   │   ├── VeriSkillCredential.sol   # Soulbound credential (production)
│   │   │   ├── ReferenceERC721.sol       # Naive baseline for gas benchmark
│   │   │   └── VeriSkillResolver.sol
│   │   ├── test/
│   │   │   ├── VeriSkillCredential.test.ts
│   │   │   └── GasBenchmark.test.ts
│   │   ├── scripts/                # deploy.ts, verify.ts
│   │   ├── deployments/            # Deployment records per network
│   │   ├── typechain-types/        # Generated contract typings
│   │   ├── artifacts/              # Compiled ABI + bytecode (gitignored)
│   │   ├── hardhat.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/                     # Code shared across workspaces
│       ├── src/
│       │   ├── constants/
│       │   │   ├── skills.ts       # 23 approved skills (matches DB enum)
│       │   │   ├── layers.ts       # Six verification layers
│       │   │   └── providers.ts    # Tier-1 provider list
│       │   ├── schemas/            # Zod validation schemas (types inferred via `z.infer`)
│       │   ├── abi/                # Contract ABI exported by the deploy script
│       │   └── index.ts            # Barrel export
│       ├── tsconfig.json
│       └── package.json
│
├── docs/
│   └── KEY_ROTATION.md             # Issuer-key rotation procedure
│
├── render.yaml                     # Render deploy spec (API + worker)
├── .env.example                    # Root env template
├── .gitignore
├── .eslintrc.js
├── .prettierrc
├── package.json                    # npm workspaces root
└── README.md
```
## Smart Contracts Architecture

VeriSkill utilizes two distinct smart contracts during its development and testing lifecycle to prove its gas-optimization thesis. 

### 1. VeriSkillCredential (Production Contract)

**Functionality:** This is the core protocol contract. It acts as a non-transferable (Soulbound) Token representing a developer's verified skill claim. 
* **Gas Optimized:** It utilizes tight struct packing to compress credential data into exactly 3 storage slots (compared to 7 in a standard implementation).
* **Privacy Preserving:** It stores a cryptographic `commitHash` rather than raw PII (Personally Identifiable Information) or plain-text URLs on-chain.
* **Access Control:** It uses OpenZeppelin's `AccessControl` for granular role management (`ISSUER_ROLE`, `UPDATER_ROLE`, `REVOKER_ROLE`).
* **Immutability:** Overrides transfer functions to prevent tokens from being sold or moved, securing them to the original developer's wallet forever.

### 2. ReferenceERC721 (Benchmarking Contract)

**Functionality:** This is a naive reference implementation designed strictly for testing and gas comparison against `VeriSkillCredential`. **It is not used in production.**
* **Purpose:** Acts as a baseline to empirically prove the minimum 30% gas reduction requirement targeted by the project.
* **Mechanism:** It intentionally uses separate `mapping(uint256 => uint256)` data structures for every single variable (Layer, Status, IssuedAt, etc.). This mimics a standard, unoptimized smart contract, requiring 7 expensive cold-storage writes during minting, compared to VeriSkill's 4.

## VeriSkillCredential Smart Contract Code Snippets 

* **Enforcing the Soulbound Standard**
<img width="959" height="505" alt="Image" src="https://github.com/user-attachments/assets/a4cd9c83-3dc3-436f-847a-808f48bb1eeb" />

* **Low-Level Gas Optimization (The 30% Benchmark)**
<img width="959" height="283" alt="Image" src="https://github.com/user-attachments/assets/872e6d04-061a-4656-a873-892a39958e13" />

<img width="959" height="503" alt="Image" src="https://github.com/user-attachments/assets/e2dbf40b-f629-4a1c-a7b5-0df1399fd4a0" />

* **Cryptographic Commitments & Privacy**
<img width="959" height="504" alt="Image" src="https://github.com/user-attachments/assets/524fa54e-89ae-4ce2-9231-867679fed50b" />

* **Access Control & Lifecycle Management**
<img width="959" height="504" alt="Image" src="https://github.com/user-attachments/assets/0aea3a74-fdca-4bc0-a44e-55de6710b8d7" />

<img width="959" height="505" alt="Image" src="https://github.com/user-attachments/assets/0ff01600-fe0a-4dbc-bc60-81c354a7950e" />

## VeriSkillCredential Smart Contract Test Result (68 Passing)

<img width="959" height="503" alt="Image" src="https://github.com/user-attachments/assets/90404eaf-73ee-416d-969b-19625c7b083f" />

<img width="959" height="502" alt="Image" src="https://github.com/user-attachments/assets/bb68df52-d6eb-481a-b0b6-f51f61a3665a" />

<img width="959" height="503" alt="Image" src="https://github.com/user-attachments/assets/e0a71904-d573-430a-83ed-2d0949179146" />

<img width="959" height="503" alt="Image" src="https://github.com/user-attachments/assets/64e52242-425d-475f-b5ee-a25d8bae00dd" />

<img width="958" height="504" alt="Image" src="https://github.com/user-attachments/assets/7fc96263-933a-4cca-9c3c-bc8af3c72244" />

## Data visualization
### 1. Transaction & Commitment Graph (VeriSkill Minting Flow)
This structural graph visualizes how raw off-chain transaction data is organized, hashed, and securely recorded into a block using cryptographic linking. A Merkle Tree data structure produces a single digital fingerprint of all transactions within a block to efficiently verify integrity. In the context of your capstone, this maps the generation of the `commitHash` and its anchoring to the blockchain ledger.

<img width="860" height="890" alt="Image" src="https://github.com/user-attachments/assets/a626f9fd-f32d-479a-b21a-1dc89d48d13c" />

### 2. Consensus Algorithm Flow (Block Validation)
Consensus mechanisms allow network participants to agree on a valid transaction ledger despite potential adversarial actions or node failures. For EVM-compatible networks, Proof of Stake (PoS) algorithms randomly assign validators based on their stake value to propose and validate new blocks.

<img width="860" height="1179" alt="Image" src="https://github.com/user-attachments/assets/75952812-6ca7-47a7-804c-e3d9464fb663" />

## Environment Setup and Installation

### Prerequisites

Make sure you have the following installed on your local machine:

* [Node.js](https://nodejs.org/) **v20+** and npm **v10+** (enforced via `engines` in the root `package.json`)
* [PostgreSQL](https://www.postgresql.org/) **v14+** (or Docker for running a local DB container)
* [Redis](https://redis.io/) **v6+** — required by the Bull queue worker (`apps/backend` worker process will not start without it)
* [Expo CLI](https://docs.expo.dev/get-started/installation/) — optional; the install steps below use `npx expo`, which pulls the CLI on demand
* Git

**Hardware:** ~8 GB RAM and ~10 GB free disk recommended for a full dev install (web + mobile + backend + Hardhat node + Postgres + Redis). To exercise the mobile recruiter flow you need a physical Android/iOS device with the Expo Go app on the same Wi-Fi network, or a running Android/iOS emulator.

**Supported OS:** Windows 10+, macOS 12+, and modern Linux distributions. All framework and library versions are pinned in each workspace's `package.json` — Solidity `^0.8.24`, Hardhat `^2.22`, Ethers `^6.13`, Express `^4.19`, Sequelize `^6.37`, Bull `^4.12`, React `^19.1`, Vite `^5.4`, Expo SDK `~57.0`, React Native `0.86.3`, TypeScript `^5.5+`.

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/veriskill.git
cd veriskill
```

The repo is an npm workspaces monorepo — run `npm install` once at the root to install every workspace, then start each process from its own directory. All services read environment variables from the **root `.env`**, which you create by copying `.env.example` at the repo root.

```bash
cp .env.example .env
npm install
```

### 2. Smart Contract Setup

```bash
cd packages/contracts
# Compile contracts (uses the root .env for RPC_URL / keys)
npx hardhat compile
# Start a local node in another terminal
npx hardhat node
# Deploy to the running local node
npx hardhat run scripts/deploy.ts --network localhost
```

### 3. Backend Setup

```bash
cd apps/backend
# Run database migrations against the DB configured in the root .env
npx sequelize-cli db:migrate
# Start the API process
npm run dev
# In a second terminal, start the queue worker process
npm run dev:worker
```

### 4. Web Application Setup

```bash
cd apps/web
# The web app has its own .env.example — copy it for client-side vars (API URL etc.)
cp .env.example .env.local
# Start the Vite dev server
npm run dev
```

### 5. Mobile Application (Expo) Setup

```bash
cd ../mobile
npm install
# Start the Expo bundler
npx expo start
```

Scan the QR code generated in the terminal using the Expo Go app on your physical mobile device to test the recruiter interface.

## Testing

Automated tests cover the smart contracts and the backend. The web and mobile apps have Vitest / Jest configured but no suites yet.

### Smart contracts (Hardhat + Chai)

Located in `packages/contracts/test/`:

* **`VeriSkillCredential.test.ts`** — 68 unit tests covering mint, access control (`ISSUER_ROLE` / `UPDATER_ROLE` / `REVOKER_ROLE`), soulbound transfer blocking, commit-hash privacy, lifecycle events, and revocation.
* **`GasBenchmark.test.ts`** — gas benchmark comparing `VeriSkillCredential` against the naive `ReferenceERC721`, asserting the ≥30 % gas reduction target.

```bash
cd packages/contracts
npm test              # run all contract tests
npm run bench         # gas benchmark only
npm run test:gas      # all tests with the hardhat-gas-reporter table
npm run coverage      # solidity-coverage report
```

### Backend (Jest + Supertest)

Located in `apps/backend/tests/`:

* **Unit (`tests/unit/`)** — route and service tests for `admin.routes`, `expert-review.service`, `github-scan.service`, `trust-score.service`, and `url-verification.service`. No external services needed.
* **Integration (`tests/integration/mint-flow.test.ts`)** — end-to-end credential mint flow against a real database and queue. **Requires PostgreSQL and Redis to be running** with migrations applied against the test DB.

```bash
cd apps/backend
npm test                   # unit tests only (integration ignored)
npm run test:integration   # requires Postgres + Redis
npm run test:coverage      # unit tests with coverage report
```

### Running everything from the root

```bash
npm run test:contracts     # Hardhat suite
npm run test:backend       # backend unit tests
```

Integration tests are deliberately **not** wired into `npm run test:backend` so a missing Redis container doesn't break the default `test` command.

## Deployment

The project ships across four platforms, one per workload.

### Backend API + worker — Render.com

Everything the backend needs ships via `render.yaml` at the repo root:

* `veriskill-backend` — Node web service in `frankfurt`, auto-deploys from `main`, exposes `/health`.
* `veriskill-worker` — Separate background worker running `start:worker`, so a worker crash cannot take the API down.
* Both services share the same build command (`npm run build --workspace=apps/backend`) and read the same env vars (DB URL, RPC URL, `ISSUER_PRIVATE_KEY`, etc.).

### Database — Supabase (managed PostgreSQL)

1. Create a Supabase project; copy the pooled connection string into `DATABASE_URL` on both Render services.
2. Run `npx sequelize-cli db:migrate` against it from a workstation (or via a one-off Render job).
3. Use Supabase's connection pooler endpoint — Render spins workers up and down, so per-connection Postgres is wasteful.

### Smart contracts — Ethereum (Sepolia → mainnet)

1. Run unit tests and gas benchmarks (`GasBenchmark.test.ts`) under Hardhat.
2. Deploy `VeriSkillCredential` to Sepolia via `scripts/deploy.ts`.
3. Verify on Etherscan for transparency.
4. Update `CONTRACT_ADDRESS` in backend/web env and copy the ABI into `packages/shared/src/abi/`.

### Web app — Vercel

1. Connect the GitHub repo and configure the Vite build (`npm run build --workspace=apps/web`, output `dist/`).
2. Set `VITE_API_URL` and other client env vars.
3. Enable preview deploys per PR.

### Mobile app — Expo Application Services (EAS)

1. `eas build` the Android (`.apk` / `.aab`) and iOS binaries.
2. Distribute to the five pilot recruiters via internal tracks (TestFlight / Play Console internal testing).

### Operations

* **Issuer-key rotation:** see [`docs/KEY_ROTATION.md`](docs/KEY_ROTATION.md). Covers both scheduled and emergency rotation against `ISSUER_ROLE` on the deployed contract.
