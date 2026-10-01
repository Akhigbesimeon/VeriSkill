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

* **4-Layer Verification System:**

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

* **Smart Contracts:** Solidity ^0.8.20, Yul Assembly, Hardhat, OpenZeppelin, Ethers.js
* **Backend:** Node.js, Express.js, PostgreSQL, Sequelize (ORM), Web3.js, JWT
* **Web Frontend:** Next.js 14 (App Router), TypeScript, Chakra UI, TanStack Query
* **Mobile App:** Expo React Native
* **Infrastructure:** Vercel, AWS EC2/Heroku, AWS RDS (PostgreSQL)

## Project Structure

```text
veriskill/
│
├── apps/
│   ├── web/                        # Developer-facing web application
│   │   ├── src/
│   │   │   ├── assets/             # Static assets (icons, images)
│   │   │   ├── components/         # Shared UI components
│   │   │   ├── features/           # Feature-scoped modules
│   │   │   │   ├── auth/
│   │   │   │   ├── credentials/
│   │   │   │   ├── evidence/
│   │   │   │   ├── profile/
│   │   │   │   ├── verification/
│   │   │   │   └── wallet/
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   ├── lib/                # API client, utility functions
│   │   │   ├── pages/              # Route-level page components
│   │   │   ├── stores/             # Zustand state stores
│   │   │   ├── styles/             # Global styles, design tokens
│   │   │   └── types/              # Web-app-specific types
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── mobile/                     # Recruiter-facing mobile application
│   │   ├── src/
│   │   │   ├── components/         # Shared mobile UI components
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── scanner/
│   │   │   │   └── verification/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── navigation/         # Expo Router configuration
│   │   │   ├── screens/            # Screen-level components
│   │   │   ├── stores/
│   │   │   └── types/
│   │   ├── app/                    # Expo Router file-based routes
│   │   ├── assets/
│   │   ├── app.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── backend/                    # API server and verification engine
│       ├── src/
│       │   ├── config/             # Environment config, database config
│       │   ├── controllers/        # Express route controllers
│       │   ├── middleware/         # Auth, validation, rate-limit, error
│       │   ├── models/             # Sequelize models
│       │   ├── migrations/         # Sequelize migrations
│       │   ├── routes/             # Express router definitions
│       │   ├── services/           # Business logic
│       │   │   ├── auth/
│       │   │   ├── blockchain/     # Contract interaction
│       │   │   ├── credentials/
│       │   │   ├── evidence/
│       │   │   │   ├── url/        # URL verification pipeline
│       │   │   │   └── github/     # GitHub scanning
│       │   │   ├── peer-review/
│       │   │   ├── trust-score/    # Score calculation engine
│       │   │   └── notifications/
│       │   ├── jobs/               # Async job definitions (Bull)
│       │   ├── workers/            # Job queue workers
│       │   ├── utils/
│       │   └── types/
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── fixtures/
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── contracts/                  # Smart contract workspace
│   │   ├── contracts/
│   │   │   └── VeriSkillCredential.sol
│   │   ├── test/
│   │   │   └── VeriSkillCredential.test.ts
│   │   ├── scripts/
│   │   │   ├── deploy.ts
│   │   │   └── verify.ts
│   │   ├── artifacts/              # Compiled ABI and bytecode (gitignored)
│   │   ├── deployments/            # Deployment records per network
│   │   │   ├── localhost.json
│   │   │   └── testnet.json        # Added when testnet deploy happens
│   │   ├── hardhat.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/                     # Shared across all apps
│       ├── src/
│       │   ├── types/              # TypeScript types shared across apps
│       │   │   ├── credential.ts
│       │   │   ├── user.ts
│       │   │   ├── verification.ts
│       │   │   └── trust-score.ts
│       │   ├── constants/
│       │   │   ├── skills.ts       # Eight approved MVP skills
│       │   │   ├── layers.ts       # Six verification layers
│       │   │   └── providers.ts    # Tier 1 provider list
│       │   ├── schemas/            # Zod validation schemas
│       │   └── abi/                # Exported contract ABI
│       ├── tsconfig.json
│       └── package.json
│
├── .github/
│   └── workflows/
│       ├── contracts-test.yml      # Run contract tests on PR
│       ├── backend-test.yml        # Run backend tests on PR
│       └── lint.yml                # Lint all packages on PR
│
├── .env.example                    # All required env vars documented
├── .gitignore
├── .eslintrc.js                    # Root ESLint config
├── .prettierrc
├── package.json                    # Root workspace definition
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

* Access Control & Lifecycle Management
<img width="959" height="504" alt="Image" src="https://github.com/user-attachments/assets/0aea3a74-fdca-4bc0-a44e-55de6710b8d7" />

<img width="959" height="505" alt="Image" src="https://github.com/user-attachments/assets/0ff01600-fe0a-4dbc-bc60-81c354a7950e" />

## VeriSkillCredential Smart Contract Test Result (68 Passing)

<img width="959" height="503" alt="Image" src="https://github.com/user-attachments/assets/90404eaf-73ee-416d-969b-19625c7b083f" />

<img width="959" height="502" alt="Image" src="https://github.com/user-attachments/assets/bb68df52-d6eb-481a-b0b6-f51f61a3665a" />

<img width="959" height="503" alt="Image" src="https://github.com/user-attachments/assets/e0a71904-d573-430a-83ed-2d0949179146" />

<img width="959" height="503" alt="Image" src="https://github.com/user-attachments/assets/64e52242-425d-475f-b5ee-a25d8bae00dd" />

<img width="958" height="504" alt="Image" src="https://github.com/user-attachments/assets/7fc96263-933a-4cca-9c3c-bc8af3c72244" />



## Environment Setup and Installation

### Prerequisites

Make sure you have the following installed on your local machine:

* [Node.js](https://nodejs.org/) (v18+)
* [PostgreSQL](https://www.postgresql.org/) (or Docker for running a local DB container)
* [Expo CLI](https://docs.expo.dev/get-started/installation/)
* Git

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/veriskill.git
cd veriskill
```

### 2. Smart Contract Setup

```bash
cd packages/contracts
npm install
# Create a .env file and add your testnet RPC URL and private key
cp .env.example .env
# Compile contracts
npx hardhat compile
# Run local node
npx hardhat node
```

### 3. Backend Setup

```bash
cd ../../apps/backend
npm install
# Configure your .env file with DB credentials, JWT secret, GitHub API (Octokit) key, and RPC URL
cp .env.example .env
# Run database migrations
npx sequelize-cli db:migrate
# Start the backend server
npm run dev
```

### 4. Web Application (Next.js) Setup

```bash
cd ../web
npm install
# Configure .env with the Backend API URL
cp .env.local.example .env.local
# Start the web development server
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

## Deployment Plan

The deployment of VeriSkill is divided across multiple specialized hosting environments to ensure scalability and cost-effectiveness.

### Phase 1: Database Deployment

* **Platform:** AWS RDS (Relational Database Service)
* **Action:** Provision a managed PostgreSQL instance. Secure the database within a VPC and whitelist the backend server IP addresses.

### Phase 2: Smart Contract Deployment

* **Platform:** Ethereum Testnet (e.g., Sepolia) / Mainnet
* **Action:**
  1. Run unit tests and gas optimization benchmarks using Hardhat.
  2. Deploy the Yul-optimized Soulbound Token (SBT) contracts to the testnet.
  3. Verify the contracts on Etherscan for transparency.
  4. Update the contract addresses and ABIs in the Backend and Web application environment variables.

### Phase 3: Backend API Deployment

* **Platform:** AWS EC2 or Heroku
* **Action:**
  1. Containerize the Node.js/Express application using Docker.
  2. Deploy the container to the hosting provider.
  3. Set up environment variables (DB strings, Smart Contract addresses, Web3 RPCs, GitHub API keys).
  4. Ensure the API is served over HTTPS using SSL certificates.

### Phase 4: Web Application Deployment

* **Platform:** Vercel
* **Action:**
  1. Connect the Next.js GitHub repository to Vercel.
  2. Configure build commands and environment variables linking to the live Backend API.
  3. Deploy the application, enabling automated CI/CD for future commits to the `main` branch.

### Phase 5: Mobile Application Deployment

* **Platform:** Expo Application Services (EAS)
* **Action:**
  1. Build the Android (`.apk` / `.aab`) and iOS applications using EAS Build.
  2. Distribute the app to internal testers (the 5 local technical recruiters in Kigali) using EAS Submit or TestFlight/Google Play Console internal tracks.
