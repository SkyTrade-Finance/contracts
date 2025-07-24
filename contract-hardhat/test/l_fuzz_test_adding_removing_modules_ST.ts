import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from './helpers/latestTime';
import { pk } from './helpers/testprivateKey';
import { duration, latestBlock } from './helpers/utils';
import { takeSnapshot, revertToSnapshot } from './helpers/time';
import { catchRevert } from "./helpers/exceptions";
import { setUpPolymathNetwork, deployGPMAndVerifyed } from "./helpers/createInstances";
import { encodeModuleCall } from "./helpers/encodeCall";

describe('GeneralPermissionManager', function() {

    // Accounts Variable declaration
    let account_polymath: HardhatEthersSigner;
    let account_issuer: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let token_owner_pk: string;
    let account_investor1: HardhatEthersSigner;
    let account_investor2: HardhatEthersSigner;
    let account_investor3: HardhatEthersSigner;
    let account_investor4: HardhatEthersSigner;
    let account_delegate: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    // Contract Instance Declaration
    let I_GeneralPermissionManagerFactory: any;
    let P_GeneralPermissionManagerFactory: any;
    let I_SecurityTokenRegistryProxy: any;
    let P_GeneralPermissionManager: any;
    let I_GeneralTransferManagerFactory: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralTransferManager: any;
    let I_ModuleRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_DummySTOFactory: any;
    let I_STFactory: any;
    let I_SecurityToken: any;
    let I_MRProxied: any;
    let I_STRProxied: any;
    let I_PolyToken: any;
    let I_PolymathRegistry: any;
    let I_STGetter: any;
    let stGetter: any;

    // SecurityToken Details
    const name = "Team";
    const symbol = "sap";
    const tokenDetails = "This is equity type of issuance";
    // Module key
    const delegateManagerKey = 1;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

    let testRepeat = 20;

    // define factories and modules for fuzz test
    var factoriesAndModules = [
        { factory: 'I_CountTransferManagerFactory', module: 'CountTransferManager'},
        { factory: 'I_ManualApprovalTransferManagerFactory', module: 'ManualApprovalTransferManager'},
        { factory: 'I_VolumeRestrictionTransferManagerFactory', module: 'VolumeRestrictionTransferManager'},
        { factory: 'I_PercentageTransferManagerFactory', module: 'PercentageTransferManager'},
    ];

    let totalModules = factoriesAndModules.length;
    let bytesSTO: any;

    before(async () => {
        // Get signers
        accounts = await ethers.getSigners();
        
        // Accounts setup
        account_polymath = accounts[0];
        account_issuer = accounts[1];

        token_owner = account_issuer;
        token_owner_pk = pk.account_1;

        account_investor1 = accounts[8];
        account_investor2 = accounts[9];
        account_investor3 = accounts[5];
        account_investor4 = accounts[6];
        account_delegate = accounts[7];

        // Step 1: Deploy the genral PM ecosystem
        let instances = await setUpPolymathNetwork(account_polymath.address, token_owner.address);

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
            I_STGetter
        ] = instances;

        // STEP 5: Deploy the GeneralDelegateManagerFactory
        [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0);
        // STEP 6: Deploy the GeneralDelegateManagerFactory
        [P_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, ethers.parseEther("500"));

        // Printing all the contract addresses
        console.log(`
        --------------------- Polymath Network Smart Contracts: ---------------------
        PolymathRegistry:                  ${await I_PolymathRegistry.getAddress()}
        SecurityTokenRegistryProxy:        ${await I_SecurityTokenRegistryProxy.getAddress()}
        SecurityTokenRegistry:             ${await I_SecurityTokenRegistry.getAddress()}
        ModuleRegistryProxy                ${await I_ModuleRegistryProxy.getAddress()}
        ModuleRegistry:                    ${await I_ModuleRegistry.getAddress()}
        FeatureRegistry:                   ${await I_FeatureRegistry.getAddress()}

        STFactory:                         ${await I_STFactory.getAddress()}
        GeneralTransferManagerFactory:     ${await I_GeneralTransferManagerFactory.getAddress()}
        GeneralPermissionManagerFactory:   ${await I_GeneralPermissionManagerFactory.getAddress()}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Generate the SecurityToken", async () => {
        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFee);
            let tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbol);
            
            const receipt = await tx.wait();
            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = await I_STRProxied.getAddress();
        
            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        assert.equal(parsed.args._owner, token_owner.address);
                        assert.equal(parsed.args._ticker, symbol.toUpperCase());
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            assert.equal(eventFound, true);
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFee);
            let tx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(name, symbol, tokenDetails, false, token_owner.address, 0);

            const receipt = await tx.wait();
            let securityTokenEvent: LogDescription | null = null;

            for (const log of receipt!.logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "NewSecurityToken") {
                        securityTokenEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log with STRProxied: ${err.message}`);
                }
            }

            // Verify the successful generation of the security token
            assert.equal(securityTokenEvent!.args._ticker, symbol.toUpperCase(), "SecurityToken doesn't get deployed");

            I_SecurityToken = await ethers.getContractAt("SecurityToken", securityTokenEvent!.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", await I_SecurityToken.getAddress());
            assert.equal(await stGetter.getTreasuryWallet(), token_owner.address, "Incorrect wallet set");
            
            // Find ModuleAdded event in the logs
            let moduleAddedEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_SecurityToken.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModuleAdded") {
                        moduleAddedEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log with SecurityToken: ${err.message}`);
                }
            }

            // Verify that GeneralTransferManager module get added successfully or not
            assert.equal(Number(moduleAddedEvent!.args._types[0]), 2);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            assert.equal(nameBytes32, "GeneralTransferManager");
        });

        it("Should initialize the auto attached modules", async () => {
            const moduleData = (await stGetter.getModulesByType(2))[0];
            I_GeneralTransferManager = await ethers.getContractAt("GeneralTransferManager", moduleData);
        });

        it("Should successfully attach the General permission manager factory with the security token -- failed because Token is not paid", async () => {
            // Note: getTokens is a non-standard function, assuming it exists on the PolyToken contract for testing.
            // The original test passed the signer object, but address is more common. Adjust if necessary.
            await I_PolyToken.getTokens(ethers.parseEther("2000"), token_owner.address);
            
            const pGPMFactoryAddress = await P_GeneralPermissionManagerFactory.getAddress();
            await expect(
            I_SecurityToken.connect(token_owner).addModule(pGPMFactoryAddress, ethers.ZeroHash, ethers.parseEther("2000"), 0, false)
            ).to.be.reverted;
        });

        it("Should successfully attach the General permission manager factory with the security token", async () => {
            let snapId = await takeSnapshot();
            const securityTokenAddress = await I_SecurityToken.getAddress();
            await I_PolyToken.connect(token_owner).transfer(securityTokenAddress, ethers.parseEther("2000"));
            
            const pGPMFactoryAddress = await P_GeneralPermissionManagerFactory.getAddress();
            const tx = await I_SecurityToken.connect(token_owner).addModule(
            pGPMFactoryAddress,
            ethers.ZeroHash,
            ethers.parseEther("2000"),
            0,
            false
            );
            
            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs.map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find((e): e is LogDescription => e !== null && e.name === 'ModuleAdded');

            assert.isNotNull(moduleAddedEvent, "ModuleAdded event not found");
            assert.equal(moduleAddedEvent!.args._types[0], delegateManagerKey, "General Permission Manager doesn't get deployed");
            
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            assert.equal(moduleName, "GeneralPermissionManager", "GeneralPermissionManagerFactory module was not added");
            
            P_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);
            await revertToSnapshot(snapId);
        });

        it("Should successfully attach the General permission manager factory with the security token", async () => {
            const iGPMFactoryAddress = await I_GeneralPermissionManagerFactory.getAddress();
            const tx = await I_SecurityToken.connect(token_owner).addModule(iGPMFactoryAddress, ethers.ZeroHash, 0, 0, false);
            
            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs.map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find((e): e is LogDescription => e !== null && e.name === 'ModuleAdded');

            assert.isNotNull(moduleAddedEvent, "ModuleAdded event not found");
            assert.equal(moduleAddedEvent!.args._types[0], delegateManagerKey, "General Permission Manager doesn't get deployed");
            
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            assert.equal(moduleName, "GeneralPermissionManager", "GeneralPermissionManagerFactory module was not added");
            
            I_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);
        });
        });

    });
