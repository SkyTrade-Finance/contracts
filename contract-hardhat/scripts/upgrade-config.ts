// Configuration file for contract upgrade
// Replace the placeholder addresses with your actual deployed contract addresses on Monad testnet

export const UPGRADE_CONFIG = {
  // Core registry contracts
  EXISTING_POLYMATH_REGISTRY: "0x38f0FEEDD4Cd1985A13b5102A8d805BcA3966420", // Your deployed PolymathRegistry address
  EXISTING_MODULE_REGISTRY_PROXY: "0xb90Dc58d4524270Db06e39548376928b81182AC5", // Your deployed ModuleRegistryProxy address
  EXISTING_SECURITY_TOKEN_REGISTRY_PROXY: "0x24D35199248b3323Dd9FFdD27Aab0A3Bcd48483E", // Your deployed SecurityTokenRegistryProxy address
  
  // Token contracts
  EXISTING_POLY_TOKEN: "0x3c731772fb30D163432Bb51A7535ffD9AA7e88C3", // Your deployed PolyToken address
  
  // Factory contracts to be replaced
  EXISTING_GENERAL_TRANSFER_MANAGER_FACTORY: "0x25CfceA12a742488DCcBeBcb2E80C424F3c9a19B", // Your deployed GeneralTransferManagerFactory address
  EXISTING_USDTIERED_STO_FACTORY: "0xF41DC8e89122E40087cAf67387dE34ff2551796d", // Your deployed USDTieredSTOFactory address
  
  // Network configuration
  CHAIN_ID: "5000", // Monad testnet
  PROVIDER_URL: "=https://rpc.mantle.xyz",
  
  // Deployer configuration
  OWNER_ADDRESS: "", // Your deployer address
  OWNER_PRIVATE_KEY: "" // Your private key
};

// Instructions:
// 1. Copy this file to upgrade-config.ts
// 2. Replace all "0x..." placeholders with your actual deployed contract addresses
// 3. Update the OWNER_ADDRESS and OWNER_PRIVATE_KEY if different
// 4. Run the upgrade script: npx hardhat run scripts/upgrade-contracts.ts --network monadTestnet
// 4. Run the upgrade script: npx hardhat run scripts/upgrade-contracts.ts --network mantleMainnet
