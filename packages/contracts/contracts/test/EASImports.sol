// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Compile-only anchor: forces Hardhat to pull the concrete EAS core and
// SchemaRegistry contracts into artifacts/ so test fixtures and deploy.ts
// can getContractFactory() them locally. This file is never deployed on its own.
import { EAS } from "@ethereum-attestation-service/eas-contracts/contracts/EAS.sol";
import { SchemaRegistry } from "@ethereum-attestation-service/eas-contracts/contracts/SchemaRegistry.sol";
