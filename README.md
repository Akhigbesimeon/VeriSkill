# VeriSkill

VeriSkill is a gas-optimized blockchain credentialing protocol designed specifically for self-taught developers in Sub-Saharan Africa (starting with Kigali, Rwanda). This project aims to bridge the gap between untappped digital talent and employment opportunities by providing a scalable, affordable, and instantly verifiable credentialing system.

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
| :--- | :--- | :--- | :--- |
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
cd ../backend
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