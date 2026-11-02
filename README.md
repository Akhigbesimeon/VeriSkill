# VeriSkill

**VeriSkill** is a blockchain credentialing protocol for self-taught developers in Sub-Saharan Africa, piloting in Kigali, Rwanda. Developers back a skill claim with evidence, the system builds trust in it across verification layers, and the credential is minted as a non-transferable (soulbound) token that recruiters can check by scanning a QR code.

Existing credentialing platforms are issuer-centric: an institution creates the credential and verification only confirms that the institution awarded it. Self-taught developers have no issuer. VeriSkill is learner-centric: the developer starts the credential, and trust comes from evidence, automated checks, peers and experts.

## Links

- **Technical report:** https://docs.google.com/document/d/1gQpLK8-hBcd5Wqkd7nOjYxKkEOTuM0TxYw7MYddSKhQ/edit?usp=sharing
- **Demo video:** https://drive.google.com/drive/folders/1UFPtMPk62hOIdYH7tRyplDnmSy5D4yUr?usp=sharing
- **Screenshots:** https://drive.google.com/drive/folders/11lCx1o6-KT_Y6Ds2GChPHuoOXjs4e00u?usp=sharing
- **Contract on Sepolia:** [`0x14032516c8e06CC0530b1BA8F9345B10315b5C4A`](https://sepolia.etherscan.io/address/0x14032516c8e06CC0530b1BA8F9345B10315b5C4A)

## How it works

1. **Claim:** a developer adds a skill on the web app.
2. **Evidence:** they submit direct verification links (e.g. a Coursera verify URL or POK credential page) and a GitHub repository. No certificate files are uploaded, so there are no PDFs to forge.
3. **Verify:** the backend validates the links, scans the repository, then assigns peer reviewers and, optionally, an expert.
4. **Mint:** once the credential reaches layer 4 (peer-verified), it can be minted as a soulbound token, with an Ethereum Attestation Service (EAS) attestation alongside it.
5. **Scan:** a recruiter scans the developer's QR code in the mobile app and sees the trust score and the evidence behind it.

## Verification layers and trust score

The trust score is calculated off-chain in real time (`apps/backend/src/services/trust-score.service.ts`). Each layer has a score band and a gate the credential must pass to enter it.

| Layer | Name | Score | Gate | Recruiter confidence |
| ----- | ---- | ----- | ---- | -------------------- |
| 1 | Self-declared | 0–10% | Credential exists | Low: consider with caution |
| 2 | Direct link verified | 20–40% | At least one valid evidence URL | Medium: review evidence |
| 3 | GitHub repo scanned | 40–60% | Completed scan with a skill match | Higher: system validated |
| 4 | Peer verified | 60–80% | ≥1 weighted peer approval | High: community trust |
| 5 | Community verified | 80–90% | ≥3 weighted peer approvals | Very high: community endorsed |
| 6 | Expert verified | 90–100% | Expert review with confidence ≥3 | Highest: expert validated |

The 10–20% band is deliberately unassigned. Sub-scores cannot push a credential into a higher band without passing that band's gate.

**Sub-scores.** Evidence URLs add up to 20 points (10 per tier-1 provider, 5 per tier-2). The GitHub scan adds up to 20 points from repository health and skill match, minus a penalty for forks. Peer reviews add up to 30 points, and expert review up to 25.

**Anti-collusion.** Peer reviewers are assigned by the system and must be at layer 3 or above. Each review is weighted:

| Condition | Weight |
| --------- | ------ |
| Normal review | 1.0 |
| Reviewer on the same network (ASN) as the developer, or more than one prior mutual review | 0.5 |
| Reviewer's IP hash matches the developer's (flagged to admins) | 0.0 |

IP addresses are stored only as SHA-256 hashes.

## Smart contracts

All contracts are in `packages/contracts/contracts/`.

### VeriSkillCredential (production)

An ERC-721 soulbound token with OpenZeppelin `AccessControl`, mirrored as an EAS attestation.

- **Non-transferable:** transfers, `approve` and `setApprovalForAll` revert with `NonTransferable()`.
- **Mint gate:** minting requires layer 4 or higher (`MIN_LAYER_TO_MINT = 4`).
- **Privacy:** only a `commitHash` of the evidence and a `skillId` are stored on-chain. No personal data or plain-text URLs go on-chain.
- **Storage packing:** layer, status and two timestamps share one 32-byte slot.
- **Interoperability:** each mint writes an EAS attestation, so apps outside VeriSkill can verify the credential. Revoking a credential also revokes its attestation.
- **Roles:** `ISSUER_ROLE` mints, `UPDATER_ROLE` updates layers, and `REVOKER_ROLE` suspends or revokes.

| Function | Purpose |
| -------- | ------- |
| `mintCredential(to, skillId, commitHash, layer)` | Issuer mints a credential |
| `mintWithVoucher(…, deadline, signature)` | Developer mints from their own wallet with an EIP-712 voucher signed by the backend. Nonces prevent replay. |
| `updateLayer(tokenId, newLayer, newCommitHash)` | Record a new verification layer on-chain |
| `suspendCredential` / `unsuspendCredential` | Reversible pause |
| `revokeCredential(tokenId)` | Permanent revocation, including the EAS attestation |
| `getCredential`, `getAttestationUid`, `isRevoked`, `totalMinted` | Read functions |

### Benchmark contracts (not deployed)

- **ReferenceERC721:** a naive baseline that stores each of the six credential fields in its own storage slot.
- **PackedERC721:** the same six fields in VeriSkill's packed 3-slot layout, without EAS. It isolates the storage saving from the EAS cost.

## Gas benchmark

Measured on a local Hardhat node (EVM target Cancun, `viaIR` on, optimizer 200 runs). Each figure is the steady-state cost of the third mint. See [`docs/GAS_BENCHMARK.md`](docs/GAS_BENCHMARK.md) for the full output.

| Comparison | Gas per mint | Difference |
| ---------- | -----------: | ---------- |
| ReferenceERC721 (6 unpacked slots) | 170,439 | Baseline |
| PackedERC721 (3 packed slots, no EAS) | 124,079 | **−27.20%** |
| VeriSkillCredential (packed + EAS attestation) | 412,977 | +142% vs baseline |

**How to read this.** Storage packing alone saves 27.2% per mint compared with the naive layout. The production contract costs more than the baseline because every mint also writes an EAS attestation. That is a deliberate trade-off for interoperability, not inefficiency. On Sepolia, gas has no real cost.

Lifecycle operations on an existing credential cost about 40,000 gas to update a layer, about 33,000 to suspend or unsuspend, and about 95,000 to revoke (including the EAS revocation).

## Tech stack

| Area | Tools |
| ---- | ----- |
| Smart contracts | Solidity 0.8.24, Hardhat, OpenZeppelin 5 (ERC721, AccessControl, EIP712), EAS contracts, Ethers v6, TypeChain |
| Backend | Node.js 20+, Express, PostgreSQL, Sequelize, Zod, JWT, BullMQ + Redis (job queues), MaxMind GeoIP2 (ASN lookup), GitHub GraphQL API |
| Web app (developers) | Vite + React 19, TypeScript, React Router, Zustand, TanStack Query, Axios, CSS Modules |
| Mobile app (recruiters) | Expo SDK 58, React Native 0.88, Expo Router, expo-camera, Zustand |
| Deployment | Render (API and worker), Supabase (PostgreSQL), Vercel (web), EAS Build (mobile), Ethereum Sepolia |

## Project structure

```text
veriskill/
├── apps/
│   ├── web/         # Developer web app (Vite + React)
│   ├── mobile/      # Recruiter app (Expo Router)
│   └── backend/     # Express API, verification engine, queue workers
│       ├── src/
│       │   ├── config/       # Env schema (Zod), Sequelize config
│       │   ├── jobs/         # BullMQ queue definitions
│       │   ├── middleware/   # Auth, errors, logging
│       │   ├── migrations/   # Sequelize migrations
│       │   ├── models/       # User, Credential, EvidenceUrl, GithubScan,
│       │   │                 # PeerReview, ExpertReview, TrustScoreHistory, AuditLog
│       │   ├── routes/       # auth, credentials, peer-reviews, expert-reviews,
│       │   │                 # admin, verify, internal
│       │   ├── services/     # Business logic (trust score, scans, blockchain…)
│       │   ├── server.ts     # API entry (registers queue workers in-process)
│       │   └── worker.ts     # Standalone worker entry
│       ├── sql/              # Supabase cron SQL
│       └── tests/            # unit/ and integration/
├── packages/
│   ├── contracts/   # Hardhat workspace: contracts, tests, deploy scripts
│   └── shared/      # Skills, layers, providers, Zod schemas, contract ABI
├── docs/
│   ├── GAS_BENCHMARK.md
│   └── KEY_ROTATION.md
├── render.yaml
└── .env.example
```

## API overview

All routes are under `/api/v1`.

| Prefix | Purpose |
| ------ | ------- |
| `/auth` | Register, log in, refresh tokens, reset passwords |
| `/credentials` | Create credentials, submit evidence URLs and GitHub repos, view trust-score history, mint (direct or by voucher) |
| `/peer-reviews` | Assigned reviews, review history, submit approve or flag |
| `/expert-reviews` | Expert review queue and submissions |
| `/admin` | User, credential and review administration |
| `/verify` | Public credential lookup (`GET /verify/:id`, used by QR links), plus recruiter search, saved candidates, activity and export |

`GET /health` is the health check.

## Getting started

### Prerequisites

- Node.js 20+ and npm 10+
- PostgreSQL 14+ (or Docker)
- Redis 6+ (required for the job queues)
- Git
- For the mobile app: Expo Go on a phone on the same network, or an Android/iOS emulator

### 1. Clone and install

```bash
git clone https://github.com/Akhigbesimeon/VeriSkill.git
cd VeriSkill
cp .env.example .env    # fill in the values below
npm install             # installs every workspace
```

All services read the **root `.env`**. The main variables:

| Variable | Used for |
| -------- | -------- |
| `DATABASE_URL`, `DATABASE_SSL` | PostgreSQL connection |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Authentication |
| `RPC_URL`, `CONTRACT_ADDRESS` | Blockchain connection |
| `ISSUER_PRIVATE_KEY`, `ADMIN_PRIVATE_KEY` | Server-side signing. Never expose these to a client. |
| `GITHUB_TOKEN` | Read-only fine-grained token for repository scans |
| `REDIS_URL` | BullMQ job queues |
| `URL_FETCH_*` | Limits for evidence-URL fetching |

### 2. Contracts

```bash
cd packages/contracts
npm run compile
npm run node            # local Hardhat node (separate terminal)
npm run deploy:local    # deploy to the local node
```

### 3. Backend

```bash
cd apps/backend
npm run migrate         # apply migrations to DATABASE_URL
npm run dev             # API with in-process queue workers
# Optional: run workers as a separate process instead
npm run dev:worker
```

### 4. Web app

```bash
cd apps/web
cp .env.example .env.local   # set VITE_API_URL
npm run dev
```

### 5. Mobile app

```bash
cd apps/mobile
cp .env.example .env
npx expo start
```

Scan the terminal QR code with Expo Go to open the recruiter app.

## Testing

```bash
# Contracts (Hardhat + Chai)
cd packages/contracts
npm test               # all contract tests
npm run bench          # gas benchmark only
npm run test:gas       # tests with gas-reporter table
npm run coverage       # solidity-coverage

# Backend (Jest + Supertest)
cd apps/backend
npm test                   # unit tests
npm run test:integration   # mint flow end to end; needs PostgreSQL + Redis
npm run test:coverage
```

Contract tests cover minting, voucher minting, roles, soulbound transfer blocking, lifecycle events and revocation. Backend unit tests cover the trust-score engine, URL verification, GitHub scanning, expert review and admin routes. The web and mobile apps have test runners configured but no test suites yet.

## Deployment

| Component | Platform | Notes |
| --------- | -------- | ----- |
| API and worker | Render (`render.yaml`, Frankfurt) | Auto-deploys from `main`; health check at `/health` |
| Database | Supabase | Use the pooled connection string for `DATABASE_URL` |
| Contracts | Ethereum Sepolia | `npm run deploy:testnet`, then update `CONTRACT_ADDRESS` and copy the ABI to `packages/shared/src/abi/` |
| Web app | Vercel | Build with `npm run build --workspace=apps/web`; output `dist/` |
| Mobile app | EAS Build | Distributed to pilot recruiters through internal test tracks |

Issuer-key rotation is documented in [`docs/KEY_ROTATION.md`](docs/KEY_ROTATION.md).

## Author

Akhigbe Simeon Olukayode, African Leadership University. Supervised by Thadee Gatera.
