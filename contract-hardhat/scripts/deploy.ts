import { ethers } from "hardhat";
import { ethers as mainEthers } from "ethers";
import assert from "assert";
import { functionSignatureProxy, functionSignatureProxyMR, moduleRegistryABI, moduleRegistryProxyABI, polymathRegistryABI, securityTokenRegistryABI, securityTokenRegistryProxyABI, tokenInitBytes } from "./abi";

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
  // assert(BigInt(CHAIN_ID!) === chainId, `${CHAIN_ID} !== ${chainId}; wrong .env config?`);

  const deployer = await ethers.getSigner(OWNER_ADDRESS);

  const PolymathRegistry = await ethers.deployContract("PolymathRegistry", deployer);
  await PolymathRegistry.waitForDeployment();
  // @ts-ignore
  const PolymathRegistryContractAddress = await PolymathRegistry.getAddress();
  console.log({ PolymathRegistryContractAddress })

  const Permit2 = await ethers.deployContract("Permit2", deployer);
  await Permit2.waitForDeployment();
  const permit2ContractAddress = await Permit2.getAddress();
  console.log({ permit2ContractAddress }, "permit2ContractAddress");

  const ModuleRegistry = await ethers.deployContract("ModuleRegistry", deployer);
  await ModuleRegistry.waitForDeployment();
  const ModuleRegistryContractAddress = await ModuleRegistry.getAddress();

  console.log({ ModuleRegistryContractAddress })

  const PolyTokenFaucet = await ethers.deployContract("PolyTokenFaucet", deployer);
  await PolyTokenFaucet.waitForDeployment();
  const PolyTokenFaucetContractAddress = await PolyTokenFaucet.getAddress();

  console.log({PolyTokenFaucetContractAddress})

  const TradingRestrictionManager = await ethers.deployContract("TradingRestrictionManager", deployer);
  await TradingRestrictionManager.waitForDeployment();
  const TradingRestrictionManagerContractAddress = await TradingRestrictionManager.getAddress();

  console.log({ TradingRestrictionManagerContractAddress })

  const paddedPOLY = ethers.zeroPadValue(web3.utils.fromAscii("POLY"), 32)
  const paddedUSD = ethers.zeroPadValue(web3.utils.fromAscii("USD"), 32)
  const paddedETH = ethers.zeroPadValue(web3.utils.fromAscii("ETH"), 32)

  console.log({
    paddedPOLY,
    paddedUSD,
    paddedETH
  })

  const PolyMockOracle = await ethers.deployContract("MockOracle", [PolyTokenFaucetContractAddress, paddedPOLY, paddedUSD, "50000000000000000000"], deployer);
  await PolyMockOracle.waitForDeployment();
  const PolyMockOracleContractAddress = await PolyMockOracle.getAddress();

  console.log({PolyMockOracleContractAddress})

  const StableOracle = await ethers.deployContract("StableOracle",[PolyMockOracleContractAddress, "10000000000000000"], deployer);
  await StableOracle.waitForDeployment();
  const StableOracleContractAddress = await StableOracle.getAddress();

  console.log({StableOracleContractAddress})

  const ETHOracle = await ethers.deployContract("MockOracle",[nullAddress, paddedETH, paddedUSD, "500000000000000000000"], deployer);
  await ETHOracle.waitForDeployment();
  const ETHOracleContractAddress = await ETHOracle.getAddress();

  console.log({ETHOracleContractAddress})


  const PolyToken = PolyTokenFaucetContractAddress
  const PolymathAccount = OWNER_ADDRESS;


  // // Connect to the deployed contract using its address and ABI
  const polymathRegistry = new mainEthers.Contract(PolymathRegistryContractAddress, polymathRegistryABI, deployer);

  
  await polymathRegistry.changeAddress("PolyToken", PolyToken)

  // Set Permit2Contract in PolymathRegistry
  await polymathRegistry.changeAddress("Permit2Contract", permit2ContractAddress);
  console.log("Permit2Contract registered in PolymathRegistry with address:", permit2ContractAddress);

  // Set TradingRestrictionManager in PolymathRegistry
  await polymathRegistry.changeAddress("TradingRestrictionManager", TradingRestrictionManagerContractAddress);
  console.log("TradingRestrictionManager registered in PolymathRegistry");

  // Grant operator role to the deployer for TradingRestrictionManager
  await TradingRestrictionManager.grantOperator(OWNER_ADDRESS);
  console.log("Operator role granted to deployer for TradingRestrictionManager");

  const TokenLib = await ethers.deployContract("TokenLib", deployer);
  await TokenLib.waitForDeployment();
  const TokenLibContractAddress = await TokenLib.getAddress();

  console.log({ TokenLibContractAddress })


  const ModuleRegistryProxy = await ethers.deployContract("ModuleRegistryProxy", deployer);
  await ModuleRegistryProxy.waitForDeployment();
  const ModuleRegistryProxyContractAddress = await ModuleRegistryProxy.getAddress();

  console.log({ ModuleRegistryProxyContractAddress })
  
  const moduleRegistryProxy = new mainEthers.Contract(ModuleRegistryProxyContractAddress, moduleRegistryProxyABI, deployer);

  let bytesProxyMR = web3.eth.abi.encodeFunctionCall(functionSignatureProxyMR, [PolymathRegistryContractAddress, PolymathAccount]);
  await moduleRegistryProxy.upgradeToAndCall("1.0.0", ModuleRegistryContractAddress, bytesProxyMR, { from: PolymathAccount });
  
  await polymathRegistry.changeAddress("ModuleRegistry", ModuleRegistryProxyContractAddress, { from: PolymathAccount });
  
  const GeneralTransferManagerLogic = await ethers.deployContract("GeneralTransferManager", [nullAddress, nullAddress,], deployer);
  await GeneralTransferManagerLogic.waitForDeployment();
  const GeneralTransferManagerLogicContractAddress = await GeneralTransferManagerLogic.getAddress();
  console.log({ GeneralTransferManagerLogicContractAddress })

  const ERC20DividendCheckpointLogic = await ethers.deployContract("ERC20DividendCheckpoint", [nullAddress, nullAddress,], deployer);
  await ERC20DividendCheckpointLogic.waitForDeployment();
  const ERC20DividendCheckpointLogicContractAddress = await ERC20DividendCheckpointLogic.getAddress();
  console.log({ ERC20DividendCheckpointLogicContractAddress })

  const EtherDividendCheckpointLogic = await ethers.deployContract("EtherDividendCheckpoint", [nullAddress, nullAddress,], deployer);
  await EtherDividendCheckpointLogic.waitForDeployment();
  const EtherDividendCheckpointLogicContractAddress = await EtherDividendCheckpointLogic.getAddress();
  console.log({ EtherDividendCheckpointLogicContractAddress })

  const USDTieredSTOLogic = await ethers.deployContract("USDTieredSTO", [nullAddress, nullAddress,], deployer);
  await USDTieredSTOLogic.waitForDeployment();
  const USDTieredSTOLogicContractAddress = await USDTieredSTOLogic.getAddress();
  console.log({ USDTieredSTOLogicContractAddress })

  
  const DataStoreLogic = await ethers.deployContract("DataStore", deployer);
  await DataStoreLogic.waitForDeployment();

  // @ts-ignore
  const DataStoreLogicContractAddress = await DataStoreLogic.getAddress();
  console.log({DataStoreLogicContractAddress})

  const SecurityTokenLogic= await ethers.getContractFactory("SecurityToken",  { 
    signer: deployer, 
    libraries: { 
      TokenLib: TokenLibContractAddress
    } 
  });
  const securityTokenLogic = await SecurityTokenLogic.deploy();
  const SecurityTokenLogicContractAddress = await securityTokenLogic.getAddress();
  console.log({SecurityTokenLogicContractAddress})

  const DataStoreFactory = await ethers.deployContract("DataStoreFactory", [DataStoreLogicContractAddress], deployer);
  await DataStoreFactory.waitForDeployment();
  const DataStoreFactoryContractAddress = await DataStoreFactory.getAddress();
  console.log({DataStoreFactoryContractAddress})

  const GeneralTransferManagerFactory = await ethers.deployContract("GeneralTransferManagerFactory", [0, GeneralTransferManagerLogicContractAddress, PolymathRegistryContractAddress], deployer);
  await GeneralTransferManagerFactory.waitForDeployment();
  const GeneralTransferManagerFactoryContractAddress = await GeneralTransferManagerFactory.getAddress();
  console.log({GeneralTransferManagerFactoryContractAddress})

  const EtherDividendCheckpointFactory = await ethers.deployContract("EtherDividendCheckpointFactory", [0, EtherDividendCheckpointLogicContractAddress, PolymathRegistryContractAddress], deployer);
  await EtherDividendCheckpointFactory.waitForDeployment();
  const EtherDividendCheckpointFactoryContractAddress = await EtherDividendCheckpointFactory.getAddress();
  console.log({EtherDividendCheckpointFactoryContractAddress})

  const ERC20DividendCheckpointFactory = await ethers.deployContract("ERC20DividendCheckpointFactory", [0, ERC20DividendCheckpointLogicContractAddress, PolymathRegistryContractAddress], deployer);
  await ERC20DividendCheckpointFactory.waitForDeployment();
  const ERC20DividendCheckpointFactoryContractAddress = await ERC20DividendCheckpointFactory.getAddress();
  console.log({ERC20DividendCheckpointFactoryContractAddress})

  const STGetter = await ethers.getContractFactory("STGetter",  { 
    signer: deployer, 
    libraries: { 
      TokenLib: TokenLibContractAddress
    } 
  });
  const sTGetter = await STGetter.deploy();
  const STGetterContractAddress = await sTGetter.getAddress();
  console.log({STGetterContractAddress})


  let tokenInitBytesCall = web3.eth.abi.encodeFunctionCall(tokenInitBytes, [STGetterContractAddress]);
  console.log({tokenInitBytesCall})


  const STFactory = await ethers.deployContract("STFactory", [PolymathRegistryContractAddress, GeneralTransferManagerFactoryContractAddress, DataStoreFactoryContractAddress, "3.0.0", SecurityTokenLogicContractAddress, tokenInitBytesCall], deployer);
  await STFactory.waitForDeployment();
  const STFactoryContractAddress = await STFactory.getAddress();
  console.log({STFactoryContractAddress})

  const FeatureRegistry = await ethers.deployContract("FeatureRegistry", deployer);
  await FeatureRegistry.waitForDeployment();
  const FeatureRegistryContractAddress = await FeatureRegistry.getAddress();
  console.log({FeatureRegistryContractAddress})

  await polymathRegistry.changeAddress("FeatureRegistry", FeatureRegistryContractAddress);

  const SecurityTokenRegistry = await ethers.deployContract("SecurityTokenRegistry", deployer);
  await SecurityTokenRegistry.waitForDeployment();
  const SecurityTokenRegistryContractAddress = await SecurityTokenRegistry.getAddress();
  console.log({SecurityTokenRegistryContractAddress})

  const SecurityTokenRegistryProxy = await ethers.deployContract("SecurityTokenRegistryProxy", deployer);
  await SecurityTokenRegistryProxy.waitForDeployment();
  const SecurityTokenRegistryProxyContractAddress = await SecurityTokenRegistryProxy.getAddress();
  console.log({SecurityTokenRegistryProxyContractAddress})

  const STRGetter = await ethers.deployContract("STRGetter", deployer);
  await STRGetter.waitForDeployment();
  const STRGetterContractAddress = await STRGetter.getAddress();
  console.log({STRGetterContractAddress})

  const initRegFee = 0;

  let bytesProxy = web3.eth.abi.encodeFunctionCall(functionSignatureProxy, [
      PolymathRegistryContractAddress,
      initRegFee.toString(),
      initRegFee.toString(),
      OWNER_ADDRESS,
      STRGetterContractAddress
  ]);

  const securityTokenRegistryProxy = new mainEthers.Contract(SecurityTokenRegistryProxyContractAddress, securityTokenRegistryProxyABI, deployer);

  await securityTokenRegistryProxy.upgradeToAndCall("1.0.0", SecurityTokenRegistryContractAddress, bytesProxy, { from: PolymathAccount });

  const xSecurityTokenRegistry = new mainEthers.Contract(SecurityTokenRegistryProxyContractAddress, securityTokenRegistryABI, deployer);
  await xSecurityTokenRegistry.setProtocolFactory(STFactoryContractAddress, 3, 0, 0)
  await xSecurityTokenRegistry.setLatestVersion(3, 0, 0);

  
  await polymathRegistry.changeAddress("SecurityTokenRegistry", SecurityTokenRegistryProxyContractAddress);

  const moduleRegistry = new mainEthers.Contract(ModuleRegistryProxyContractAddress, moduleRegistryABI, deployer);
  
  
  await moduleRegistry.updateFromRegistry()
  
  await moduleRegistry.registerModule(GeneralTransferManagerFactoryContractAddress)
  await moduleRegistry.registerModule(EtherDividendCheckpointFactoryContractAddress)
  await moduleRegistry.registerModule(ERC20DividendCheckpointFactoryContractAddress)
  
  await moduleRegistry.verifyModule(GeneralTransferManagerFactoryContractAddress)
  await moduleRegistry.verifyModule(EtherDividendCheckpointFactoryContractAddress)
  await moduleRegistry.verifyModule(ERC20DividendCheckpointFactoryContractAddress)


  const USDTieredSTOFactory = await ethers.deployContract("USDTieredSTOFactory", [0, USDTieredSTOLogicContractAddress, PolymathRegistryContractAddress], deployer);
  await USDTieredSTOFactory.waitForDeployment();
  const USDTieredSTOFactoryContractAddress = await USDTieredSTOFactory.getAddress();
  console.log({USDTieredSTOFactoryContractAddress})

  await moduleRegistry.registerModule(USDTieredSTOFactoryContractAddress)
  await moduleRegistry.verifyModule(USDTieredSTOFactoryContractAddress)

  await polymathRegistry.changeAddress("PolyToken", PolyTokenFaucetContractAddress);
  await polymathRegistry.changeAddress("PolyUsdOracle", PolyMockOracleContractAddress);
  await polymathRegistry.changeAddress("EthUsdOracle", ETHOracleContractAddress);
  await polymathRegistry.changeAddress("StablePolyUsdOracle", StableOracleContractAddress);

  const DummyERC20 = await ethers.deployContract("DummyERC20", ["Dai Token", "DAI", "18"], deployer);
  await DummyERC20.waitForDeployment();
  const DummyERC20ContractAddress = await DummyERC20.getAddress();

  console.log({DummyERC20ContractAddress})
  
  console.log("\n=== Deployment Summary ===");
  console.log("PolymathRegistry:", PolymathRegistryContractAddress);
  console.log("TradingRestrictionManager:", TradingRestrictionManagerContractAddress);
  console.log("ModuleRegistry:", ModuleRegistryProxyContractAddress);
  console.log("SecurityTokenRegistry:", SecurityTokenRegistryProxyContractAddress);
  console.log("STFactory:", STFactoryContractAddress);
  console.log("USDTieredSTOFactory:", USDTieredSTOFactoryContractAddress);
  console.log("FeatureRegistry:", FeatureRegistryContractAddress);
  console.log("\nAll contracts deployed and configured successfully!");
  console.log("\nTradingRestrictionManager is now registered in PolymathRegistry and ready for Merkle root operations.");
  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
