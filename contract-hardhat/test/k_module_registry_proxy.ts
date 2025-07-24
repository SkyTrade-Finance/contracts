import { ethers } from "hardhat";
import { expect } from "chai";
import { Addressable, Contract } from "ethers";
import { setUpPolymathNetwork } from "./helpers/createInstances";

// Helper to read storage
const readStorage = async (address: string, slot: number) => {
    return await ethers.provider.getStorageAt(address, slot);
};

describe("ModuleRegistryProxy", () => {
    // Contract instances
    let I_SecurityTokenRegistry: Contract;
    let I_SecurityTokenRegistryProxy: Contract;
    let I_GeneralTransferManagerFactory: Contract;
    let I_GeneralPermissionManagerfactory: Contract;
    let I_GeneralPermissionManagerLogic: Contract;
    let I_MockModuleRegistry: Contract;
    let I_STFactory: Contract;
    let I_PolymathRegistry: Contract;
    let I_ModuleRegistryProxy: Contract;
    let I_PolyToken: Contract;
    let I_MRProxied: Contract;
    let I_ModuleRegistry: Contract;
    let I_FeatureRegistry: Contract;
    let I_STRGetter: Contract;
    let I_STGetter: Contract;

    // Signers
    let account_polymath;
    let account_temp;
    let token_owner;
    let account_polymath_new;

    // Constants
    const address_zero = ethers.ZeroAddress;

    async function readStorage(contractAddress: string | Addressable, slot: number) {
        return await ethers.provider.getStorage(contractAddress, slot);
    }

    before(async () => {
        [account_polymath, account_temp, token_owner, account_polymath_new] = await ethers.getSigners();

        // Step 1: Deploy the general PM ecosystem
        let instances = await setUpPolymathNetwork(account_polymath.address, token_owner.address);

        [
            I_PolymathRegistry,
            I_PolyToken,
            I_FeatureRegistry,
            I_ModuleRegistry,
            I_ModuleRegistryProxy, // This will be replaced by a new deployment
            I_MRProxied,
            I_GeneralTransferManagerFactory,
            I_STFactory,
            I_SecurityTokenRegistry,
            I_SecurityTokenRegistryProxy,
            // I_STRProxied, // Not used in this file
            I_STRGetter,
            I_STGetter
        ] = instances;

        const ModuleRegistryProxyFactory = await ethers.getContractFactory("ModuleRegistryProxy");
        I_ModuleRegistryProxy = await ModuleRegistryProxyFactory.connect(account_polymath).deploy();

        const ModuleRegistryFactory = await ethers.getContractFactory("ModuleRegistry");
        I_ModuleRegistry = await ModuleRegistryFactory.connect(account_polymath).deploy();

        await I_PolymathRegistry.connect(account_polymath).changeAddress("ModuleRegistry", I_ModuleRegistryProxy.target);

        // Printing all the contract addresses
        console.log(`
         --------------------- Polymath Network Smart Contracts: ---------------------
         PolymathRegistry:                  ${I_PolymathRegistry.target}
         SecurityTokenRegistryProxy:        ${I_SecurityTokenRegistryProxy.target}
         SecurityTokenRegistry:             ${I_SecurityTokenRegistry.target}
         ModuleRegistry:                    ${I_ModuleRegistry.target}
         ModuleRegistryProxy:               ${I_ModuleRegistryProxy.target}
         STFactory:                         ${I_STFactory.target}
         GeneralTransferManagerFactory:     ${I_GeneralTransferManagerFactory.target}
         -----------------------------------------------------------------------------
         `);
    });

    describe("Attach the implementation address", async () => {
        // Storage slots for OwnedUpgradeabilityProxy
        // __version -- keccak256('org.zeppelinos.proxy.version') - 1 => 0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3 (pos 11 in truffle)
        // __implementation -- keccak256('org.zeppelinos.proxy.implementation') - 1 => 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc (pos 12 in truffle)

        it("Should attach the MR implementation and version", async () => {
            const moduleRegistryInterface = new ethers.Interface(["function initialize(address _polymathRegistry, address _owner)"]);
            const bytesProxy = moduleRegistryInterface.encodeFunctionData("initialize", [I_PolymathRegistry.target, account_polymath.address]);

            await I_ModuleRegistryProxy.connect(account_polymath).upgradeToAndCall("1.0.0", I_ModuleRegistry.target, bytesProxy);

            let c = await ethers.getContractAt("OwnedUpgradeabilityProxy", I_ModuleRegistryProxy.target);

            const storageValue = await readStorage(c.target, 12);
            const addressFromStorage = ethers.getAddress("0x" + storageValue.slice(-40)); // Take last 40 chars (20 bytes)
            expect(addressFromStorage.toLowerCase()).to.equal(I_ModuleRegistry.target.toString().toLowerCase(), "Implementation address is not set correctly");
            expect(ethers.toUtf8String(await readStorage(c.target, 11)).replace(/\0/g, "").replace(/\n/, "")).to.equal("1.0.0");

            I_MRProxied = await ethers.getContractAt("ModuleRegistry", I_ModuleRegistryProxy.target);
        });

        it("Deploy the essential smart contracts", async () => {
            await I_MRProxied.connect(account_polymath).updateFromRegistry();

            const GeneralTransferManagerLogicFactory = await ethers.getContractFactory("GeneralTransferManager");
            let I_GeneralTransferManagerLogic = await GeneralTransferManagerLogicFactory.deploy(address_zero, address_zero);

            const TokenLibFactory = await ethers.getContractFactory("TokenLib");
            const tokenLib = await TokenLibFactory.deploy();
            await tokenLib.waitForDeployment();

            const SecurityTokenLogicFactory = await ethers.getContractFactory("SecurityToken", 
            {
                libraries: {
                TokenLib: tokenLib.target,
                }
            }
            );
            let I_SecurityTokenLogic = await SecurityTokenLogicFactory.deploy();

            const GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManagerFactory");
            I_GeneralTransferManagerFactory = await GeneralTransferManagerFactory.deploy(0, I_GeneralTransferManagerLogic.target, I_PolymathRegistry.target, true);


            expect(I_GeneralTransferManagerFactory.target).to.not.equal(address_zero, "GeneralTransferManagerFactory contract was not deployed");

            await I_MRProxied.connect(account_polymath).registerModule(I_GeneralTransferManagerFactory.target);
            await I_MRProxied.connect(account_polymath).verifyModule(I_GeneralTransferManagerFactory.target);

            const STGetterFactory = await ethers.getContractFactory("STGetter", 
                {
                    libraries: {
                        TokenLib: tokenLib.target,
                    }
                }
            );
            I_STGetter = await STGetterFactory.deploy();

            const DataStoreLogicFactory = await ethers.getContractFactory("DataStore");
            let I_DataStoreLogic = await DataStoreLogicFactory.deploy();


            const DataStoreFactory = await ethers.getContractFactory("DataStoreFactory");
            let I_DataStoreFactory = await DataStoreFactory.deploy(I_DataStoreLogic.target);


            const tokenInitInterface = new ethers.Interface(["function initialize(address _getterDelegate)"]);
            const tokenInitBytesCall = tokenInitInterface.encodeFunctionData("initialize", [I_STGetter.target]);

            const STFactory = await ethers.getContractFactory("STFactory");
            I_STFactory = await STFactory.deploy(I_PolymathRegistry.target, I_GeneralTransferManagerFactory.target, I_DataStoreFactory.target, "3.0.0", I_SecurityTokenLogic.target, tokenInitBytesCall);


            expect(I_STFactory.target).to.not.equal(address_zero, "STFactory contract was not deployed");
        });

        it("Verify the initialize data", async () => {
            expect(await I_MRProxied.getAddressValue(ethers.id("owner"))).to.equal(account_polymath.address);
            expect(await I_MRProxied.getAddressValue(ethers.id("polymathRegistry"))).to.equal(I_PolymathRegistry.target);
        });
        });

        describe("Feed some data in storage", async () => {
        it("Register and verify the new module", async () => {
            const GPMFactory = await ethers.getContractFactory("GeneralPermissionManager");
            I_GeneralPermissionManagerLogic = await GPMFactory.deploy(address_zero, address_zero);


            const GPMFactoryFactory = await ethers.getContractFactory("GeneralPermissionManagerFactory");
            I_GeneralPermissionManagerfactory = await GPMFactoryFactory.deploy(0, I_GeneralPermissionManagerLogic.target, I_PolymathRegistry.target, true);


            expect(I_GeneralPermissionManagerfactory.target).to.not.equal(address_zero, "GeneralPermissionManagerFactory contract was not deployed");

            await I_MRProxied.connect(account_polymath).registerModule(I_GeneralPermissionManagerfactory.target);
            await I_MRProxied.connect(account_polymath).verifyModule(I_GeneralPermissionManagerfactory.target);
        });
        });

        describe("Upgrade the imlplementation address", async () => {
        it("Should upgrade the version and implementation address -- fail bad owner", async () => {
            const MockModuleRegistryFactory = await ethers.getContractFactory("MockModuleRegistry");
            I_MockModuleRegistry = await MockModuleRegistryFactory.deploy();

            await expect(I_ModuleRegistryProxy.connect(account_temp).upgradeTo("1.1.0", I_MockModuleRegistry.target)).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- Implementaion address should be a contract address", async () => {
            await expect(I_ModuleRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", account_temp.address)).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- Implemenation address should not be 0x", async () => {
            await expect(I_ModuleRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", address_zero)).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- Implemenation address should not be the same address", async () => {
            await expect(I_ModuleRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", I_ModuleRegistry.target)).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- same version as previous is not allowed", async () => {
            const MockModuleRegistryFactory = await ethers.getContractFactory("MockModuleRegistry");
            I_MockModuleRegistry = await MockModuleRegistryFactory.deploy();
            await expect(I_ModuleRegistryProxy.connect(account_polymath).upgradeTo("1.0.0", I_MockModuleRegistry.target)).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- empty version string is not allowed", async () => {
            const MockModuleRegistryFactory = await ethers.getContractFactory("MockModuleRegistry");
            I_MockModuleRegistry = await MockModuleRegistryFactory.deploy();
            await expect(I_ModuleRegistryProxy.connect(account_polymath).upgradeTo("", I_MockModuleRegistry.target)).to.be.reverted;
        });

        it("Should upgrade the version and the implementation address successfully", async () => {
            const MockModuleRegistryFactory = await ethers.getContractFactory("MockModuleRegistry");
            I_MockModuleRegistry = await MockModuleRegistryFactory.deploy();
            await I_ModuleRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", I_MockModuleRegistry.target);

            let c = await ethers.getContractAt("OwnedUpgradeabilityProxy", I_ModuleRegistryProxy.target);

            expect(ethers.toUtf8String(await readStorage(c.target, 11)).replace(/\0/g, "").replace(/\n/, "")).to.equal("1.1.0");

            const storageValue = await readStorage(c.target, 12);
            const addressFromStorage = ethers.getAddress("0x" + storageValue.slice(-40)); // Take last 40 chars (20 bytes)
            expect(addressFromStorage.toLowerCase()).to.equal(I_MockModuleRegistry.target.toString().toLowerCase(), "Implementation address is not set correctly");
            
            I_MRProxied = await ethers.getContractAt("MockModuleRegistry", I_ModuleRegistryProxy.target);
        });
        });

        describe("Execute functionality of the implementation contract on the earlier storage", async () => {
        it("Should get the previous data", async () => {
            let _data = await I_MRProxied.getFactoryDetails(I_GeneralTransferManagerFactory.target);
            expect(_data[2].length).to.equal(0, "Should give the original length");
        });

        it("Should alter the old storage", async () => {
            await I_MRProxied.connect(account_polymath).addMoreReputation(I_GeneralTransferManagerFactory.target, [account_polymath.address, account_temp.address]);
            let _data = await I_MRProxied.getFactoryDetails(I_GeneralTransferManagerFactory.target);
            expect(_data[2].length).to.equal(2, "Should give the updated length");
        });
        });

        describe("Transfer the ownership of the proxy contract", async () => {
        it("Should change the ownership of the contract -- because of bad owner", async () => {
            await expect(I_ModuleRegistryProxy.connect(account_temp).transferProxyOwnership(account_polymath_new.address)).to.be.reverted;
        });

        it("Should change the ownership of the contract -- new address should not be 0x", async () => {
            await expect(I_ModuleRegistryProxy.connect(account_polymath).transferProxyOwnership(address_zero)).to.be.reverted;
        });

        it("Should change the ownership of the contract", async () => {
            await I_ModuleRegistryProxy.connect(account_polymath).transferProxyOwnership(account_polymath_new.address);
            let _currentOwner = await I_ModuleRegistryProxy.connect(account_polymath_new).proxyOwner.staticCall();
            expect(_currentOwner).to.equal(account_polymath_new.address, "Should equal to the new owner");
        });

        it("Should change the implementation contract and version by the new owner", async () => {
            const ModuleRegistryFactory = await ethers.getContractFactory("ModuleRegistry");
            I_ModuleRegistry = await ModuleRegistryFactory.deploy();

            await I_ModuleRegistryProxy.connect(account_polymath_new).upgradeTo("1.2.0", I_ModuleRegistry.target);

            let c = await ethers.getContractAt("OwnedUpgradeabilityProxy", I_ModuleRegistryProxy.target);

            expect(ethers.toUtf8String(await readStorage(c.target, 11)).replace(/\0/g, "").replace(/\n/, "")).to.equal("1.2.0");

            const storageValue = await readStorage(c.target, 12);
            const addressFromStorage = ethers.getAddress("0x" + storageValue.slice(-40)); // Take last 40 chars (20 bytes)
            expect(addressFromStorage.toLowerCase()).to.equal(I_ModuleRegistry.target.toString().toLowerCase(), "Implementation address is not set correctly");
            
            I_MRProxied = await ethers.getContractAt("ModuleRegistry", I_ModuleRegistryProxy.target);
        });
        });
    });
