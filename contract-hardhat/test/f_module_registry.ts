import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration, ensureException, latestBlock } from "./helpers/utils";
import { takeSnapshot, increaseTime, revertToSnapshot } from "./helpers/time";
import { encodeProxyCall, encodeModuleCall } from "./helpers/encodeCall";
import { catchRevert } from "./helpers/exceptions";
import { deployPolyRegistryAndPolyToken, setUpPolymathNetwork } from "./helpers/createInstances";
import { initializeContracts } from "../scripts/polymath-deploy";

describe("ModuleRegistry", function() {
    // Accounts Variable declaration
    let account_polymath: HardhatEthersSigner;
    let account_investor1: HardhatEthersSigner;
    let account_issuer: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let account_investor2: HardhatEthersSigner;
    let account_fundsReceiver: HardhatEthersSigner;
    let account_delegate: HardhatEthersSigner;
    let account_temp: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    let balanceOfReceiver: bigint;

    let ID_snap: string;
    let message = "Transaction Should fail!";

    // Contract Instance Declaration
    let I_GeneralPermissionManagerFactory: any;
    let I_GeneralPermissionManagerLogic: any;
    let I_GeneralTransferManagerFactory: any;
    let I_SecurityTokenRegistryProxy: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralTransferManager: any;
    let I_ModuleRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_STFactory: any;
    let I_MRProxied: any;
    let I_SecurityToken: any;
    let I_ReclaimERC20: any;
    let I_STRProxied: any;
    let I_PolyToken: any;
    let I_MockFactory: any;
    let I_TestSTOFactory: any;
    let I_DummySTOFactory: any;
    let I_PolymathRegistry: any;
    let I_SecurityToken2: any;
    let I_STRGetter: any;
    let I_STGetter: any;
    let stGetter: any;

    // Contract Factories
    let DummySTOFactory: ContractFactory;
    let ModuleRegistryProxy: ContractFactory;
    let ModuleRegistryFactory: ContractFactory;
    let GeneralPermissionManagerFactory: ContractFactory;
    let GeneralPermissionManagerLogicFactory: ContractFactory;
    let MockFactoryFactory: ContractFactory;
    let TestSTOFactory: ContractFactory;

    // SecurityToken Details (Launched ST on the behalf of the issuer)
    const name = "Demo Token";
    const symbol = "det";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;

    // Module key
    const permissionManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;
    const budget = 0;
    const address_zero = ethers.ZeroAddress;
    const one_address = "0x0000000000000000000000000000000000000001";

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

    // delegate details
    const delegateDetails = "I am delegate ..";
    const TM_Perm = "FLAGS";

    // Capped STO details
    let startTime: number;
    let endTime: number;
    const cap = ethers.parseEther("10000");
    const rate = 1000;
    const fundRaiseType = [0];
    const STOParameters = ["uint256", "uint256", "uint256", "uint256", "uint8[]", "address"];
    const MRProxyParameters = ["address", "address"];

    let currentTime: number;

    before(async () => {

        // await initializeContracts();
        // Get signers
        accounts = await ethers.getSigners();
        
        currentTime = await latestTime();
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        account_investor1 = accounts[9];
        account_investor2 = accounts[6];
        account_fundsReceiver = accounts[4];
        account_delegate = accounts[5];
        account_temp = accounts[8];
        token_owner = account_issuer;

        // Get contract factories
        DummySTOFactory = await ethers.getContractFactory("DummySTO");
        ModuleRegistryProxy = await ethers.getContractFactory("ModuleRegistryProxy");
        ModuleRegistryFactory = await ethers.getContractFactory("ModuleRegistry");
        GeneralPermissionManagerFactory = await ethers.getContractFactory("GeneralPermissionManagerFactory");
        GeneralPermissionManagerLogicFactory = await ethers.getContractFactory("GeneralPermissionManager");
        MockFactoryFactory = await ethers.getContractFactory("MockFactory");
        TestSTOFactory = await ethers.getContractFactory("TestSTOFactory");

        // Step 1: Deploy the general PM ecosystem
        const instances = await setUpPolymathNetwork(account_polymath.address, token_owner.address);

        [
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
            I_STGetter
        ] = instances;

        // Deploy additional ModuleRegistryProxy
        I_ModuleRegistryProxy = await ModuleRegistryProxy.connect(account_polymath).deploy();
        await I_ModuleRegistryProxy.waitForDeployment();

        // Printing all the contract addresses
        console.log(`
        --------------------- Polymath Network Smart Contracts: ---------------------
        PolymathRegistry:                  ${I_PolymathRegistry.target}
        SecurityTokenRegistryProxy:        ${I_SecurityTokenRegistryProxy.target}
        SecurityTokenRegistry:             ${I_SecurityTokenRegistry.target}
        ModuleRegistry:                    ${I_ModuleRegistry.target}
        ModuleRegistryProxy:               ${I_ModuleRegistryProxy.target}
        FeatureRegistry:                   ${I_FeatureRegistry.target}

        STFactory:                         ${I_STFactory.target}
        GeneralTransferManagerFactory:     ${I_GeneralTransferManagerFactory.target}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Test the initialize the function", async () => {
        it("Should successfully update the implementation address -- fail because polymathRegistry address is 0x", async () => {
            const bytesProxy = encodeProxyCall(MRProxyParameters, [address_zero, account_polymath.address]);
            
            await expect(
                I_ModuleRegistryProxy.connect(account_polymath).upgradeToAndCall(
                    "1.0.0", 
                    I_ModuleRegistry.target, 
                    bytesProxy
                )
            ).to.be.revertedWith("Fail in executing the function of implementation contract");
        });

        it("Should successfully update the implementation address -- fail because owner address is 0x", async () => {
            const bytesProxy = encodeProxyCall(MRProxyParameters, [I_PolymathRegistry.target, address_zero]);
            
            await expect(
                I_ModuleRegistryProxy.connect(account_polymath).upgradeToAndCall(
                    "1.0.0", 
                    I_ModuleRegistry.target, 
                    bytesProxy
                )
            ).to.be.revertedWith("Fail in executing the function of implementation contract");
        });

        it("Should successfully update the implementation address -- fail because all params are 0x", async () => {
            const bytesProxy = encodeProxyCall(MRProxyParameters, [address_zero, address_zero]);
            
            await expect(
                I_ModuleRegistryProxy.connect(account_polymath).upgradeToAndCall(
                    "1.0.0", 
                    I_ModuleRegistry.target, 
                    bytesProxy
                )
            ).to.be.revertedWith("Fail in executing the function of implementation contract");
        });

        it("Should successfully update the implementation address", async () => {
            const bytesProxy = encodeProxyCall(MRProxyParameters, [I_PolymathRegistry.target, account_polymath.address]);
            await I_ModuleRegistryProxy.connect(account_polymath).upgradeToAndCall("1.0.0", I_ModuleRegistry.target, bytesProxy);
            I_MRProxied = await ethers.getContractAt("ModuleRegistry", I_ModuleRegistryProxy.target);

            await I_PolymathRegistry.connect(account_polymath).changeAddress("ModuleRegistry", I_ModuleRegistryProxy.target);

            const addr1 = await I_PolymathRegistry.getAddress("ModuleRegistry");
            console.log("PolymathRegistry contract address 3: ", I_PolymathRegistry.target);
            console.log("ModuleRegistry with getAddress Address: " , addr1);
            });
        });

        describe("Test cases for the ModuleRegistry", async () => {
        describe("Test case for the upgradeFromregistry", async () => {
            it("Should successfully update the registry contract address -- failed because of bad owner", async () => {
            await expect(I_MRProxied.connect(account_temp).updateFromRegistry()).to.be.reverted;
            });

            it("Should successfully update the registry contract addresses", async () => {
            await I_MRProxied.connect(account_polymath).updateFromRegistry();
            expect(await I_MRProxied.getAddressValue(ethers.id("securityTokenRegistry"))).to.equal(
                I_SecurityTokenRegistryProxy.target
            );
            expect(await I_MRProxied.getAddressValue(ethers.id("featureRegistry"))).to.equal(I_FeatureRegistry.target);
            expect(await I_MRProxied.getAddressValue(ethers.id("polyToken"))).to.equal(I_PolyToken.target);
            });
        });

        describe("Test the state variables", async () => {
            it("Should be the right owner", async () => {
            const _owner = await I_MRProxied.getAddressValue(ethers.id("owner"));
            expect(_owner).to.equal(account_polymath.address, "Owner should be the correct");
            });

            it("Should be the expected value of the paused and intialised variable", async () => {
            const _paused = await I_MRProxied.getBoolValue(ethers.id("paused"));
            expect(_paused).to.be.false;

            const _intialised = await I_MRProxied.getBoolValue(ethers.id("initialised"));
            expect(_intialised).to.be.true;
            });

            it("Should be the expected value of the polymath registry", async () => {
            const _polymathRegistry = await I_MRProxied.getAddressValue(ethers.id("polymathRegistry"));
            expect(_polymathRegistry).to.equal(
                I_PolymathRegistry.target,
                "Should be the right value of the address of the polymath registry"
            );
            });
        });

        describe("Test cases for the registering the module", async () => {
            it("Should fail to register the module -- when registerModule is paused", async () => {
            await I_MRProxied.connect(account_polymath).pause();

            await expect(I_MRProxied.connect(account_delegate).registerModule(I_GeneralTransferManagerFactory.target)).to.be.reverted;
            await I_MRProxied.connect(account_polymath).unpause();
            });

            it("Should register the module with the Module Registry", async () => {
            const tx = await I_MRProxied.connect(account_polymath).registerModule(I_GeneralTransferManagerFactory.target);
            await expect(tx)
                .to.emit(I_MRProxied, "ModuleRegistered")
                .withArgs(I_GeneralTransferManagerFactory.target, account_polymath.address);

            const _list = await I_MRProxied.getModulesByType(transferManagerKey);
            expect(_list.length).to.equal(0, "Length should be 0 - unverified");

            const _reputation = await I_MRProxied.getFactoryDetails(I_GeneralTransferManagerFactory.target);
            expect(_reputation[2].length).to.equal(0);
            });

            it("Should fail the register the module -- Already registered module", async () => {
            await expect(I_MRProxied.connect(account_polymath).registerModule(I_GeneralTransferManagerFactory.target)).to.be.reverted;
            });

            it("Should fail in registering the module-- type = 0", async () => {
            I_MockFactory = await MockFactoryFactory.connect(account_polymath).deploy(0, one_address, I_PolymathRegistry.target, true);

            await expect(I_MRProxied.connect(account_polymath).registerModule(I_MockFactory.target)).to.be.reverted;
            });

            it("Should successfully register the module -- fail because no module type uniqueness", async () => {
            await I_MockFactory.connect(account_polymath).switchTypes();
            await expect(I_MRProxied.connect(account_polymath).registerModule(I_MockFactory.target)).to.be.reverted;
            });
        });

        describe("Test case for verifyModule", async () => {
            it("Should fail in calling the verify module. Because msg.sender should be account_polymath", async () => {
            await expect(I_MRProxied.connect(account_temp).verifyModule(I_GeneralTransferManagerFactory.target)).to.be.reverted;
            });

            it("Should successfully verify the module -- true", async () => {
            const tx = await I_MRProxied.connect(account_polymath).verifyModule(I_GeneralTransferManagerFactory.target);
            await expect(tx).to.emit(I_MRProxied, "ModuleVerified").withArgs(I_GeneralTransferManagerFactory.target);

            const info = await I_MRProxied.getFactoryDetails(I_GeneralTransferManagerFactory.target);
            const _list = await I_MRProxied.getModulesByType(transferManagerKey);
            expect(_list.length).to.equal(1, "Length should be 1");
            expect(_list[0]).to.equal(I_GeneralTransferManagerFactory.target);
            expect(info[0]).to.be.true;
            expect(info[1]).to.equal(account_polymath.address);
            });

            it("Should fail in verifying the module. Because the module is not registered", async () => {
            await expect(I_MRProxied.connect(account_polymath).verifyModule(I_MockFactory.target)).to.be.reverted;
            });
        });

        describe("Test cases for the useModule function of the module registry", async () => {
            it("Deploy the securityToken", async () => {
            await I_PolyToken.getTokens(ethers.parseEther("2000"), account_issuer.address);
            await I_PolyToken.connect(account_issuer).approve(I_STRProxied.target, ethers.parseEther("2000"));
            await I_STRProxied.connect(account_issuer).registerNewTicker(account_issuer.address, symbol);
            const tx = await I_STRProxied.connect(account_issuer).generateNewSecurityToken(
                name,
                symbol,
                tokenDetails,
                true,
                account_issuer.address,
                0
            );
            const receipt = await tx.wait();
            const newSecurityTokenLog = receipt!.logs.find((log: any) => {
                try {
                return I_STRProxied.interface.parseLog(log)?.name === "NewSecurityToken";
                } catch {
                return false;
                }
            });
            assert.isNotNull(newSecurityTokenLog, "NewSecurityToken event not found");
            const parsedLog = I_STRProxied.interface.parseLog(newSecurityTokenLog as LogDescription);
            expect(parsedLog.args._ticker).to.equal(symbol.toUpperCase());
            I_SecurityToken = await ethers.getContractAt("SecurityToken", parsedLog.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", I_SecurityToken.target);
            expect(await stGetter.getTreasuryWallet()).to.equal(account_issuer.address, "Incorrect wallet set");
            });

            it("Should switch customModulesAllowed to true", async () => {
            expect(await I_FeatureRegistry.getFeatureStatus("customModulesAllowed")).to.be.false;
            await I_FeatureRegistry.connect(account_polymath).setFeatureStatus("customModulesAllowed", true);
            expect(await I_FeatureRegistry.getFeatureStatus("customModulesAllowed")).to.be.true;
            });

            it("Should successfully add verified module", async () => {
            I_GeneralPermissionManagerLogic = await GeneralPermissionManagerLogicFactory.connect(account_polymath).deploy(address_zero, address_zero);
            I_GeneralPermissionManagerFactory = await GeneralPermissionManagerFactory.connect(account_polymath).deploy(
                0,
                I_GeneralPermissionManagerLogic.target,
                I_PolymathRegistry.target,
                true
            );
            await I_MRProxied.connect(account_polymath).registerModule(I_GeneralPermissionManagerFactory.target);
            await I_MRProxied.connect(account_polymath).verifyModule(I_GeneralPermissionManagerFactory.target);
            const tx = await I_SecurityToken.connect(token_owner).addModule(I_GeneralPermissionManagerFactory.target, "0x", 0, 0, false);
            const receipt = await tx.wait();
            const moduleAddedLog = receipt!.logs.find((log: any) => {
                try {
                return I_SecurityToken.interface.parseLog(log)?.name === "ModuleAdded";
                } catch {
                return false;
                }
            });
            assert.isNotNull(moduleAddedLog, "ModuleAdded event not found");
            const parsedLog = I_SecurityToken.interface.parseLog(moduleAddedLog as LogDescription);
            expect(parsedLog.args._types[0]).to.equal(permissionManagerKey, "module doesn't get deployed");
            });

            it("Should failed in adding the TestSTOFactory module because not compatible with the current protocol version --lower", async () => {
            const I_TestSTOFactoryLogic = await DummySTOFactory.deploy(address_zero, address_zero);
            I_TestSTOFactory = await TestSTOFactory.connect(account_polymath).deploy(
                0,
                I_TestSTOFactoryLogic.target,
                I_PolymathRegistry.target,
                true
            );
            await I_MRProxied.connect(account_polymath).registerModule(I_TestSTOFactory.target);
            await I_MRProxied.connect(account_polymath).verifyModule(I_TestSTOFactory.target);
            // Taking the snapshot the revert the changes from here
            const id = await takeSnapshot();
            await I_TestSTOFactory.connect(account_polymath).changeSTVersionBounds("lowerBound", [3, 1, 0]);
            const _lstVersion = await I_TestSTOFactory.getLowerSTVersionBounds();
            expect(_lstVersion[0]).to.equal(3);
            expect(_lstVersion[1]).to.equal(1);
            expect(_lstVersion[2]).to.equal(0);
            const bytesData = encodeModuleCall(
                ["uint256", "uint256", "uint256", "string"],
                [await latestTime(), currentTime + duration.days(1), cap, "Test STO"]
            );
            console.log("I_TestSTOFactory:" + I_TestSTOFactory.target);
            await expect(I_SecurityToken.connect(token_owner).addModule(I_TestSTOFactory.target, bytesData, 0, 0, false)).to.be.reverted;
            await revertToSnapshot(id);
            });

            it("Should failed in adding the TestSTOFactory module because not compatible with the current protocol version --upper", async () => {
                await I_TestSTOFactory.connect(account_polymath).changeSTVersionBounds("upperBound", [0, 0, 1]);
                const _ustVersion = await I_TestSTOFactory.getUpperSTVersionBounds();
                expect(_ustVersion[0]).to.equal(0);
                expect(_ustVersion[2]).to.equal(1);
                await I_STRProxied.connect(account_polymath).setProtocolFactory(I_STFactory.target, 2, 0, 1);
                await I_STRProxied.connect(account_polymath).setLatestVersion(2, 0, 1);
                // Generate the new securityToken
                const newSymbol = "TORO";
                await I_PolyToken.getTokens(ethers.parseEther("2000"), account_issuer.address);
                await I_PolyToken.connect(account_issuer).approve(I_STRProxied.target, ethers.parseEther("2000"));
                await I_STRProxied.connect(account_issuer).registerNewTicker(account_issuer.address, newSymbol);
                const tx = await I_STRProxied.connect(account_issuer).generateNewSecurityToken(
                    name,
                    newSymbol,
                    tokenDetails,
                    true,
                    account_issuer.address,
                    0
                );
                const receipt = await tx.wait();
                const newSecurityTokenLog = receipt!.logs.find((log: any) => {
                    try {
                        return I_STRProxied.interface.parseLog(log)?.name === "NewSecurityToken";
                    } catch {
                        return false;
                    }
                });
                assert.isNotNull(newSecurityTokenLog, "NewSecurityToken event not found");
                const parsedLog = I_STRProxied.interface.parseLog(newSecurityTokenLog as LogDescription);
                expect(parsedLog.args._ticker).to.equal(newSymbol.toUpperCase());
                I_SecurityToken2 = await ethers.getContractAt("SecurityToken", parsedLog.args._securityTokenAddress);
                stGetter = await ethers.getContractAt("STGetter", I_SecurityToken2.target);
                const bytesData = encodeModuleCall(
                    ["uint256", "uint256", "uint256", "string"],
                    [await latestTime(), currentTime + duration.days(1), cap, "Test STO"]
                );

                await expect(
                    I_SecurityToken2.connect(token_owner).addModule(I_TestSTOFactory.target, bytesData, 0, 0, false)
                ).to.be.reverted;
            });
        });

        describe("Test case for the getModulesByTypeAndToken()", async () => {
            it("Should get the list of available modules when the customModulesAllowed is not allowed", async () => {
                await I_FeatureRegistry.connect(account_polymath).setFeatureStatus("customModulesAllowed", false);
                const _list = await I_MRProxied.getModulesByTypeAndToken(3, I_SecurityToken.target);
                console.log(_list);
                expect(_list.length).to.equal(0);
            });
        });

        describe("Test cases for getters", async () => {
            it("Check getter - ", async () => {
                console.log("getModulesByType:");
                for (let i = 0; i < 5; i++) {
                    const _list = await I_MRProxied.getModulesByType(i);
                    console.log("Type: " + i + ":" + _list);
                }
                console.log("getModulesByTypeAndToken:");
                for (let i = 0; i < 5; i++) {
                    const _list = await I_MRProxied.getModulesByTypeAndToken(i, I_SecurityToken.target);
                    console.log("Type: " + i + ":" + _list);
                }
                console.log("getTagsByType:");
                for (let i = 0; i < 5; i++) {
                    const _list = await I_MRProxied.getTagsByType(i);
                    console.log("Type: " + i + ":" + _list[1]);
                    console.log("Type: " + i + ":" + _list[0].map((x: string) => ethers.toUtf8String(x).replace(/\0/g, "")));
                }
                console.log("getTagsByTypeAndToken:");
                for (let i = 0; i < 5; i++) {
                    const _list = await I_MRProxied.getTagsByTypeAndToken(i, I_SecurityToken.target);
                    console.log("Type: " + i + ":" + _list[1]);
                    console.log("Type: " + i + ":" + _list[0].map((x: string) => ethers.toUtf8String(x).replace(/\0/g, "")));
                }
            });
        });

        describe("Test cases for removeModule()", async () => {
            it("Should successfully remove module and delete data if msg.sender is curator", async () => {
                const snap = await takeSnapshot();
                console.log("All modules: " + (await I_MRProxied.getModulesByType(3)));
                const modules = await I_MRProxied.getModulesByType(3);
                const sto1 = modules[0];

                expect(sto1).to.equal(I_TestSTOFactory.target);
                expect((await I_MRProxied.getModulesByType(3)).length).to.equal(1);

                const tx = await I_MRProxied.connect(account_polymath).removeModule(sto1);

                await expect(tx).to.emit(I_MRProxied, "ModuleRemoved").withArgs(sto1, account_polymath.address);

                // delete related data
                expect(await I_MRProxied.getUintValue(ethers.solidityPackedKeccak256(["string", "address"], ["registry", sto1]))).to.equal(0);
                expect((await I_MRProxied.getFactoryDetails(sto1))[1]).to.equal(address_zero);
                expect((await I_MRProxied.getModulesByType(3)).length).to.equal(0);
                expect(await I_MRProxied.getBoolValue(ethers.solidityPackedKeccak256(["string", "address"], ["verified", sto1]))).to.be.false;

                await revertToSnapshot(snap);
            });
        });

        describe("Test cases for IRegistry functionality", async () => {
            describe("Test cases for reclaiming funds", async () => {
                it("Should successfully reclaim POLY tokens -- fail because token address will be 0x", async () => {
                    await I_PolyToken.connect(token_owner).transfer(I_MRProxied.target, ethers.parseEther("1"));
                    await expect(I_MRProxied.connect(account_polymath).reclaimERC20(address_zero)).to.be.reverted;
                });

                it("Should successfully reclaim POLY tokens -- not authorised", async () => {
                    await expect(I_MRProxied.connect(account_temp).reclaimERC20(I_PolyToken.target)).to.be.reverted;
                });

                it("Should successfully reclaim POLY tokens", async () => {
                    await I_PolyToken.getTokens(ethers.parseEther("1"), I_MRProxied.target);
                    const bal1 = await I_PolyToken.balanceOf(account_polymath.address);
                    await I_MRProxied.connect(account_polymath).reclaimERC20(I_PolyToken.target);
                    const bal2 = await I_PolyToken.balanceOf(account_polymath.address);
                    expect(bal2).to.be.gt(bal1);
                });
            });

            describe("Test cases for pausing the contract", async () => {
                it("Should fail to pause if msg.sender is not owner", async () => {
                    await expect(I_MRProxied.connect(account_temp).pause()).to.be.reverted;
                });

                it("Should successfully pause the contract", async () => {
                    await I_MRProxied.connect(account_polymath).pause();
                    const status = await I_MRProxied.getBoolValue(ethers.id("paused"));
                    expect(status).to.be.true;
                });

                it("Should fail to unpause if msg.sender is not owner", async () => {
                    await expect(I_MRProxied.connect(account_temp).unpause()).to.be.reverted;
                });

                it("Should successfully unpause the contract", async () => {
                    await I_MRProxied.connect(account_polymath).unpause();
                    const status = await I_MRProxied.getBoolValue(ethers.id("paused"));
                    expect(status).to.be.false;
                });
            });

            describe("Test cases for the ReclaimTokens contract", async () => {
                before(async () => {
                    I_ReclaimERC20 = await ethers.getContractAt("ReclaimTokens", I_FeatureRegistry.target);
                });

                it("Should successfully reclaim POLY tokens -- fail because token address will be 0x", async () => {
                    await I_PolyToken.connect(token_owner).transfer(I_ReclaimERC20.target, ethers.parseEther("1"));
                    await expect(I_ReclaimERC20.connect(account_polymath).reclaimERC20(address_zero)).to.be.reverted;
                });

                it("Should successfully reclaim POLY tokens -- not authorised", async () => {
                    await expect(I_ReclaimERC20.connect(account_temp).reclaimERC20(I_PolyToken.target)).to.be.reverted;
                });

                it("Should successfully reclaim POLY tokens", async () => {
                    await I_PolyToken.getTokens(ethers.parseEther("1"), I_ReclaimERC20.target);
                    const bal1 = await I_PolyToken.balanceOf(account_polymath.address);
                    await I_ReclaimERC20.connect(account_polymath).reclaimERC20(I_PolyToken.target);
                    const bal2 = await I_PolyToken.balanceOf(account_polymath.address);
                    expect(bal2).to.be.gt(bal1);
                });
            });

            describe("Test case for the PolymathRegistry", async () => {
                it("Should successfully get the address -- fail because key is not exist", async () => {
                    catchRevert(I_PolymathRegistry.getAddress("PolyOracle"));
                });

                it("Should successfully get the address", async () => {
                    const _moduleR = await I_PolymathRegistry.getAddressForTest("ModuleRegistry");
                    expect(_moduleR).to.equal(await I_ModuleRegistryProxy.getAddress());
                });
            });

            describe("Test cases for the transferOwnership", async () => {
                it("Should fail to transfer the ownership -- not authorised", async () => {
                    await expect(I_MRProxied.connect(account_issuer).transferOwnership(account_temp.address)).to.be.reverted;
                });

                it("Should fail to transfer the ownership -- 0x address is not allowed", async () => {
                    await expect(I_MRProxied.connect(account_polymath).transferOwnership(address_zero)).to.be.reverted;
                });

                it("Should successfully transfer the ownership of the STR", async () => {
                    const tx = await I_MRProxied.connect(account_polymath).transferOwnership(account_temp.address);
                    await expect(tx)
                        .to.emit(I_MRProxied, "OwnershipTransferred")
                        .withArgs(account_polymath.address, account_temp.address);
                });

                it("New owner has authorisation", async () => {
                    const tx = await I_MRProxied.connect(account_temp).transferOwnership(account_polymath.address);
                    await expect(tx)
                        .to.emit(I_MRProxied, "OwnershipTransferred")
                        .withArgs(account_temp.address, account_polymath.address);
                });
            });
        });
    });
});
