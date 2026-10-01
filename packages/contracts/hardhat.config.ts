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
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
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
    // Testnet — only configured after Phase 1 local tests pass
    // testnet: {
    //   url: process.env.RPC_URL || '',
    //   accounts: process.env.ISSUER_PRIVATE_KEY ? [process.env.ISSUER_PRIVATE_KEY] : [],
    // },
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
