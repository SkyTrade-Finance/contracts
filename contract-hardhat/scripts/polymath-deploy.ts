import { ethers } from "hardhat";
import { encodeProxyCall } from "../test/helpers/encodeCall";

const nullAddress = "0x0000000000000000000000000000000000000000";
const cappedSTOSetupCost = 0; // 0 POLY fee
const usdTieredSTOSetupCost = 0; // 0 POLY fee
const initRegFee = 0; // 0 POLY fee for registering ticker or security token in registry

const STRProxyParameters = ["address", "uint256", "uint256", "address", "address"];
const MRProxyParameters = ["address", "address"];

export async function initializeContracts() {
    // Removed: console.log("Starting Polymath Network deployment...");
    
    const [deployer] = await ethers.getSigners();
    const PolymathAccount = deployer.address;
    
    // Removed: console.log("Deploying contracts with the account:", PolymathAccount);
    // Removed: console.log("Account balance:", (await PolymathAccount.balance));

    let contracts = {};
    
    // Deploy DevPolyToken (Mock PolyToken for development)
    // Removed: console.log("Deploying DevPolyToken...");
    const DevPolyToken = await ethers.getContractFactory("PolyTokenFaucet");
    const _contracts: { [key: string]: any } = contracts;
    _contracts.devPolyToken = await DevPolyToken.deploy();
    await _contracts.devPolyToken.waitForDeployment();
    
    // Deploy TradingRestrictionManager
    // Removed: console.log("Deploying TradingRestrictionManager...");
    const TradingRestrictionManager = await ethers.getContractFactory("TradingRestrictionManager");
    _contracts.tradingRestrictionManager = await TradingRestrictionManager.deploy();
    await _contracts.tradingRestrictionManager.waitForDeployment();
    
    // Deploy Mock Oracles
    // Removed: console.log("Deploying Mock Oracles...");
    const MockOracle = await ethers.getContractFactory("MockOracle");
    
    // Deploy POLY Oracle
    _contracts.polyOracle = await MockOracle.deploy(
         _contracts.devPolyToken.target,
        ethers.encodeBytes32String("POLY"),
        ethers.encodeBytes32String("USD"),
        ethers.parseEther("0.5")
    );
    const POLYOracle = _contracts.polyOracle.target;
    
    // Deploy Stable Oracle
    // Removed: console.log("Deploying StableOracle...");
    const StableOracle = await ethers.getContractFactory("StableOracle");
    _contracts.stableOracle = await StableOracle.deploy(
        POLYOracle,
        ethers.parseEther("0.1")
    );
    const StablePOLYOracle = _contracts.stableOracle.target;
    
    // Deploy ETH Oracle
    _contracts.ethOracle = await MockOracle.deploy(
        nullAddress,
        ethers.encodeBytes32String("ETH"),
        ethers.encodeBytes32String("USD"),
        ethers.parseEther("500")
    );
    const ETHOracle = _contracts.ethOracle.target;
    
    // Deploy PolymathRegistry
    // Removed: console.log("Deploying PolymathRegistry...");
    const PolymathRegistry = await ethers.getContractFactory("PolymathRegistry");
    _contracts.polymathRegistry = await PolymathRegistry.deploy();
    await _contracts.polymathRegistry.waitForDeployment();

    await _contracts.polymathRegistry.changeAddress("PolyToken", _contracts.devPolyToken.target);
    
    // Deploy Libraries
    // Removed: console.log("Deploying Libraries...");
    const TokenLib = await ethers.getContractFactory("TokenLib");
    _contracts.tokenLib = await TokenLib.deploy();
    
    // Deploy ModuleRegistry and Proxy
    // Removed: console.log("Deploying ModuleRegistry...");
    const ModuleRegistry = await ethers.getContractFactory("ModuleRegistry");
    _contracts.moduleRegistry = await ModuleRegistry.deploy();
    
    const ModuleRegistryProxy = await ethers.getContractFactory("ModuleRegistryProxy");
    _contracts.moduleRegistryProxy = await ModuleRegistryProxy.deploy();
    
    const bytesMRProxy = encodeProxyCall(MRProxyParameters, [_contracts.polymathRegistry.target, PolymathAccount]);
    
    await _contracts.moduleRegistryProxy.upgradeToAndCall(
        "1.0.0",
        _contracts.moduleRegistry.target,
        bytesMRProxy
    );
    
    // Get ModuleRegistry instance through proxy
    _contracts.moduleRegistryInstance = await ethers.getContractAt("ModuleRegistry", _contracts.moduleRegistryProxy.target);
    
    // Add module registry to polymath registry
    await _contracts.polymathRegistry.changeAddress("ModuleRegistry", _contracts.moduleRegistryProxy.target);
    
    // Deploy Logic Contracts
    // Removed: console.log("Deploying Logic Contracts...");
    
    const GeneralTransferManagerLogic = await ethers.getContractFactory("GeneralTransferManager");
    _contracts.generalTransferManagerLogic = await GeneralTransferManagerLogic.deploy(nullAddress, nullAddress);
    
    const GeneralPermissionManagerLogic = await ethers.getContractFactory("GeneralPermissionManager");
    _contracts.generalPermissionManagerLogic = await GeneralPermissionManagerLogic.deploy(nullAddress, nullAddress);
    
    const ERC20DividendCheckpointLogic = await ethers.getContractFactory("ERC20DividendCheckpoint");
    _contracts.erc20DividendCheckpointLogic = await ERC20DividendCheckpointLogic.deploy(nullAddress, nullAddress);
    
    const EtherDividendCheckpointLogic = await ethers.getContractFactory("EtherDividendCheckpoint");
    _contracts.etherDividendCheckpointLogic = await EtherDividendCheckpointLogic.deploy(nullAddress, nullAddress);
    
    const USDTieredSTOLogic = await ethers.getContractFactory("USDTieredSTO");
    _contracts.usdTieredSTOLogic = await USDTieredSTOLogic.deploy(nullAddress, nullAddress);
    
    const DataStoreLogic = await ethers.getContractFactory("DataStore");
    _contracts.dataStoreLogic = await DataStoreLogic.deploy();
    
    const SecurityTokenLogic = await ethers.getContractFactory("SecurityToken", {
        libraries: {
            TokenLib: _contracts.tokenLib.target
        }
    });
    _contracts.securityTokenLogic = await SecurityTokenLogic.deploy();
    
    // Deploy Factory Contracts
    // Removed: console.log("Deploying Factory Contracts...");
    
    const DataStoreFactory = await ethers.getContractFactory("DataStoreFactory");
    _contracts.dataStoreFactory = await DataStoreFactory.deploy(_contracts.dataStoreLogic.target);
    
    const GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManagerFactory");
    _contracts.generalTransferManagerFactory = await GeneralTransferManagerFactory.deploy(
        0,
        _contracts.generalTransferManagerLogic.target,
        _contracts.polymathRegistry.target,
        true
    );
    
    const GeneralPermissionManagerFactory = await ethers.getContractFactory("GeneralPermissionManagerFactory");
    _contracts.generalPermissionManagerFactory = await GeneralPermissionManagerFactory.deploy(
        0,
        _contracts.generalPermissionManagerLogic.target,
        _contracts.polymathRegistry.target,
        true
    );
    
    const EtherDividendCheckpointFactory = await ethers.getContractFactory("EtherDividendCheckpointFactory");
    _contracts.etherDividendCheckpointFactory = await EtherDividendCheckpointFactory.deploy(
        0,
        _contracts.etherDividendCheckpointLogic.target,
        _contracts.polymathRegistry.target,
        true
    );
    
    const ERC20DividendCheckpointFactory = await ethers.getContractFactory("ERC20DividendCheckpointFactory");
    _contracts.erc20DividendCheckpointFactory = await ERC20DividendCheckpointFactory.deploy(
        0,
        _contracts.erc20DividendCheckpointLogic.target,
        _contracts.polymathRegistry.target,
        true
    );
    
    // Deploy STGetter
    // Removed: console.log("Deploying STGetter...");
    const STGetter = await ethers.getContractFactory("STGetter", {
        libraries: {
            TokenLib: _contracts.tokenLib.target
        }
    });
    _contracts.stGetter = await STGetter.deploy();
    
    // Deploy STFactory
    // Removed: console.log("Deploying STFactory...");
        
    const abiCoder = new ethers.Interface([
            "function initialize(address _getterDelegate)"
        ]);
    
    const tokenInitBytesCall = abiCoder.encodeFunctionData("initialize", [_contracts.stGetter.target]);
    
    const STFactory = await ethers.getContractFactory("STFactory");
    _contracts.stFactory = await STFactory.deploy(
        _contracts.polymathRegistry.target,
        _contracts.generalTransferManagerFactory.target,
        _contracts.dataStoreFactory.target,
        "3.0.0",
        _contracts.securityTokenLogic.target,
        tokenInitBytesCall
    );
    
    // Deploy FeatureRegistry
    // Removed: console.log("Deploying FeatureRegistry...");
    const FeatureRegistry = await ethers.getContractFactory("FeatureRegistry");
    _contracts.featureRegistry = await FeatureRegistry.deploy();
    
    // Assign FeatureRegistry address
    await _contracts.polymathRegistry.changeAddress("FeatureRegistry", _contracts.featureRegistry.target);
    
    // Deploy SecurityTokenRegistry and Proxy
    // Removed: console.log("Deploying SecurityTokenRegistry...");
    const SecurityTokenRegistry = await ethers.getContractFactory("SecurityTokenRegistry");
    _contracts.securityTokenRegistry = await SecurityTokenRegistry.deploy();
    
    const SecurityTokenRegistryProxy = await ethers.getContractFactory("SecurityTokenRegistryProxy");
    _contracts.securityTokenRegistryProxy = await SecurityTokenRegistryProxy.deploy();
    
    const STRGetter = await ethers.getContractFactory("STRGetter");
    _contracts.strGetter = await STRGetter.deploy();
    
    const bytesProxy = _contracts.securityTokenRegistry.interface.encodeFunctionData("initialize", [
        _contracts.polymathRegistry.target,
        initRegFee.toString(),
        initRegFee.toString(),
        PolymathAccount,
        _contracts.strGetter.target
    ]);
    
    await _contracts.securityTokenRegistryProxy.upgradeToAndCall(
        "1.0.0",
        _contracts.securityTokenRegistry.target,
        bytesProxy
    );
    
    // Get SecurityTokenRegistry instance through proxy
    _contracts.securityTokenRegistryInstance = await ethers.getContractAt("SecurityTokenRegistry", _contracts.securityTokenRegistryProxy.target);
    
    // Set protocol factory and version
    await _contracts.securityTokenRegistryInstance.setProtocolFactory(_contracts.stFactory.target, 3, 0, 0);
    await _contracts.securityTokenRegistryInstance.setLatestVersion(3, 0, 0);
    
    // Assign SecurityTokenRegistry address
    await _contracts.polymathRegistry.changeAddress("SecurityTokenRegistry", _contracts.securityTokenRegistryProxy.target);

    const FakeUSDT = await ethers.getContractFactory("FakeUSDT");
    _contracts.fakeUSDTInstance = await FakeUSDT.deploy();
    
    // Update module registry
    await _contracts.moduleRegistryInstance.updateFromRegistry();
    
    // Register and verify modules
    // Removed: console.log("Registering and verifying modules...");
    const factories = [
        _contracts.generalTransferManagerFactory,
        _contracts.generalPermissionManagerFactory,
        _contracts.etherDividendCheckpointFactory,
        _contracts.erc20DividendCheckpointFactory,
    ];
    
    for (const factory of factories) {
        await _contracts.moduleRegistryInstance.registerModule(factory.target);
        await _contracts.moduleRegistryInstance.verifyModule(factory.target);
    }
    
    // Deploy and register STO factories
    // Removed: console.log("Deploying STO Factories...");
    
    const USDTieredSTOFactory = await ethers.getContractFactory("USDTieredSTOFactory");
    _contracts.usdTieredSTOFactory = await USDTieredSTOFactory.deploy(
        usdTieredSTOSetupCost,
        _contracts.usdTieredSTOLogic.target,
        _contracts.polymathRegistry.target,
        false
    );
    
    await _contracts.moduleRegistryInstance.registerModule(_contracts.usdTieredSTOFactory.target);
    await _contracts.moduleRegistryInstance.verifyModule(_contracts.usdTieredSTOFactory.target);
    
    // Set Oracle addresses
    // Removed: console.log("Setting Oracle addresses...");
    await _contracts.polymathRegistry.changeAddress("PolyUsdOracle", POLYOracle);
    await _contracts.polymathRegistry.changeAddress("EthUsdOracle", ETHOracle);
    await _contracts.polymathRegistry.changeAddress("StablePolyUsdOracle", StablePOLYOracle);
    
    // Log deployment summary
    console.log(`
    ----------------------- Polymath Network Smart Contracts: -----------------------
    PolymathRegistry:                     ${_contracts.polymathRegistry.target}
    SecurityTokenRegistry (Proxy):        ${_contracts.securityTokenRegistryProxy.target}
    ModuleRegistry (Proxy):               ${_contracts.moduleRegistryProxy.target}
    FeatureRegistry:                      ${_contracts.featureRegistry.target}
    STRGetter:                            ${_contracts.strGetter.target}

    STFactory:                            ${_contracts.stFactory.target}
    GeneralTransferManagerLogic:          ${_contracts.generalTransferManagerLogic.target}
    GeneralTransferManagerFactory:        ${_contracts.generalTransferManagerFactory.target}
    GeneralPermissionManagerLogic:        ${_contracts.generalPermissionManagerLogic.target}
    GeneralPermissionManagerFactory:      ${_contracts.generalPermissionManagerFactory.target}

    USDTieredSTOLogic:                    ${_contracts.usdTieredSTOLogic.target}
    USDTieredSTOFactory:                  ${_contracts.usdTieredSTOFactory.target}

    EtherDividendCheckpointLogic:         ${_contracts.etherDividendCheckpointLogic.target}
    ERC20DividendCheckpointLogic:         ${_contracts.erc20DividendCheckpointLogic.target}
    EtherDividendCheckpointFactory:       ${_contracts.etherDividendCheckpointFactory.target}
    ERC20DividendCheckpointFactory:       ${_contracts.erc20DividendCheckpointFactory.target}
    TradingRestrictionManager:            ${_contracts.tradingRestrictionManager.target}
    FakeUSDT:                             ${_contracts.fakeUSDTInstance.target}
    ---------------------------------------------------------------------------------
    `);
    
    console.log("Polymath Network deployment completed successfully!");
    return contracts;
}

// If running directly as a script
if (require.main === module) {
    initializeContracts()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
