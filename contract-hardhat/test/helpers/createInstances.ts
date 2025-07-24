import { ethers } from "hardhat";
import { encodeProxyCall } from "./encodeCall";
import {
    DataStore,
    DataStoreFactory,
    DummySTO,
    DummySTOFactory,
    ERC20DividendCheckpoint,
    ERC20DividendCheckpointFactory,
    EtherDividendCheckpoint,
    EtherDividendCheckpointFactory,
    FeatureRegistry,
    GeneralPermissionManager,
    GeneralPermissionManagerFactory,
    GeneralTransferManager,
    GeneralTransferManagerFactory,
    MockOracle,
    ModuleRegistry,
    ModuleRegistryProxy,
    PolyTokenFaucet,
    PolymathRegistry,
    STFactory,
    STGetter,
    STRGetter,
    SecurityToken,
    SecurityTokenRegistry,
    SecurityTokenRegistryProxy,
    TokenLib,
    TradingRestrictionManager,
    USDTieredSTO,
    USDTieredSTOFactory,
} from "../../typechain-types";
import { Addressable, BigNumberish, ContractFactory } from "ethers";
import { TradingRestrictionManagerInterface } from "../../typechain-types/contracts/external/TradingRestrictionManager/TradingRestrictionManager";

// Contract Instance Declaration
let I_USDTieredSTOFactory: any;
let I_EtherDividendCheckpointLogic: any;
let I_EtherDividendCheckpointFactory: any;
let I_ERC20DividendCheckpointLogic: any;
let I_ERC20DividendCheckpointFactory: any;
let I_GeneralPermissionManagerLogic: any;
let I_GeneralPermissionManagerFactory: any;
let I_GeneralTransferManagerLogic: any;
let I_GeneralTransferManagerFactory: any;
let I_ModuleRegistryProxy: any;
let I_ModuleRegistry: any;
let I_FeatureRegistry: any;
let I_SecurityTokenRegistry: any;
let I_SecurityToken: any;
let I_DummySTOLogic: any;
let I_DummySTOFactory: any;
let I_PolyToken: any;
let I_STFactory: any;
let I_USDTieredSTOLogic: any;
let I_PolymathRegistry: any;
let I_SecurityTokenRegistryProxy: any;
let I_STRProxied: any;
let I_MRProxied: any;
let I_STRGetter: any;
let I_STGetter: any;
let I_USDOracle: any;
let I_POLYOracle: any;
let I_TradingRestrictionManager: any;

// Initial fee for ticker registry and security token registry
const initRegFee = ethers.parseEther("250");

const STRProxyParameters = ["address", "uint256", "uint256", "address", "address"];
const MRProxyParameters = ["address", "address"];

/// Function use to launch the polymath ecossystem.
async function setUpPolymathNetwork(account_polymath: string, token_owner: string): Promise<any[]> {
    const accounts = await ethers.getSigners();
    if (accounts[0].address !== account_polymath) {
        throw new Error("The first account must be the Polymath account");
    }
    // ----------- POLYMATH NETWORK Configuration ------------
    // Step 1: Deploy the PolyToken and PolymathRegistry
    await deployPolyRegistryAndPolyToken(account_polymath, token_owner);
    // Step 2: Deploy the FeatureRegistry
    await deployFeatureRegistry(account_polymath);
    // STEP 3: Deploy the ModuleRegistry
    await deployModuleRegistry(account_polymath);
    // STEP 4a: Deploy the GeneralTransferManagerLogic
    await deployGTMLogic(account_polymath);
    // STEP 4b: Deploy the GeneralTransferManagerFactory
    await deployGTM(account_polymath);
    // Step 6: Deploy the STversionProxy contract
    await deploySTFactory(account_polymath);
    // Step 7: Deploy the SecurityTokenRegistry
    await deploySTR(account_polymath);
    // Step 8: update the registries addresses from the PolymathRegistry contract
    await setInPolymathRegistry(account_polymath);
    // STEP 9: Register the Modules with the ModuleRegistry contract
    await registerGTM(account_polymath);
    // STEP 10: Add dummy oracles
    await addOracles(account_polymath);

    // STEP 11: External (add TradingRestriction Manager)
    await deployTradingRestrictionManager(account_polymath, token_owner);

    const tempArray = [
        I_PolymathRegistry,
        I_PolyToken,
        I_FeatureRegistry,
        I_ModuleRegistry,
        I_ModuleRegistryProxy,
        I_MRProxied,
        I_GeneralTransferManagerFactory,
        I_STFactory,
        I_SecurityTokenRegistry,
        I_SecurityTokenRegistryProxy,
        I_STRProxied,
        I_STRGetter,
        I_STGetter,
        I_TradingRestrictionManager,
        I_USDOracle,
        I_POLYOracle,
    ];
    return Promise.all(tempArray);
}

async function addOracles(account_polymath: string): Promise<void> {
    const USDETH = ethers.parseEther("500"); // 500 USD/ETH
    const USDPOLY = ethers.parseEther("0.25"); // 0.25 USD/POLY
    
    const MockOracle = await ethers.getContractFactory("MockOracle");
    
    I_USDOracle = await MockOracle.deploy(ethers.ZeroAddress, ethers.encodeBytes32String("ETH"), ethers.encodeBytes32String("USD"), USDETH);
    
    I_POLYOracle = await MockOracle.deploy(I_PolyToken.target, ethers.encodeBytes32String("POLY"), ethers.encodeBytes32String("USD"), USDPOLY);
    
    await I_PolymathRegistry.changeAddress("EthUsdOracle", I_USDOracle.target);
    await I_PolymathRegistry.changeAddress("PolyUsdOracle", I_POLYOracle.target);
    await I_PolymathRegistry.changeAddress("StablePolyUsdOracle", I_USDOracle.target);
}

async function deployTradingRestrictionManager(account_polymath: string, token_owner: string): Promise<[TradingRestrictionManager]> {
    // Step 0: Deploy the PolymathRegistry
    const TradingRestrictionManager = await ethers.getContractFactory("TradingRestrictionManager");
    I_TradingRestrictionManager = await TradingRestrictionManager.deploy();

    return [I_TradingRestrictionManager];
}

async function deployPolyRegistryAndPolyToken(account_polymath: string, token_owner: string): Promise<[PolymathRegistry, PolyTokenFaucet]> {
    // Step 0: Deploy the PolymathRegistry
    const PolymathRegistry = await ethers.getContractFactory("PolymathRegistry");
    I_PolymathRegistry = await PolymathRegistry.deploy();

    // Step 1: Deploy the token Faucet and Mint tokens for token_owner
    const PolyTokenFaucet = await ethers.getContractFactory("PolyTokenFaucet");
    I_PolyToken = await PolyTokenFaucet.deploy();

    await I_PolyToken.getTokens(ethers.parseEther("10000"), token_owner);
    await I_PolymathRegistry.changeAddress("PolyToken", I_PolyToken.target);

    return [I_PolymathRegistry, I_PolyToken];
}

async function deployFeatureRegistry(account_polymath: string): Promise<[FeatureRegistry]> {
    const FeatureRegistry = await ethers.getContractFactory("FeatureRegistry");
    I_FeatureRegistry = await FeatureRegistry.deploy();

    return [I_FeatureRegistry];
}

async function deployModuleRegistry(account_polymath: string): Promise<[ModuleRegistry, ModuleRegistryProxy, ModuleRegistry]> {
    const ModuleRegistry = await ethers.getContractFactory("ModuleRegistry");
    I_ModuleRegistry = await ModuleRegistry.deploy();

    // Step 3 (b): Deploy the proxy and attach the implementation contract to it
    const ModuleRegistryProxy = await ethers.getContractFactory("ModuleRegistryProxy");
    I_ModuleRegistryProxy = await ModuleRegistryProxy.deploy();
    const bytesMRProxy = encodeProxyCall(MRProxyParameters, [I_PolymathRegistry.target, account_polymath]);
    await I_ModuleRegistryProxy.upgradeToAndCall("1.0.0", I_ModuleRegistry.target, bytesMRProxy);
    
    I_MRProxied = await ethers.getContractAt("ModuleRegistry", I_ModuleRegistryProxy.target);

    return [I_ModuleRegistry, I_ModuleRegistryProxy, I_MRProxied];
}

async function deployGTMLogic(account_polymath: string): Promise<[GeneralTransferManager]> {
    const GeneralTransferManager = await ethers.getContractFactory("GeneralTransferManager");
    I_GeneralTransferManagerLogic = await GeneralTransferManager.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
    );

    if (I_GeneralTransferManagerLogic.target === ethers.ZeroAddress) {
        throw new Error("GeneralTransferManagerLogic contract was not deployed");
    }

    return [I_GeneralTransferManagerLogic];
}

async function deployGTM(account_polymath: string): Promise<[GeneralTransferManagerFactory]> {
    const GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManagerFactory");
    I_GeneralTransferManagerFactory = await GeneralTransferManagerFactory.deploy(
        0,
        I_GeneralTransferManagerLogic.target,
        I_PolymathRegistry.target,
        true
    );

    if (I_GeneralTransferManagerFactory.target === ethers.ZeroAddress) {
        throw new Error("GeneralTransferManagerFactory contract was not deployed");
    }

    return [I_GeneralTransferManagerFactory];
}

async function deploySTFactory(account_polymath: string): Promise<[STFactory, STGetter, ContractFactory, ContractFactory]> {

    const TokenLibFactory = await ethers.getContractFactory("TokenLib");
        const tokenLib: TokenLib = await TokenLibFactory.deploy();
        await tokenLib.waitForDeployment();

    const STGetterFactory = await ethers.getContractFactory("STGetter", {
        libraries: {
            TokenLib: tokenLib.target,
        },
        });
    I_STGetter = await STGetterFactory.deploy();

    const SecurityTokenLogic = await ethers.getContractFactory("SecurityToken", {
        libraries: {
            TokenLib: tokenLib.target,
        },
        });

    I_SecurityToken = await SecurityTokenLogic.deploy();
    console.log("STL - " + I_SecurityToken.target);

    const DataStoreLogic = await ethers.getContractFactory("DataStore");
    const I_DataStoreLogic: DataStore = await DataStoreLogic.deploy();

    const DataStoreFactory = await ethers.getContractFactory("DataStoreFactory");
    const I_DataStoreFactory: DataStoreFactory = await DataStoreFactory.deploy(I_DataStoreLogic.target);

    const abiCoder = new ethers.Interface([
        "function initialize(address _getterDelegate)"
    ]);

    const tokenInitBytesCall = abiCoder.encodeFunctionData("initialize", [I_STGetter.target]);

    const STFactory = await ethers.getContractFactory("STFactory");
    I_STFactory = await STFactory.deploy(
        I_PolymathRegistry.target,
        I_GeneralTransferManagerFactory.target,
        I_DataStoreFactory.target,
        "3.0.0",
        I_SecurityToken.target,
        tokenInitBytesCall
    );
    console.log("STFactory - " + I_STFactory.target);

    if (I_STFactory.target === ethers.ZeroAddress) {
        throw new Error("STFactory contract was not deployed");
    }

    return [I_STFactory, I_STGetter, STGetterFactory, SecurityTokenLogic];
}

async function deploySTR(account_polymath: string) {
    const SecurityTokenRegistry = await ethers.getContractFactory("SecurityTokenRegistry");
    I_SecurityTokenRegistry = await SecurityTokenRegistry.deploy();

    if (I_SecurityTokenRegistry.target === ethers.ZeroAddress) {
        throw new Error("SecurityTokenRegistry contract was not deployed");
    }

    // Step 9 (a): Deploy the proxy
    const SecurityTokenRegistryProxy = await ethers.getContractFactory("SecurityTokenRegistryProxy");
    I_SecurityTokenRegistryProxy = await SecurityTokenRegistryProxy.deploy();

    const STRGetter = await ethers.getContractFactory("STRGetter");
    I_STRGetter = await STRGetter.deploy();

    const bytesProxy = encodeProxyCall(STRProxyParameters, [
        I_PolymathRegistry.target,
        initRegFee,
        initRegFee,
        account_polymath,
        I_STRGetter.target
    ]);
    
    await I_SecurityTokenRegistryProxy.upgradeToAndCall("1.0.0", I_SecurityTokenRegistry.target, bytesProxy);
    I_STRProxied = await ethers.getContractAt("SecurityTokenRegistry", I_SecurityTokenRegistryProxy.target);
    
    await I_STRProxied.setProtocolFactory(I_STFactory.target, 3, 0, 0);
    await I_STRProxied.setLatestVersion(3, 0, 0);
    
    I_STRGetter = await ethers.getContractAt("STRGetter", I_SecurityTokenRegistryProxy.target);
    
    return [I_SecurityTokenRegistry, I_SecurityTokenRegistryProxy, I_STRProxied, I_STRGetter];
}

async function setInPolymathRegistry(account_polymath: string): Promise<void> {
    await I_PolymathRegistry.changeAddress("PolyToken", I_PolyToken.target);
    await I_PolymathRegistry.changeAddress("ModuleRegistry", I_ModuleRegistryProxy.target);
    await I_PolymathRegistry.changeAddress("FeatureRegistry", I_FeatureRegistry.target);
    await I_PolymathRegistry.changeAddress("SecurityTokenRegistry", I_SecurityTokenRegistryProxy.target);
    await I_MRProxied.updateFromRegistry();
}

async function registerGTM(account_polymath: string): Promise<void> {
    await I_MRProxied.registerModule(I_GeneralTransferManagerFactory.target);
    await I_MRProxied.verifyModule(I_GeneralTransferManagerFactory.target);
}

async function registerAndVerifyByMR(factoryAddress: string | Addressable, owner: string, mr: ModuleRegistry): Promise<void> {
    await mr.registerModule(factoryAddress);
    await mr.verifyModule(factoryAddress);
}

/// Deploy the TransferManagers

async function deployGTMAndVerifyed(accountPolymath: string, MRProxyInstance: ModuleRegistry, setupCost: BigNumberish, feeInPoly: boolean = false): Promise<[GeneralTransferManagerFactory]> {
    const GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManagerFactory");
    I_GeneralTransferManagerFactory = await GeneralTransferManagerFactory.deploy(
        setupCost,
        I_GeneralTransferManagerLogic.target,
        I_PolymathRegistry.target,
        feeInPoly
    );

    if (I_GeneralTransferManagerFactory.target === ethers.ZeroAddress) {
        throw new Error("GeneralTransferManagerFactory contract was not deployed");
    }

    // (B): Register the GeneralDelegateManagerFactory
    await registerAndVerifyByMR(I_GeneralTransferManagerFactory.target, accountPolymath, MRProxyInstance);
    return [I_GeneralTransferManagerFactory];
}

/// Deploy the Permission Manager

async function deployGPMAndVerifyed(accountPolymath: string, MRProxyInstance: ModuleRegistry, setupCost: BigNumberish, feeInPoly: boolean = false): Promise<[GeneralPermissionManagerFactory]> {
    const GeneralPermissionManager = await ethers.getContractFactory("GeneralPermissionManager");
    I_GeneralPermissionManagerLogic = await GeneralPermissionManager.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
    );

    const GeneralPermissionManagerFactory = await ethers.getContractFactory("GeneralPermissionManagerFactory");
    I_GeneralPermissionManagerFactory = await GeneralPermissionManagerFactory.deploy(
        setupCost,
        I_GeneralPermissionManagerLogic.target,
        I_PolymathRegistry.target,
        feeInPoly
    );

    if (I_GeneralPermissionManagerFactory.target === ethers.ZeroAddress) {
        throw new Error("GeneralPermissionManagerFactory contract was not deployed");
    }

    // (B): Register the GeneralDelegateManagerFactory
    await registerAndVerifyByMR(I_GeneralPermissionManagerFactory.target, accountPolymath, MRProxyInstance);
    return [I_GeneralPermissionManagerFactory];
}

/// Deploy the STO Modules

async function deployDummySTOAndVerifyed(accountPolymath: string, MRProxyInstance: ModuleRegistry, setupCost: BigNumberish, feeInPoly: boolean = false): Promise<[DummySTOFactory]> {
    const DummySTO = await ethers.getContractFactory("DummySTO");
    I_DummySTOLogic = await DummySTO.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
    );

    const DummySTOFactory = await ethers.getContractFactory("DummySTOFactory");
    I_DummySTOFactory = await DummySTOFactory.deploy(
        setupCost,
        I_DummySTOLogic.target,
        I_PolymathRegistry.target,
        feeInPoly
    );

    if (I_DummySTOFactory.target === ethers.ZeroAddress) {
        throw new Error("DummySTOFactory contract was not deployed");
    }

    await registerAndVerifyByMR(I_DummySTOFactory.target, accountPolymath, MRProxyInstance);
    return [I_DummySTOFactory];
}

async function deployUSDTieredSTOAndVerified(accountPolymath: string, MRProxyInstance: ModuleRegistry, setupCost: BigNumberish, feeInPoly: boolean = false): Promise<[USDTieredSTOFactory]> {
    const USDTieredSTO = await ethers.getContractFactory("USDTieredSTO");
    I_USDTieredSTOLogic = await USDTieredSTO.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
    );

    const USDTieredSTOFactory = await ethers.getContractFactory("USDTieredSTOFactory");
    I_USDTieredSTOFactory = await USDTieredSTOFactory.deploy(
        setupCost,
        I_USDTieredSTOLogic.target,
        I_PolymathRegistry.target,
        feeInPoly
    );

    if (I_USDTieredSTOFactory.target === ethers.ZeroAddress) {
        throw new Error("USDTieredSTOFactory contract was not deployed");
    }

    await registerAndVerifyByMR(I_USDTieredSTOFactory.target, accountPolymath, MRProxyInstance);
    return [I_USDTieredSTOFactory];
}

/// Deploy the Dividend Modules

async function deployERC20DividendAndVerifyed(accountPolymath: string, MRProxyInstance: ModuleRegistry | any, setupCost: BigNumberish, feeInPoly: boolean = false): Promise<[ERC20DividendCheckpointFactory]> {
    const ERC20DividendCheckpoint = await ethers.getContractFactory("ERC20DividendCheckpoint");
    I_ERC20DividendCheckpointLogic = await ERC20DividendCheckpoint.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
    );

    const ERC20DividendCheckpointFactory = await ethers.getContractFactory("ERC20DividendCheckpointFactory");
    I_ERC20DividendCheckpointFactory = await ERC20DividendCheckpointFactory.deploy(
        setupCost,
        I_ERC20DividendCheckpointLogic.target,
        I_PolymathRegistry.target,
        feeInPoly
    );

    if (I_ERC20DividendCheckpointFactory.target === ethers.ZeroAddress) {
        throw new Error("ERC20DividendCheckpointFactory contract was not deployed");
    }

    await registerAndVerifyByMR(I_ERC20DividendCheckpointFactory.target, accountPolymath, MRProxyInstance);
    return [I_ERC20DividendCheckpointFactory];
}

async function deployEtherDividendAndVerifyed(accountPolymath: string, MRProxyInstance: ModuleRegistry, setupCost: BigNumberish, feeInPoly: boolean = false): Promise<[EtherDividendCheckpointFactory]> {
    const EtherDividendCheckpoint = await ethers.getContractFactory("EtherDividendCheckpoint");
    I_EtherDividendCheckpointLogic = await EtherDividendCheckpoint.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
    );

    const EtherDividendCheckpointFactory = await ethers.getContractFactory("EtherDividendCheckpointFactory");
    I_EtherDividendCheckpointFactory = await EtherDividendCheckpointFactory.deploy(
        setupCost,
        I_EtherDividendCheckpointLogic.target,
        I_PolymathRegistry.target,
        feeInPoly
    );

    if (I_EtherDividendCheckpointFactory.target === ethers.ZeroAddress) {
        throw new Error("EtherDividendCheckpointFactory contract was not deployed");
    }

    await registerAndVerifyByMR(I_EtherDividendCheckpointFactory.target, accountPolymath, MRProxyInstance);
    return [I_EtherDividendCheckpointFactory];
}

export {
  setUpPolymathNetwork,
  addOracles,
  deployPolyRegistryAndPolyToken,
  deployGTMAndVerifyed,
  deployGPMAndVerifyed,
  deployDummySTOAndVerifyed,
  deployUSDTieredSTOAndVerified,
  deployERC20DividendAndVerifyed,
  deployEtherDividendAndVerifyed,
};
