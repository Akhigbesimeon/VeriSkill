import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import '@nomicfoundation/hardhat-network-helpers'
import '@typechain/hardhat'
import 'hardhat-gas-reporter'
import 'solidity-coverage'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env from the repo root
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const config: HardhatUserConfig = {
  solidity: {
    // Bumped to 0.8.29 to match the EAS contracts package, which pins exactly
    // 0.8.29 in its SchemaRegistry/EAS/EIP1271Verifier files. Our own sources
    // use caret-floor pragmas (^0.8.24), so they stay compatible.
    version: '0.8.29',
    settings: {
      // runs=10000 captures ~80% of the gains available from the Yul
      // optimizer's execution-cost tuning for this contract's mint hot
      // path (see docs/GAS_OPTIMIZATION.md § Phase B). Going higher
      // (1_000_000) saves only ~220 more gas per mint but noticeably
      // inflates deployment cost. Lowering to the Hardhat default of 200
      // costs ~900 extra gas per mint.
      optimizer: {
        enabled: true,
        runs: 10000,
      },
      evmVersion: 'cancun',
      // viaIR enables the Yul intermediate representation pipeline.
      // This allows cross-function optimizations the old pipeline cannot do,
      // particularly beneficial for the tight struct packing we are using.
      // Correctness is not affected; this is a compiler optimization flag.
      viaIR: true,
    },
  },

  networks: {
    // Local Hardhat node — Phase 1 development and testing
    hardhat: {
      chainId: 31337,
      // Pre-fund the deployer account for local testing
      accounts: {
        count: 10,
        accountsBalance: '10000000000000000000000', // 10,000 ETH per account
      },
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    // Sepolia — target testnet for the hybrid ERC721 + EAS resolver deployment.
    // EAS core addresses on Sepolia are consumed by scripts/deploy.ts via env.
    // Accounts entry is only populated when ISSUER_PRIVATE_KEY looks like a real
    // 32-byte hex key, so `hardhat compile` works with the .env placeholder.
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? '',
      chainId: 11155111,
      accounts: /^(0x)?[0-9a-fA-F]{64}$/.test(process.env.ISSUER_PRIVATE_KEY ?? '')
        ? [process.env.ISSUER_PRIVATE_KEY as string]
        : [],
    },
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    // outputFile: 'gas-report.txt',
    noColors: false,
  },

  // ABI and contract artifacts output location
  // Defaults to ./artifacts — consumed by packages/shared/src/abi/ after deployment
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },

  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
}

export default config
