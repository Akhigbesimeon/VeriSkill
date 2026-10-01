import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Deploy VeriSkillCredential to the target network.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network localhost   (Phase 1 local)
 *   npx hardhat run scripts/deploy.ts --network testnet    (Phase 4 staging)
 *
 * Post-deploy, the script:
 *   1. Writes deployment info to packages/contracts/deployments/<network>.json
 *   2. Copies the contract ABI to packages/shared/src/abi/VeriSkillCredential.json
 *
 * Environment variables required (from .env):
 *   CONTRACT_ADMIN_ADDRESS — address that receives DEFAULT_ADMIN_ROLE + REVOKER_ROLE
 *   ISSUER_ADDRESS         — address that will be granted ISSUER_ROLE (backend account)
 *   UPDATER_ADDRESS        — address that will be granted UPDATER_ROLE (backend account)
 */

async function main() {
  const [deployer] = await ethers.getSigners()

  console.log('─────────────────────────────────────────────────────────────')
  console.log('VeriSkill Credential Deployment')
  console.log('─────────────────────────────────────────────────────────────')
  console.log(`Network:   ${network.name}`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`)

  // ── Resolve admin address ──────────────────────────────────────────────────
  // In local development the deployer acts as admin.
  // In staging/production CONTRACT_ADMIN_ADDRESS must be set explicitly.
  const adminAddress = process.env.CONTRACT_ADMIN_ADDRESS ?? deployer.address

  if (network.name !== 'hardhat' && network.name !== 'localhost' && !process.env.CONTRACT_ADMIN_ADDRESS) {
    throw new Error(
      'CONTRACT_ADMIN_ADDRESS must be set explicitly for non-local deployments. ' +
      'The deployer account should not retain admin rights in production.'
    )
  }

  console.log(`Admin:     ${adminAddress}`)
  console.log('')

  // ── Deploy ────────────────────────────────────────────────────────────────
  console.log('Deploying VeriSkillCredential...')
  const factory = await ethers.getContractFactory('VeriSkillCredential')
  const contract = await factory.deploy(adminAddress)
  await contract.waitForDeployment()

  const contractAddress = await contract.getAddress()
  const deployTx = contract.deploymentTransaction()
  const receipt  = await deployTx?.wait()

  console.log(`Deployed:  ${contractAddress}`)
  console.log(`Tx hash:   ${deployTx?.hash ?? 'n/a'}`)
  console.log(`Gas used:  ${receipt?.gasUsed?.toString() ?? 'n/a'}`)

  // ── Grant operational roles ───────────────────────────────────────────────
  // Grant ISSUER_ROLE and UPDATER_ROLE to the backend service account.
  // These env vars are optional — in local dev you can grant them manually.
  const ISSUER_ROLE  = ethers.keccak256(ethers.toUtf8Bytes('ISSUER_ROLE'))
  const UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('UPDATER_ROLE'))

  const adminSigner = deployer // In local dev deployer === admin
  // In non-local deployments, the admin key is separate — role grants are done manually.

  if (process.env.ISSUER_ADDRESS) {
    await (await contract.connect(adminSigner).grantRole(ISSUER_ROLE, process.env.ISSUER_ADDRESS)).wait()
    console.log(`ISSUER_ROLE granted to: ${process.env.ISSUER_ADDRESS}`)
  }
  if (process.env.UPDATER_ADDRESS) {
    await (await contract.connect(adminSigner).grantRole(UPDATER_ROLE, process.env.UPDATER_ADDRESS)).wait()
    console.log(`UPDATER_ROLE granted to: ${process.env.UPDATER_ADDRESS}`)
  }

  // ── Write deployment record ───────────────────────────────────────────────
  const deploymentDir = path.join(__dirname, '..', 'deployments')
  if (!fs.existsSync(deploymentDir)) fs.mkdirSync(deploymentDir, { recursive: true })

  const deploymentRecord = {
    network: network.name,
    contractName: 'VeriSkillCredential',
    address: contractAddress,
    admin: adminAddress,
    deployedAt: new Date().toISOString(),
    txHash: deployTx?.hash ?? null,
    gasUsed: receipt?.gasUsed?.toString() ?? null,
    compilerVersion: '0.8.24',
    evmVersion: 'cancun',
    optimizer: { enabled: true, runs: 200, viaIR: true },
  }

  const deploymentPath = path.join(deploymentDir, `${network.name}.json`)
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentRecord, null, 2))
  console.log(`\nDeployment record written to: ${deploymentPath}`)

  // ── Copy ABI to shared package ────────────────────────────────────────────
  // The ABI is consumed by the backend (for ethers.js contract calls) and
  // by the web app (for WalletConnect interactions in Phase 5).
  const artifactPath = path.join(
    __dirname, '..', 'artifacts', 'contracts',
    'VeriSkillCredential.sol', 'VeriSkillCredential.json'
  )

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
    const abiDir   = path.join(__dirname, '..', '..', 'shared', 'src', 'abi')
    if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true })

    // Write the full ABI array
    const abiOutPath = path.join(abiDir, 'VeriSkillCredential.json')
    fs.writeFileSync(abiOutPath, JSON.stringify(artifact.abi, null, 2))
    console.log(`ABI exported to:            ${abiOutPath}`)

    // Write a TypeScript re-export for type-safe usage in the backend
    const tsOutPath = path.join(abiDir, 'index.ts')
    const tsContent = `// Auto-generated by deploy.ts — do not edit manually.
// Re-run: cd packages/contracts && npm run deploy:local
import VeriSkillCredentialABI from './VeriSkillCredential.json'
export { VeriSkillCredentialABI }
export const CONTRACT_ADDRESS_${network.name.toUpperCase().replace(/-/g, '_')} = '${contractAddress}'
`
    fs.writeFileSync(tsOutPath, tsContent)
    console.log(`ABI TypeScript index written to: ${tsOutPath}`)
  } else {
    console.warn('WARNING: Artifact not found — ABI not exported. Run `npx hardhat compile` first.')
  }

  console.log('\n─────────────────────────────────────────────────────────────')
  console.log('Deployment complete.')
  console.log('Next steps:')
  console.log(`  1. Copy CONTRACT_ADDRESS to .env: ${contractAddress}`)
  console.log('  2. Set CONTRACT_ADMIN_ADDRESS in .env (for non-local deploys)')
  console.log('  3. Commit packages/shared/src/abi/ and packages/contracts/deployments/')
  console.log('─────────────────────────────────────────────────────────────')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
