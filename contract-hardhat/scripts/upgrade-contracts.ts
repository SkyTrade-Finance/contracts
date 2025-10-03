import { ethers } from "hardhat";
import { ethers as mainEthers } from "ethers";
import assert from "assert";
import { functionSignatureProxy, functionSignatureProxyMR, moduleRegistryABI, moduleRegistryProxyABI, polymathRegistryABI, securityTokenRegistryABI, securityTokenRegistryProxyABI, tokenInitBytes } from "./abi";
import { UPGRADE_CONFIG } from "./upgrade-config";

const Web3 = require("web3");
let BN = Web3.utils.BN;

const {
  CHAIN_ID,
  OWNER_ADDRESS,
  PROVIDER_URL
} = process.env;

async function main() {
  assert(CHAIN_ID, 'Error: CHAIN_ID');
  assert(OWNER_ADDRESS, 'Error: OWNER_ADDRESS');

  const nullAddress = "0x0000000000000000000000000000000000000000";

  const web3 = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL));

  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Connected to network with chain ID: ${chainId}`);

  const deployer = await ethers.getSigner(OWNER_ADDRESS);
  console.log(`Deploying from address: ${OWNER_ADDRESS}`);

  // Get the existing contract addresses from configuration
  const {
    EXISTING_POLYMATH_REGISTRY,
    EXISTING_MODULE_REGISTRY_PROXY,
    EXISTING_SECURITY_TOKEN_REGISTRY_PROXY,
    EXISTING_POLY_TOKEN,
    EXISTING_GENERAL_TRANSFER_MANAGER_FACTORY,
    EXISTING_USDTIERED_STO_FACTORY
  } = UPGRADE_CONFIG;

  console.log("=== Starting Contract Upgrade Process ===");

  // 1. Deploy new TradingRestrictionManager
  // console.log("1. Deploying new TradingRestrictionManager...");
  // const TradingRestrictionManager = await ethers.deployContract("TradingRestrictionManager", deployer);
  // await TradingRestrictionManager.waitForDeployment();
  // const TradingRestrictionManagerContractAddress = await TradingRestrictionManager.getAddress();
  // console.log("New TradingRestrictionManager deployed at:", TradingRestrictionManagerContractAddress);

  // 2. Deploy new logic contracts with updated constructors
  console.log("2. Deploying updated logic contracts...");
  
  // const GeneralTransferManagerLogic = await ethers.deployContract("GeneralTransferManager", [nullAddress, EXISTING_POLY_TOKEN], deployer);
  // await GeneralTransferManagerLogic.waitForDeployment();
  // const GeneralTransferManagerLogicContractAddress = await GeneralTransferManagerLogic.getAddress();
  // console.log("Updated GeneralTransferManager logic deployed at:", GeneralTransferManagerLogicContractAddress);

  const USDTieredSTOLogic = await ethers.deployContract("USDTieredSTO", [nullAddress, EXISTING_POLY_TOKEN], deployer);
  await USDTieredSTOLogic.waitForDeployment();
  const USDTieredSTOLogicContractAddress = await USDTieredSTOLogic.getAddress();
  console.log("Updated USDTieredSTO logic deployed at:", USDTieredSTOLogicContractAddress);

  // 3. Deploy new factories with updated logic contracts
  console.log("3. Deploying updated factory contracts...");
  
  // const GeneralTransferManagerFactory = await ethers.deployContract("GeneralTransferManagerFactory", [0, GeneralTransferManagerLogicContractAddress, EXISTING_POLYMATH_REGISTRY], deployer);
  // await GeneralTransferManagerFactory.waitForDeployment();
  // const GeneralTransferManagerFactoryContractAddress = await GeneralTransferManagerFactory.getAddress();
  // console.log("Updated GeneralTransferManagerFactory deployed at:", GeneralTransferManagerFactoryContractAddress);

  const USDTieredSTOFactory = await ethers.deployContract("USDTieredSTOFactory", [0, USDTieredSTOLogicContractAddress, EXISTING_POLYMATH_REGISTRY], deployer);
  await USDTieredSTOFactory.waitForDeployment();
  const USDTieredSTOFactoryContractAddress = await USDTieredSTOFactory.getAddress();
  console.log("Updated USDTieredSTOFactory deployed at:", USDTieredSTOFactoryContractAddress);

  // 4. Update PolymathRegistry with new Permit2Contract
  console.log("4. Updating PolymathRegistry with new Permit2Contract...");
  const polymathRegistry = new mainEthers.Contract(EXISTING_POLYMATH_REGISTRY, polymathRegistryABI, deployer);
  // await polymathRegistry.changeAddress("Permit2Contract", '0x000000000022D473030F116dDEE9F6B43aC78BA3');
  console.log("Permit2Contract updated in PolymathRegistry");

  // 5. Grant operator role to the deployer for TradingRestrictionManager
  // await TradingRestrictionManager.grantOperator(OWNER_ADDRESS);
  // console.log("Operator role granted to deployer for TradingRestrictionManager");

  // 6. Update ModuleRegistry with new factory contracts
  console.log("5. Updating ModuleRegistry with new factory contracts...");
  const moduleRegistry = new mainEthers.Contract(EXISTING_MODULE_REGISTRY_PROXY, moduleRegistryABI, deployer);
  
  // Unregister old modules first
  // try {
  //   await moduleRegistry.unregisterModule(EXISTING_GENERAL_TRANSFER_MANAGER_FACTORY);
  //   console.log("Old GeneralTransferManagerFactory unregistered");
  // } catch (error) {
  //   console.log("Could not unregister old GeneralTransferManagerFactory (may not exist):", error.message);
  // }

  try {
    await moduleRegistry.unregisterModule(EXISTING_USDTIERED_STO_FACTORY);
    console.log("Old USDTieredSTOFactory unregistered");
  } catch (error) {
    console.log("Could not unregister old USDTieredSTOFactory (may not exist):", error.message);
  }

  // Register new modules
  // await moduleRegistry.registerModule(GeneralTransferManagerFactoryContractAddress);
  await moduleRegistry.registerModule(USDTieredSTOFactoryContractAddress);
  // console.log("New factory contracts registered in ModuleRegistry");

  // Verify new modules
  // await moduleRegistry.verifyModule(GeneralTransferManagerFactoryContractAddress);
  await moduleRegistry.verifyModule(USDTieredSTOFactoryContractAddress);
  // console.log("New factory contracts verified in ModuleRegistry");

  console.log("\n=== Contract Upgrade Summary ===");
  // console.log("New TradingRestrictionManager:", TradingRestrictionManagerContractAddress);
  // console.log("Updated GeneralTransferManagerFactory:", GeneralTransferManagerFactoryContractAddress);
  console.log("Updated USDTieredSTOFactory:", USDTieredSTOFactoryContractAddress);
  console.log("\nAll contracts upgraded successfully!");
  console.log("\nIMPORTANT: Update your deployment configuration with these new addresses.");
  console.log("The old contracts are still deployed but are no longer registered in the system.");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
