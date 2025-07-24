import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration, ensureException, latestBlock } from "./helpers/utils";
import { getFreezeIssuanceAck, getDisableControllerAck } from "./helpers/signData";
import { takeSnapshot, increaseTime, revertToSnapshot } from "./helpers/time";
import { encodeProxyCall, encodeModuleCall } from "./helpers/encodeCall";
import { catchRevert } from "./helpers/exceptions";
import {
    setUpPolymathNetwork,
    deployGPMAndVerifyed,
} from "./helpers/createInstances";

describe("SecurityToken", function() {
    // Accounts Variable declaration
    let account_polymath: HardhatEthersSigner;
    let account_investor1: HardhatEthersSigner;
    let account_issuer: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let disableControllerAckHash: string;
    let freezeIssuanceAckHash: string;
    let account_investor2: HardhatEthersSigner;
    let account_investor3: HardhatEthersSigner;
    let account_affiliate1: HardhatEthersSigner;
    let account_affiliate2: HardhatEthersSigner;
    let account_fundsReceiver: HardhatEthersSigner;
    let account_delegate: HardhatEthersSigner;
    let account_temp: HardhatEthersSigner;
    let account_controller: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];
    const address_zero = ethers.ZeroAddress;
    const one_address = "0x0000000000000000000000000000000000000001";

    let balanceOfReceiver: bigint;
    // investor Details
    let fromTime: number;
    let toTime: number;
    let expiryTime: number;

    let ID_snap: string;
    const message = "Transaction Should Fail!!";
    const uri = "https://www.gogl.bts.fly";
    const docHash = ethers.encodeBytes32String("hello");

    const empty_hash = "0x0000000000000000000000000000000000000000000000000000000000000000";

    // Contract Instance Declaration
    let I_GeneralPermissionManagerFactory: any;
    let I_LockUpTransferManagerFactory: any;
    let I_LockUpTransferManager: any;
    let I_SecurityTokenRegistryProxy: any;
    let I_GeneralTransferManagerFactory: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralTransferManager: any;
    let I_ModuleRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_STFactory: any;
    let I_SecurityToken: any;
    let I_SecurityToken2: any;
    let I_STRProxied: any;
    let I_MRProxied: any;
    let I_PolyToken: any;
    let I_PolymathRegistry: any;
    let Factory: any;
    let I_STRGetter: any;
    let I_STGetter: any;
    let I_STGetter2: any;
    let stGetter: any;

    // SecurityToken Details (Launched ST on the behalf of the issuer)
    const name = "Demo Token";
    const symbol = "DET";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    let snap_Id: string;
    // Module key
    const permissionManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;
    const burnKey = 5;
    const budget = 0;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

    // delagate details
    const delegateDetails = ethers.encodeBytes32String("I am delegate ..");
    const TM_Perm = ethers.encodeBytes32String("ADMIN");
    const TM_Perm_Whitelist = ethers.encodeBytes32String("ADMIN");

    // Capped STO details
    let startTime: number;
    let endTime: number;
    const cap = ethers.parseEther("10000");
    const rate = ethers.parseEther("1000");
    const fundRaiseType = [0];
    const cappedSTOSetupCost = ethers.parseEther("20000");
    const cappedSTOSetupCostPOLY = ethers.parseEther("80000");
    const maxCost = cappedSTOSetupCostPOLY;
    const STOParameters = ["uint256", "uint256", "uint256", "uint256", "uint8[]", "address"];

    let currentTime: number;

    async function readStorage(contractAddress: string, slot: number): Promise<string> {
        return await ethers.provider.getStorage(contractAddress, slot);
    }

    before(async () => {
        // Get signers
        accounts = await ethers.getSigners();
        
        currentTime = await latestTime();
        
        // Account assignments
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        account_affiliate1 = accounts[2];
        account_affiliate2 = accounts[3];
        account_fundsReceiver = accounts[4];
        account_delegate = accounts[5];
        account_investor2 = accounts[6];
        account_investor3 = accounts[7];
        account_temp = accounts[8];
        account_investor1 = accounts[9];

        token_owner = account_issuer;
        account_controller = account_temp;

        // Step:1 Create the polymath ecosystem contract instances
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

        // STEP 2: Deploy the GeneralPermissionManagerFactory
        [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0n);

        // Printing all the contract addresses
        console.log(`
        --------------------- Polymath Network Smart Contracts: ---------------------
        PolymathRegistry:                  ${I_PolymathRegistry.target}
        SecurityTokenRegistryProxy:        ${I_SecurityTokenRegistryProxy.target}
        SecurityTokenRegistry:             ${I_SecurityTokenRegistry.target}
        ModuleRegistryProxy:               ${I_ModuleRegistryProxy.target}
        ModuleRegistry:                    ${I_ModuleRegistry.target}
        FeatureRegistry:                   ${I_FeatureRegistry.target}

        STFactory:                         ${I_STFactory.target}
        GeneralTransferManagerFactory:     ${I_GeneralTransferManagerFactory.target}
        GeneralPermissionManagerFactory:   ${I_GeneralPermissionManagerFactory.target}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Generate the SecurityToken", async () => {
        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFee);
            const tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbol);
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
                        assert.equal(parsed.args._ticker, symbol);
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            assert.isTrue(eventFound);
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFee);

            const tx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(
                name,
                symbol,
                tokenDetails,
                false,
                token_owner.address,
                0
            );
            const receipt = await tx.wait();
            
            // Verify the successful generation of the security token
            for (let i = 0; i < receipt!.logs.length; i++) {
                console.log("LOGS: " + i);
                console.log(receipt!.logs[i]);
            }
            
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
            
            assert.isNotNull(securityTokenEvent);
            assert.equal(securityTokenEvent!.args._ticker, symbol, "SecurityToken doesn't get deployed");

            I_SecurityToken = await ethers.getContractAt("SecurityToken", securityTokenEvent!.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", I_SecurityToken.target);
            assert.equal(await stGetter.getTreasuryWallet(), token_owner.address, "Incorrect wallet set");
            
            // Find ModuleAdded event
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
            assert.isNotNull(moduleAddedEvent);
            assert.equal(Number(moduleAddedEvent!.args._types[0]), transferManagerKey);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            assert.equal(nameBytes32, "GeneralTransferManager");
            assert.equal(await I_SecurityToken.owner(), token_owner.address);
            assert.equal(await I_SecurityToken.initialized(), true);
        });

        it("Should not allow unauthorized address to change name", async() => {
            await catchRevert(I_SecurityToken.changeName("new token name"));
        });

        it("Should not allow 0 length name", async () => {
            await expect(I_SecurityToken.connect(token_owner).changeName("")).to.be.reverted;
        });

        it("Should allow authorized address to change name", async () => {
            const snapId = await takeSnapshot();
            await I_SecurityToken.connect(token_owner).changeName("new token name");
            const newNameBytes32 = await I_SecurityToken.name();
            assert.equal(newNameBytes32.replace(/\u0000/g, ''), "new token name");
            await revertToSnapshot(snapId);
        });

        it("Should initialize the auto attached modules", async () => {
            const moduleData = (await stGetter.getModulesByType(transferManagerKey))[0];
            I_GeneralTransferManager = await ethers.getContractAt("GeneralTransferManager", moduleData);

            assert.notEqual(I_GeneralTransferManager.target, address_zero, "GeneralTransferManager contract was not deployed");
        });

        it("Should fail to change the treasury wallet address -- because of wrong owner", async () => {
            await expect(
            I_SecurityToken.connect(account_temp).changeTreasuryWallet(account_fundsReceiver.address)
            ).to.be.reverted;
        });

        it("Should successfully change the treasury wallet address", async () => {
            await I_SecurityToken.connect(token_owner).changeTreasuryWallet(account_fundsReceiver.address);
            assert.equal(await stGetter.getTreasuryWallet(), account_fundsReceiver.address, "Incorrect wallet set");
        });

        it("Should mint the tokens before attaching the STO -- fail only be called by the owner", async () => {
            const localCurrentTime = await latestTime();
            const localToTime = localCurrentTime + duration.days(100);
            const localExpiryTime = localToTime + duration.days(100);

            const tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCData(
                account_affiliate1.address,
                localCurrentTime,
                localCurrentTime,
                localExpiryTime
            );
            
            // Assuming the event signature is ModifyKYCData(address, address, uint256, uint256, uint256)
            // and the second address is the sender. This might need adjustment based on the actual event.
            await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData");

            await expect(
                I_SecurityToken.connect(account_delegate).issue(account_investor1.address, ethers.parseEther("100"), ethers.ZeroHash)
            ).to.be.reverted;
        });

        it("Should issue the tokens before attaching the STO", async () => {
            await I_SecurityToken.connect(token_owner).issue(account_affiliate1.address, ethers.parseEther("100"), ethers.ZeroHash);
            const balance = await I_SecurityToken.balanceOf(account_affiliate1.address);
            expect(balance).to.equal(ethers.parseEther("100"));
        });

        it("Should issue the multi tokens before attaching the STO -- fail only be called by the owner", async () => {
            const localCurrentTime = await latestTime();
            const localToTime = localCurrentTime + duration.days(100);
            const localExpiryTime = localToTime + duration.days(100);

            const tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCData(
            account_affiliate2.address,
            localCurrentTime,
            localCurrentTime,
            localExpiryTime
            );

            await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData");

            await expect(
            I_SecurityToken.connect(account_delegate).issueMulti(
                [account_affiliate1.address, account_affiliate2.address],
                [ethers.parseEther("100"), ethers.parseEther("110")]
            )
            ).to.be.reverted;
        });

        it("Should check the balance of the locked tokens", async () => {
            const totalBalance = await I_SecurityToken.balanceOf(account_affiliate1.address);
            const lockedBalance = await I_SecurityToken.balanceOfByPartition(ethers.encodeBytes32String("LOCKED"), account_affiliate1.address);
            const unlockedBalance = await I_SecurityToken.balanceOfByPartition(ethers.encodeBytes32String("UNLOCKED"), account_affiliate1.address);

            console.log(`\t Total balance: ${ethers.formatEther(totalBalance)}`);
            console.log(`\t Locked balance: ${ethers.formatEther(lockedBalance)}`);
            console.log(`\t Unlocked balance: ${ethers.formatEther(unlockedBalance)}`);

            expect(lockedBalance).to.equal(0n);
            expect(unlockedBalance).to.equal(totalBalance);

            const wrongPartitionBalance = await I_SecurityToken.balanceOfByPartition(ethers.encodeBytes32String("OCKED"), account_affiliate1.address);
            console.log(`\t Wrong partition: ${ethers.formatEther(wrongPartitionBalance)}`);
            expect(wrongPartitionBalance).to.equal(0n);
        });

        it("Should fail due to array length mismatch", async () => {
            await expect(
            I_SecurityToken.connect(token_owner).issueMulti(
                [account_affiliate1.address, account_affiliate2.address],
                [ethers.parseEther("100")]
            )
            ).to.be.reverted;
        });

        it("Should mint to lots of addresses and check gas", async () => {
            const id = await takeSnapshot();
            await I_GeneralTransferManager.connect(token_owner).modifyTransferRequirementsMulti(
            [0, 1, 2],
            [false, false, false],
            [false, false, false],
            [false, false, false],
            [false, false, false]
            );
            const id2 = await takeSnapshot();
            const mockInvestors = [];
            const mockAmount = [];
            for (let i = 0; i < 40; i++) {
            mockInvestors.push("0x1000000000000000000000000000000000000000".substring(0, 42 - i.toString().length) + i.toString());
            mockAmount.push(ethers.parseEther("1"));
            }

            let tx = await I_SecurityToken.connect(token_owner).issueMulti(mockInvestors, mockAmount);
            let receipt = await tx.wait();
            console.log("Cost for issuing to 40 addresses without checkpoint: " + receipt!.gasUsed.toString());
            await revertToSnapshot(id2);

            await I_SecurityToken.connect(token_owner).createCheckpoint();

            tx = await I_SecurityToken.connect(token_owner).issueMulti(mockInvestors, mockAmount);
            receipt = await tx.wait();
            console.log("Cost for issuing to 40 addresses with checkpoint: " + receipt!.gasUsed.toString());
            await revertToSnapshot(id);
        });

        it("Should issue the tokens for multiple afiliated investors before attaching the STO", async () => {
            await I_SecurityToken.connect(token_owner).issueMulti(
            [account_affiliate1.address, account_affiliate2.address],
            [ethers.parseEther("100"), ethers.parseEther("110")]
            );
            const balance1 = await I_SecurityToken.balanceOf(account_affiliate1.address);
            expect(balance1).to.equal(ethers.parseEther("200"));
            const balance2 = await I_SecurityToken.balanceOf(account_affiliate2.address);
            expect(balance2).to.equal(ethers.parseEther("110"));
        });

        it("Should ST be issuable", async () => {
            expect(await stGetter.isIssuable()).to.be.true;
        });

        it("Should finish the minting -- fail because owner didn't sign correct acknowledegement", async () => {
            const trueButOutOfPlaceAcknowledegement = ethers.encodeBytes32String("F O'Brien is the best!");
            await expect(
            I_SecurityToken.connect(token_owner).freezeIssuance(trueButOutOfPlaceAcknowledegement)
            ).to.be.reverted;
        });

        it("Should finish the minting -- fail because msg.sender is not the owner", async () => {
            freezeIssuanceAckHash = await getFreezeIssuanceAck(I_SecurityToken.target, token_owner);
            await expect(
                I_SecurityToken.connect(account_temp).freezeIssuance(freezeIssuanceAckHash)
            ).to.be.reverted;
        });

        it("Should finish minting & restrict the further minting", async () => {
            const id = await takeSnapshot();
            await I_SecurityToken.connect(token_owner).freezeIssuance(freezeIssuanceAckHash);
            expect(await stGetter.isIssuable()).to.be.false;
            await expect(
            I_SecurityToken.connect(token_owner).issue(account_affiliate1.address, ethers.parseEther("100"), ethers.ZeroHash)
            ).to.be.reverted;
            await revertToSnapshot(id);
        });

        it("Should successfully issue tokens while STO attached", async () => {
            await I_SecurityToken.connect(token_owner).issue(account_affiliate1.address, ethers.parseEther("100"), ethers.ZeroHash);
            const balance = await I_SecurityToken.balanceOf(account_affiliate1.address);
            expect(balance).to.equal(ethers.parseEther("300"));
        });

        it("Should fail to issue tokens while STO attached after freezeMinting called", async () => {
            const id = await takeSnapshot();
            await I_SecurityToken.connect(token_owner).freezeIssuance(freezeIssuanceAckHash);
            await expect(
                I_SecurityToken.connect(token_owner).issue(account_affiliate1.address, ethers.parseEther("100"), ethers.ZeroHash)
            ).to.be.reverted;
            await revertToSnapshot(id);
        });
        });

        describe("Module related functions", async () => {
        it("Should get the modules of the securityToken by index (not added into the security token yet)", async () => {
            const moduleData = await stGetter.getModule(token_owner.address);
            assert.equal(ethers.decodeBytes32String(moduleData[0]).replace(/\u0000/g, ''), "");
            assert.equal(moduleData[1], address_zero);
        });

        it("Should get the modules of the securityToken by name (not added into the security token yet)", async () => {
            const moduleData = await stGetter.getModulesByName(ethers.encodeBytes32String("GeneralPermissionManager"));
            expect(moduleData).to.have.lengthOf(0);
        });

        it("Should get the modules of the securityToken by name (not added into the security token yet)", async () => {
            const moduleData = await stGetter.getModulesByName(ethers.encodeBytes32String("CountTransferManager"));
            expect(moduleData).to.have.lengthOf(0);
        });

        it("Should fail in updating the token details", async () => {
            await expect(
            I_SecurityToken.connect(account_delegate).updateTokenDetails("new token details")
            ).to.be.reverted;
        });

        it("Should update the token details", async () => {
            const tx = await I_SecurityToken.connect(token_owner).updateTokenDetails("new token details");
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
        
            let eventFound = false;
            for (const log of fullReceipt.logs!) {
                try {
                    const parsed = I_SecurityToken.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "UpdateTokenDetails") { 
                        expect(parsed.args._oldDetails).to.equal(tokenDetails);
                        expect(parsed.args._newDetails).to.equal("new token details");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
        });

        it("Should successfully remove the general transfer manager module from the securityToken -- fails msg.sender should be Owner", async () => {
            await expect(
            I_SecurityToken.connect(account_delegate).removeModule(I_GeneralTransferManager.target)
            ).to.be.reverted;
        });

        it("Should fail to remove the module - module not archived", async () => {
            await expect(
            I_SecurityToken.connect(token_owner).removeModule(I_GeneralTransferManager.target)
            ).to.be.reverted;
        });

        it("Should fail to remove the module - incorrect address", async () => {
            await expect(I_SecurityToken.connect(token_owner).removeModule(address_zero)).to.be.reverted;
        });

        it("Should successfully remove the general transfer manager module from the securityToken", async () => {
            const key = await takeSnapshot();
            await I_SecurityToken.connect(token_owner).archiveModule(I_GeneralTransferManager.target);
            const tx = await I_SecurityToken.connect(token_owner).removeModule(I_GeneralTransferManager.target);
            
            const receipt = await tx.wait();
            const moduleRemovedEvent = receipt!.logs.map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch (e) { return null; }
            }).find(e => e && e.name === 'ModuleRemoved');

            assert.isNotNull(moduleRemovedEvent);
            assert.equal(Number(moduleRemovedEvent!.args._types[0]), transferManagerKey);
            assert.equal(moduleRemovedEvent!.args._module, I_GeneralTransferManager.target);

            await revertToSnapshot(key);
        });

        it("Should successfully remove the module from the middle of the names mapping", async () => {
            const snap_Id = await takeSnapshot();
            let D_GPM, D_GPM_1, D_GPM_2;
            let FactoryInstances;
            const GPMAddress: string[] = [];

            [D_GPM] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0n);
            [D_GPM_1] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0n);
            [D_GPM_2] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0n);
            FactoryInstances = [D_GPM, D_GPM_1, D_GPM_2];
            // Adding module in the ST
            for (let i = 0; i < FactoryInstances.length; i++) {
            const tx = await I_SecurityToken.connect(token_owner).addModule(await FactoryInstances[i].getAddress(), ethers.ZeroHash, 0n, 0n, false);
            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs.map(log => {
                try { return I_SecurityToken.interface.parseLog(log); } catch (e) { return null; }
            }).find(e => e && e.name === 'ModuleAdded');
            assert.isNotNull(moduleAddedEvent);
            assert.equal(Number(moduleAddedEvent!.args._types[0]), permissionManagerKey, "fail in adding the GPM");
            GPMAddress.push(moduleAddedEvent!.args._module);
            }
            // Archive the one of the module
            await I_SecurityToken.connect(token_owner).archiveModule(GPMAddress[0]);
            // Remove the module
            const tx = await I_SecurityToken.connect(token_owner).removeModule(GPMAddress[0]);
            const receipt = await tx.wait();
            const moduleRemovedEvent = receipt!.logs.map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch (e) { return null; }
            }).find(e => e && e.name === 'ModuleRemoved');
            assert.isNotNull(moduleRemovedEvent);
            assert.equal(Number(moduleRemovedEvent!.args._types[0]), permissionManagerKey);
            assert.equal(moduleRemovedEvent!.args._module, GPMAddress[0]);
            await revertToSnapshot(snap_Id);
        });

        it("Should successfully archive the module first and fail during achiving the module again", async () => {
            const key = await takeSnapshot();
            await I_SecurityToken.connect(token_owner).archiveModule(I_GeneralTransferManager.target);
            await expect(I_SecurityToken.connect(token_owner).archiveModule(I_GeneralTransferManager.target)).to.be.reverted;
            await revertToSnapshot(key);
        });

        it("Should verify the revertion of snapshot works properly", async () => {
            const moduleData = await stGetter.getModule(I_GeneralTransferManager.target);
            const name = ethers.decodeBytes32String(moduleData[0]).replace(/\u0000/g, '');
            assert.equal(name, "GeneralTransferManager");
            assert.equal(moduleData[1], I_GeneralTransferManager.target);
        });

        it("Should successfully archive the general transfer manager module from the securityToken", async () => {
            const tx = await I_SecurityToken.connect(token_owner).archiveModule(I_GeneralTransferManager.target);
            const receipt = await tx.wait();
            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
        
            let eventFound = false;
            for (const log of fullReceipt.logs!) {
                try {
                    const parsed = I_SecurityToken.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModuleArchived") { 
                        expect(parsed.args._types.includes(BigInt(transferManagerKey))).to.be.true;
                        expect(parsed.args._module).to.equal(I_GeneralTransferManager.target);
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            
            const moduleData = await stGetter.getModule(I_GeneralTransferManager.target);
            const name = ethers.decodeBytes32String(moduleData[0]).replace(/\u0000/g, '');
            assert.equal(name, "GeneralTransferManager");
            assert.equal(moduleData[1], I_GeneralTransferManager.target);
            assert.equal(moduleData[2], await I_GeneralTransferManagerFactory.getAddress());
            assert.isTrue(moduleData[3]);
        });

        it("Should fail to issue (or transfer) tokens while all TM are archived archived", async () => {
            await expect(I_SecurityToken.connect(token_owner).issue(one_address, ethers.parseEther("100"), ethers.ZeroHash)).to.be.reverted;
        });

        it("Should successfully unarchive the general transfer manager module from the securityToken", async () => {
            const tx = await I_SecurityToken.connect(token_owner).unarchiveModule(I_GeneralTransferManager.target);

            const receipt = await tx.wait();
            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
        
            let eventFound = false;
            for (const log of fullReceipt.logs!) {
                try {
                    const parsed = I_SecurityToken.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModuleUnarchived") { 
                        expect(parsed.args._types.includes(BigInt(transferManagerKey))).to.be.true;
                        expect(parsed.args._module).to.equal(I_GeneralTransferManager.target);
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            
            const moduleData = await stGetter.getModule(I_GeneralTransferManager.target);
            const name = ethers.decodeBytes32String(moduleData[0]).replace(/\u0000/g, '');
            assert.equal(name, "GeneralTransferManager");
            assert.equal(moduleData[1], I_GeneralTransferManager.target);
            assert.equal(moduleData[2], await I_GeneralTransferManagerFactory.getAddress());
            assert.isFalse(moduleData[3]);
        });

        it("Should successfully unarchive the general transfer manager module from the securityToken -- fail because module is already unarchived", async () => {
            await expect(I_SecurityToken.connect(token_owner).unarchiveModule(I_GeneralTransferManager.target)).to.be.reverted;
        });

        it("Should successfully archive the module -- fail because module is not existed", async () => {
            await expect(I_SecurityToken.connect(token_owner).archiveModule(await I_GeneralPermissionManagerFactory.getAddress())).to.be.reverted;
        });

        it("Should fail to issue tokens while GTM unarchived", async () => {
            await expect(I_SecurityToken.connect(token_owner).issue(one_address, ethers.parseEther("100"), ethers.ZeroHash)).to.be.reverted;
        });

        it("Should change the budget of the module - fail incorrect address", async () => {
            await expect(I_SecurityToken.connect(token_owner).changeModuleBudget(address_zero, ethers.parseEther("100"), true)).to.be.reverted;
        });

        it("Should fail to get the total supply -- because checkpoint id is greater than present", async () => {
            await expect(stGetter.totalSupplyAt(50)).to.be.reverted;
        });
        });

        describe("General Transfer manager Related test cases", async () => {

        it("Should Fail in transferring the token from one whitelist investor 1 to non whitelist investor 2", async () => {
            const [_canTransferCode] = await I_SecurityToken.connect(account_investor1).canTransfer(account_investor2.address, ethers.parseEther("10"), ethers.ZeroHash);
            expect(_canTransferCode).to.equal("0x50");
            await expect(I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("10"))).to.be.reverted;
        });

        it("Should fail to provide the permission to the delegate to change the transfer bools -- Bad owner", async () => {
            // Add permission to the deletgate (A regesteration process)
            await I_SecurityToken.connect(token_owner).addModule(await I_GeneralPermissionManagerFactory.getAddress(), ethers.ZeroHash, 0n, 0n, false);
            const moduleData = (await stGetter.getModulesByType(permissionManagerKey))[0];
            I_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleData);
            await expect(I_GeneralPermissionManager.connect(account_temp).addDelegate(account_delegate.address, delegateDetails)).to.be.reverted;
        });

        it("Should provide the permission to the delegate to change the transfer bools", async () => {
            // Add permission to the deletgate (A regesteration process)
            await I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate.address, delegateDetails);
            expect(await I_GeneralPermissionManager.checkDelegate(account_delegate.address)).to.be.true;
            // Providing the permission to the delegate
            await I_GeneralPermissionManager.connect(token_owner).changePermission(account_delegate.address, I_GeneralTransferManager.target, TM_Perm, true);
        });

        it("Should activate allow All Transfer", async () => {
            ID_snap = await takeSnapshot();
            await I_GeneralTransferManager.connect(account_delegate).modifyTransferRequirementsMulti(
            [0, 1, 2],
            [false, false, false],
            [false, false, false],
            [false, false, false],
            [false, false, false]
            );
            for (let i = 0; i < 3; i++) {
            const transferRequirements = await I_GeneralTransferManager.transferRequirements(i);
            expect(transferRequirements[0]).to.be.false; // fromAllowed
            expect(transferRequirements[1]).to.be.false; // toAllowed
            expect(transferRequirements[2]).to.be.false; // fromWhitelist
            expect(transferRequirements[3]).to.be.false; // toWhitelist
            }
        });

        it("Should fail to send tokens with the wrong granularity", async () => {
            await expect(I_SecurityToken.connect(account_investor1).transfer(accounts[7].address, 10n ** 17n)).to.be.reverted;
        });

        it("Should not allow 0 granularity", async () => {
            await expect(I_SecurityToken.connect(token_owner).changeGranularity(0)).to.be.reverted;
        });

        it("Should not allow unauthorized address to change data store", async () => {
            await expect(I_SecurityToken.connect(account_polymath).changeDataStore(one_address)).to.be.reverted;
        });

        it("Should not allow 0x0 address as data store", async () => {
            await expect(I_SecurityToken.connect(token_owner).changeDataStore(address_zero)).to.be.reverted;
        });

        it("Should change data store", async () => {
            const ds = await I_SecurityToken.dataStore();
            await I_SecurityToken.connect(token_owner).changeDataStore(one_address);
            expect(await I_SecurityToken.dataStore()).to.equal(one_address);
            await I_SecurityToken.connect(token_owner).changeDataStore(ds);
        });

        it("Should activate allow All Whitelist Transfers", async () => {
            ID_snap = await takeSnapshot();
            await I_GeneralTransferManager.connect(account_delegate).modifyTransferRequirementsMulti(
            [0, 1, 2],
            [true, false, true],
            [true, true, false],
            [false, false, false],
            [false, false, false]
            );
            const transferRestrions = await I_GeneralTransferManager.transferRequirements(0);
            expect(transferRestrions[0]).to.be.true;
            expect(transferRestrions[1]).to.be.true;
            expect(transferRestrions[2]).to.be.false;
            expect(transferRestrions[3]).to.be.false;
        });

        it("Should upgrade token logic and getter", async () => {

            const TokenLibFactory = await ethers.getContractFactory("TokenLib");
            const tokenLib = await TokenLibFactory.deploy();
            await tokenLib.waitForDeployment();
            const MockSTGetterFactory = await ethers.getContractFactory("MockSTGetter", {
                libraries: {
                    TokenLib: tokenLib.target
                }
            });
            const mockSTGetter = await MockSTGetterFactory.deploy();
            const MockSecurityTokenLogicFactory = await ethers.getContractFactory("MockSecurityTokenLogic", {
                libraries: {
                    TokenLib: tokenLib.target
                }
            });
            const mockSecurityTokenLogic = await MockSecurityTokenLogicFactory.deploy();
            console.log("STL1: " + mockSecurityTokenLogic.target);

            const tokenUpgradeInterface = new ethers.Interface([
            "function upgrade(address _getterDelegate, uint256 _upgrade)"
            ]);
            const tokenUpgradeBytesCall = tokenUpgradeInterface.encodeFunctionData("upgrade", [mockSTGetter.target, 10n]);

            const tokenInitInterface = new ethers.Interface([
            "function initialize(address _getterDelegate, uint256 _someValue)"
            ]);
            const tokenInitBytesCall = tokenInitInterface.encodeFunctionData("initialize", [mockSTGetter.target, 9n]);

            await I_STFactory.connect(account_polymath).setLogicContract("3.0.1", mockSecurityTokenLogic.target, tokenInitBytesCall, tokenUpgradeBytesCall);
            
            const tx = await I_SecurityToken.connect(token_owner).upgradeToken();
            await expect(tx).to.emit(I_SecurityToken, "TokenUpgraded").withArgs(3, 0, 0);

            const newToken = await ethers.getContractAt("MockSecurityTokenLogic", I_SecurityToken.target);
            const newGetter = await ethers.getContractAt("MockSTGetter", I_SecurityToken.target);
            
            const tx2 = await newToken.connect(token_owner).newFunction(11);
            await expect(tx2).to.emit(newToken, "UpgradeEvent").withArgs(11);
            
            const tx3 = await newGetter.connect(token_owner).newGetter(12);
            await expect(tx3).to.emit(newGetter, "UpgradeEvent").withArgs(12);
            
            console.log((await newToken.someValue()));
            expect(await newToken.someValue()).to.equal(10);
        });

        it("Should update token logic and getter", async () => {
            const TokenLibFactory = await ethers.getContractFactory("TokenLib");
            const tokenLib = await TokenLibFactory.deploy();
            await tokenLib.waitForDeployment();
            const MockSTGetterFactory = await ethers.getContractFactory("MockSTGetter", {
                libraries: {
                    TokenLib: tokenLib.target
                }
            });
            const mockSTGetter = await MockSTGetterFactory.deploy();
            const MockSecurityTokenLogicFactory = await ethers.getContractFactory("MockSecurityTokenLogic", {
                libraries: {
                    TokenLib: tokenLib.target
                }
            });
            const mockSecurityTokenLogic = await MockSecurityTokenLogicFactory.deploy();
            console.log("STL2: " + mockSecurityTokenLogic.target);

            const tokenUpgradeInterface = new ethers.Interface([
            "function upgrade(address _getterDelegate, uint256 _upgrade)"
            ]);
            const tokenUpgradeBytesCall = tokenUpgradeInterface.encodeFunctionData("upgrade", [mockSTGetter.target, 12n]);

            const tokenInitInterface = new ethers.Interface([
            "function initialize(address _getterDelegate, uint256 _someValue)"
            ]);
            const tokenInitBytesCall = tokenInitInterface.encodeFunctionData("initialize", [mockSTGetter.target, 11n]);

            await I_STFactory.connect(account_polymath).updateLogicContract(2, "3.0.1", mockSecurityTokenLogic.target, tokenInitBytesCall, tokenUpgradeBytesCall);
        });

        it("Should deploy new upgraded token", async () => {
            const symbolUpgrade = "DETU";
            const nameUpgrade = "Demo Upgrade";
            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFee);
            let tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbolUpgrade);

            let receipt = await tx.wait();
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
                        expect(parsed.args._owner).to.equal(token_owner.address);
                        expect(parsed.args._ticker).to.equal(symbolUpgrade.toUpperCase());
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;

            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFee);
            let tokenTx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(nameUpgrade, symbolUpgrade, tokenDetails, false, token_owner.address, 0);
            
            receipt = await tokenTx.wait();
            const newSecurityTokenEvent = receipt!.logs.map(log => {
                try { return I_STRProxied.interface.parseLog(log); } catch (e) { return null; }
            }).find(e => e && e.name === 'NewSecurityToken');

            assert.isNotNull(newSecurityTokenEvent);
            assert.equal(newSecurityTokenEvent!.args._ticker, symbolUpgrade, "SecurityToken doesn't get deployed");

            I_SecurityToken2 = await ethers.getContractAt("MockSecurityTokenLogic", newSecurityTokenEvent!.args._securityTokenAddress);
            I_STGetter2 = await ethers.getContractAt("MockSTGetter", newSecurityTokenEvent!.args._securityTokenAddress);
            
            expect(await I_STGetter2.getTreasuryWallet()).to.equal(token_owner.address, "Incorrect wallet set");
            expect(await I_SecurityToken2.owner()).to.equal(token_owner.address);
            expect(await I_SecurityToken2.initialized()).to.be.true;
            expect(await I_SecurityToken2.someValue()).to.equal(11);
        });

        it("Should Fail in trasferring from whitelist investor1 to non-whitelist investor", async () => {
            await expect(I_SecurityToken.connect(account_investor1).transfer(account_temp.address, ethers.parseEther("10"))).to.be.reverted;
            await revertToSnapshot(ID_snap);
        });

        it("Should successfully issue tokens while STO attached", async () => {
            await I_SecurityToken.connect(token_owner).issue(account_affiliate1.address, ethers.parseEther("100"), ethers.ZeroHash);
            let balance = await I_SecurityToken.balanceOf(account_affiliate1.address);
            expect(balance).to.equal(ethers.parseEther("400"));
        });

        it("Should issue the tokens for multiple afiliated investors while STO attached", async () => {
            await I_SecurityToken.connect(token_owner).issueMulti(
            [account_affiliate1.address, account_affiliate2.address], 
            [ethers.parseEther("100"), ethers.parseEther("110")]
            );
            let balance1 = await I_SecurityToken.balanceOf(account_affiliate1.address);
            expect(balance1).to.equal(ethers.parseEther("500"));
            let balance2 = await I_SecurityToken.balanceOf(account_affiliate2.address);
            expect(balance2).to.equal(ethers.parseEther("220"));
        });

        it("Should provide more permissions to the delegate", async () => {
            // Providing the permission to the delegate
            await I_GeneralPermissionManager.connect(token_owner).changePermission(account_delegate.address, I_GeneralTransferManager.target, TM_Perm_Whitelist, true);

            expect(
            await I_GeneralPermissionManager.checkPermission(account_delegate.address, I_GeneralTransferManager.target, TM_Perm_Whitelist)
            ).to.be.true;
        });

        it("Should add the investor in the whitelist by the delegate", async () => {
            fromTime = await latestTime();
            toTime = fromTime;
            expiryTime = toTime + duration.days(100);
            let tx = await I_GeneralTransferManager.connect(account_delegate).modifyKYCData(account_temp.address, fromTime, toTime, expiryTime);
            await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData").withArgs(account_temp.address, account_delegate.address, fromTime, toTime, expiryTime);
        });

        it("Should remove investor from the whitelist by the delegate", async () => {
            let tx = await I_GeneralTransferManager.connect(account_delegate).modifyKYCData(account_temp.address, 0n, 0n, 0n);
            await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData").withArgs(account_temp.address, account_delegate.address, 0, 0, 0);
        });

        it("Should freeze the transfers", async () => {
            const tx = await I_SecurityToken.connect(token_owner).freezeTransfers();
            await expect(tx).to.emit(I_SecurityToken, "FreezeTransfers").withArgs(true);
        });

        it("Should fail to freeze the transfers", async () => {
            await expect(I_SecurityToken.connect(token_owner).freezeTransfers()).to.be.reverted;
        });

        it("Should unfreeze all the transfers", async () => {
            const tx = await I_SecurityToken.connect(token_owner).unfreezeTransfers();
            await expect(tx).to.emit(I_SecurityToken, "FreezeTransfers").withArgs(false);
        });

        it("Should fail to unfreeze transfers", async () => {
            await expect(I_SecurityToken.connect(token_owner).unfreezeTransfers()).to.be.reverted;
        });

        it("Should check that the list of investors is correct", async () => {
            // Hardcode list of expected accounts based on transfers above
            const investors = await stGetter.getInvestors();
            const expectedAccounts = [account_affiliate1.address, account_affiliate2.address, account_temp.address];
            for (let i = 0; i < expectedAccounts.length; i++) {
                assert.equal(investors[i], expectedAccounts[i]);
            }
            assert.equal(investors.length, 3);
            console.log("Total Seen Investors: " + investors.length);
        });

        it("Should fail to set controller status because msg.sender not owner", async () => {
            await expect(I_SecurityToken.connect(account_controller).setController(account_controller.address)).to.be.reverted;
        });

        it("Should successfully set controller", async () => {
            let tx1 = await I_SecurityToken.connect(token_owner).setController(account_controller.address);
            await expect(tx1).to.emit(I_SecurityToken, "SetController").withArgs(address_zero, account_controller.address);

            let tx2 = await I_SecurityToken.connect(token_owner).setController(address_zero);
            await expect(tx2).to.emit(I_SecurityToken, "SetController").withArgs(account_controller.address, address_zero);

            let tx3 = await I_SecurityToken.connect(token_owner).setController(account_controller.address);
            await expect(tx3).to.emit(I_SecurityToken, "SetController").withArgs(address_zero, account_controller.address);

            // check status
            let controller = await I_SecurityToken.controller();
            assert.equal(account_controller.address, controller, "Status not set correctly");
        });

        it("Should ST be the controllable", async() => {
            expect(await I_SecurityToken.isControllable()).to.be.true;
        });

        it("Should force burn the tokens - value too high", async () => {
            await I_GeneralTransferManager.connect(account_delegate).modifyTransferRequirementsMulti(
            [0, 1, 2],
            [true, false, false],
            [true, true, false],
            [true, false, false],
            [true, false, false]
            );
            let currentBalance = await I_SecurityToken.balanceOf(account_temp.address);
            await expect(
            I_SecurityToken.connect(account_controller).controllerRedeem(account_temp.address, currentBalance + ethers.parseEther("500"), ethers.ZeroHash, ethers.ZeroHash)
            ).to.be.reverted;
        });
        it("Should force burn the tokens - wrong caller", async () => {
            let currentBalance = await I_SecurityToken.balanceOf(account_temp.address);
            let investors = await stGetter.getInvestors();
            for (let i = 0; i < investors.length; i++) {
            console.log(investors[i]);
            console.log(ethers.formatEther((await I_SecurityToken.balanceOf(investors[i])).toString()));
            }
            await expect(I_SecurityToken.connect(token_owner).controllerRedeem(account_temp.address, currentBalance, ethers.ZeroHash, ethers.ZeroHash)).to.be.reverted;
        });

        it("Should burn the tokens", async () => {
            let currentInvestorCount = await I_SecurityToken.holderCount();
            let currentBalance = await I_SecurityToken.balanceOf(account_temp.address);
            
            const tx = await I_SecurityToken.connect(account_controller).controllerRedeem(account_temp.address, currentBalance, ethers.ZeroHash, ethers.ZeroHash);
            await expect(tx).to.emit(I_SecurityToken, "ControllerRedemption"); // Simplified event check

            let newInvestorCount = await I_SecurityToken.holderCount();
            expect(newInvestorCount).to.equal(currentInvestorCount, "Investor count drops by one");
        });

        it("Should fail to get balance of investor at checkpoint greater than current", async () => {
            await expect(stGetter.balanceOfAt(account_investor1.address, 5)).to.be.reverted;
        });

        it("Should check the balance of investor at checkpoint", async () => {
            let balance = await stGetter.balanceOfAt(account_investor1.address, 0);
            expect(balance).to.equal(0n);
        });
        });

        describe("Withdraw Poly", async () => {
        it("Should fail to withdraw ERC20 -- because of zero address of token and invalid caller", async () => {
            await expect(
            I_SecurityToken.connect(account_temp).withdrawERC20(address_zero, ethers.parseEther("20000"))
            ).to.be.reverted;
        });

        it("Should fail to withdraw ERC20 -- because of invalid caller", async () => {
            await expect(
            I_SecurityToken.connect(account_temp).withdrawERC20(await I_PolyToken.getAddress(), ethers.parseEther("20000"))
            ).to.be.reverted;
        });

        it("Should successfully withdraw the poly", async () => {
            const tokenOwnerAddress = token_owner.address;
            const securityTokenAddress = await I_SecurityToken.getAddress();
            const polyTokenAddress = await I_PolyToken.getAddress();

            let balanceBefore = await I_PolyToken.balanceOf(tokenOwnerAddress);
            let stBalance = await I_PolyToken.balanceOf(securityTokenAddress);
            await I_SecurityToken.connect(token_owner).withdrawERC20(polyTokenAddress, stBalance);
            let balanceAfter = await I_PolyToken.balanceOf(tokenOwnerAddress);
            expect(balanceAfter - balanceBefore).to.equal(stBalance);
        });

        it("Should fail to withdraw poly due to insufficient balance", async () => {
            await expect(I_SecurityToken.connect(token_owner).withdrawERC20(await I_PolyToken.getAddress(), ethers.parseEther("10"))).to.be.reverted;
        });
        });

        describe("Force Transfer", async () => {
        it("Should fail to controllerTransfer because not approved controller", async () => {
            await expect(
            I_SecurityToken.connect(account_investor1).controllerTransfer(
                account_investor1.address, 
                account_investor2.address, 
                ethers.parseEther("10"), 
                ethers.ZeroHash, 
                ethers.toUtf8Bytes("reason")
            )
            ).to.be.reverted;
        });

        it("Should fail to controllerTransfer because insufficient balance", async () => {
            await expect(
            I_SecurityToken.connect(account_controller).controllerTransfer(
                account_investor2.address, 
                account_investor1.address, 
                ethers.parseEther("10"), 
                ethers.ZeroHash, 
                ethers.toUtf8Bytes("reason")
            )
            ).to.be.reverted;
        });

        it("Should fail to controllerTransfer because recipient is zero address", async () => {
            await expect(
            I_SecurityToken.connect(account_controller).controllerTransfer(
                account_investor1.address, 
                address_zero, 
                ethers.parseEther("10"), 
                ethers.ZeroHash, 
                ethers.toUtf8Bytes("reason")
            )
            ).to.be.reverted;
        });

        it("Should fail to freeze controller functionality because proper acknowledgement not signed by owner", async () => {
            const trueButOutOfPlaceAcknowledegement = ethers.encodeBytes32String(
            "F O'Brien is the best!"
            );
            await expect(
            I_SecurityToken.connect(token_owner).disableController(trueButOutOfPlaceAcknowledegement)
            ).to.be.reverted;
        });

        it("Should fail to freeze controller functionality because not owner", async () => {
            disableControllerAckHash = await getDisableControllerAck(await I_SecurityToken.getAddress(), token_owner);
            await expect(
            I_SecurityToken.connect(account_investor1).disableController(disableControllerAckHash)
            ).to.be.reverted;
        });

        it("Should successfully freeze controller functionality", async () => {
            await I_SecurityToken.connect(token_owner).disableController(disableControllerAckHash);
            // check state
            expect(await I_SecurityToken.controller()).to.equal(address_zero, "State not changed");
            expect(await I_SecurityToken.controllerDisabled()).to.be.true;
            expect(await I_SecurityToken.isControllable()).to.be.false;
        });

        it("Should fail to freeze controller functionality because already frozen", async () => {
            await expect(
            I_SecurityToken.connect(token_owner).disableController(disableControllerAckHash)
            ).to.be.reverted;
        });

        it("Should fail to set controller because controller functionality frozen", async () => {
            await expect(
                I_SecurityToken.connect(token_owner).setController(account_controller.address)
            ).to.be.reverted;
        });

        it("Should fail to controllerTransfer because controller functionality frozen", async () => {
            await expect(
            I_SecurityToken.connect(account_controller).controllerTransfer(
                account_investor1.address,
                account_investor2.address,
                ethers.parseEther("10"),
                ethers.ZeroHash,
                ethers.toUtf8Bytes("reason")
            )
            ).to.be.reverted;
        });

        });

        async function balanceOf(account: string) {
        console.log(`
            ${account} total balance: ${ethers.formatEther(await I_SecurityToken.balanceOf(account))}
            ${account} Locked balance: ${ethers.formatEther(await I_SecurityToken.balanceOfByPartition(ethers.encodeBytes32String("LOCKED"), account))}
            ${account} Unlocked balance: ${ethers.formatEther(await I_SecurityToken.balanceOfByPartition(ethers.encodeBytes32String("UNLOCKED"), account))}
            `);
        }

        describe("Test cases for the partition functions -- ERC1410", async() => {

        it("Set the transfer requirements", async() => {
            await I_GeneralTransferManager.connect(account_delegate).modifyTransferRequirementsMulti(
            [0, 1, 2],
            [true, false, true],
            [true, true, false],
            [true, false, false],
            [true, false, false]
            );
        });

        it("Should Successfully transfer tokens by the partition", async() => {
            await balanceOf(account_investor1.address);
            await balanceOf(account_investor2.address);
            await balanceOf(account_investor3.address);
            await balanceOf(account_affiliate1.address);
            await balanceOf(account_affiliate2.address);

            fromTime = await latestTime();
            toTime = fromTime;
            expiryTime = toTime + duration.days(100);

            let tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCData(account_investor1.address, fromTime, toTime, expiryTime);
            await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData").withArgs(account_investor1.address, token_owner.address, fromTime, toTime, expiryTime);

            tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCData(account_investor2.address, fromTime, toTime, expiryTime);
            await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData").withArgs(account_investor2.address, token_owner.address, fromTime, toTime, expiryTime);

            await increaseTime(5);

            let data = await I_SecurityToken.canTransferByPartition(
                account_investor1.address,
                account_investor2.address,
                ethers.encodeBytes32String("LOCKED"),
                ethers.parseEther("15"),
                ethers.ZeroHash
            );

            expect(data[0]).to.equal("0x50");

            const convertToString = (bytes) => {
                if (bytes === '0x' || bytes === '0x' + '00'.repeat(32)) {
                    return "";
                }
                try {
                    return ethers.toUtf8String(bytes).replace(/\0/g, ''); // Remove null characters
                } catch {
                    return "";
                }
            };

            expect(convertToString(data[1])).to.equal("");
            expect(convertToString(data[2])).to.equal("");

            await expect(
                I_SecurityToken.connect(account_investor1).transferByPartition(
                ethers.encodeBytes32String("LOCKED"),
                account_investor2.address,
                ethers.parseEther("15"),
                ethers.ZeroHash
            )
            ).to.be.reverted;
        });

        it("Should authorize the operator", async() => {
            await I_SecurityToken.connect(account_investor1).authorizeOperator(account_delegate.address);
            expect(await stGetter.isOperator(account_delegate.address, account_investor1.address)).to.be.true;
        });

        it("Should fail to call operatorTransferByPartition-- not a valid partition", async() => {
            await expect(
            I_SecurityToken.connect(account_delegate).operatorTransferByPartition(
            ethers.encodeBytes32String("LOCKED"),
            account_investor1.address,
            account_investor2.address,
            ethers.parseEther("14"),
            ethers.ZeroHash,
            ethers.toUtf8Bytes("Valid transfer from the operator")
            )
            ).to.be.reverted;
        });

        it("Should fail to call operatorTransferByPartition-- not a valid operator", async() => {
            await expect(
            I_SecurityToken.connect(account_affiliate1).operatorTransferByPartition(
            ethers.encodeBytes32String("UNLOCKED"),
            account_investor1.address,
            account_investor2.address,
            ethers.parseEther("14"),
            ethers.ZeroHash,
            ethers.toUtf8Bytes("Valid transfer from the operator")
            )
            ).to.be.reverted;
        });

        it("Should fail to call operatorTransferByPartition-- not a valid operatorData", async() => {
            await expect(
            I_SecurityToken.connect(account_delegate).operatorTransferByPartition(
            ethers.encodeBytes32String("UNLOCKED"),
            account_investor1.address,
            account_investor2.address,
            ethers.parseEther("14"),
            ethers.ZeroHash,
            ethers.toUtf8Bytes("")
            )
            ).to.be.reverted;
        });

        it("Should revoke operator", async() => {
            await I_SecurityToken.connect(account_investor1).revokeOperator(account_delegate.address);
            expect(await stGetter.isOperator(account_delegate.address, account_investor1.address)).to.be.false;
        });

        it("Should fail to transfer by operator -- not a valid operator", async() => {
            await expect(
            I_SecurityToken.connect(account_delegate).operatorTransferByPartition(
            ethers.encodeBytes32String("UNLOCKED"),
            account_investor1.address,
            account_investor2.address,
            ethers.parseEther("20"),
            ethers.ZeroHash,
            ethers.toUtf8Bytes("Valid transfer from the operator")
            )
            ).to.be.reverted;
        });

        it("Should fail to execute authorizeOperatorByPartition successfully for invalid partition", async() => {
            await expect(
            I_SecurityToken.connect(account_investor1).authorizeOperatorByPartition(ethers.encodeBytes32String("LOCKED"), account_delegate.address)
            ).to.be.reverted;
        });

        it("Should execute authorizeOperatorByPartition successfully", async() => {
            await I_SecurityToken.connect(account_investor1).authorizeOperatorByPartition(ethers.encodeBytes32String("UNLOCKED"), account_delegate.address);
            expect(await stGetter.isOperatorForPartition(ethers.encodeBytes32String("UNLOCKED"), account_delegate.address, account_investor1.address)).to.be.true;
        });

        it("Should successfully execute revokeOperatorByPartition successfully", async() => {
            await I_SecurityToken.connect(account_investor1).revokeOperatorByPartition(ethers.encodeBytes32String("UNLOCKED"), account_delegate.address);
            expect(await stGetter.isOperatorForPartition(ethers.encodeBytes32String("UNLOCKED"), account_delegate.address, account_investor1.address)).to.be.false;
        });

        it("Should fail to issue to tokens according to partition -- invalid partition", async() => {
            await expect(
            I_SecurityToken.connect(token_owner).issueByPartition(
                ethers.encodeBytes32String("LOCKED"),
                account_investor1.address,
                ethers.parseEther('100'),
                ethers.ZeroHash
            )
            ).to.be.reverted;
        });

        it("Should fail to issue to tokens according to partition -- invalid token owner", async() => {
            await expect(
            I_SecurityToken.connect(account_affiliate1).issueByPartition(
                ethers.encodeBytes32String("UNLOCKED"),
                account_investor1.address,
                ethers.parseEther('100'),
                ethers.ZeroHash
            )
            ).to.be.reverted;
        });

        it("Should successfullly issue the tokens according to partition", async() => {
            const beforeTotalSupply = await I_SecurityToken.totalSupply();
            const beforeUnlockedBalance = await I_SecurityToken.balanceOfByPartition(ethers.encodeBytes32String("UNLOCKED"), account_investor1.address);
            const beforeBalance = await I_SecurityToken.balanceOf(account_investor1.address);
            const issueAmount = ethers.parseEther('100');
            await I_SecurityToken.connect(token_owner).issueByPartition(
            ethers.encodeBytes32String("UNLOCKED"),
            account_investor1.address,
            issueAmount,
            ethers.ZeroHash
            );
            const afterTotalSupply = await I_SecurityToken.totalSupply();
            const afterUnlockedBalance = await I_SecurityToken.balanceOfByPartition(ethers.encodeBytes32String("UNLOCKED"), account_investor1.address);
            const afterBalance = await I_SecurityToken.balanceOf(account_investor1.address);
            expect(afterTotalSupply - beforeTotalSupply).to.equal(issueAmount);
            expect(afterUnlockedBalance - beforeUnlockedBalance).to.equal(issueAmount);
            expect(afterBalance - beforeBalance).to.equal(issueAmount);
        });

        it("Should execute authorizeOperatorByPartition successfully", async() => {
            await I_SecurityToken.connect(account_investor1).authorizeOperatorByPartition(ethers.encodeBytes32String("UNLOCKED"), account_delegate.address);
            expect(await stGetter.isOperatorForPartition(ethers.encodeBytes32String("UNLOCKED"), account_delegate.address, account_investor1.address)).to.be.true;
        });

        it("Should fail to redeem tokens as per partition -- incorrect msg.sender", async() => {
            await expect(
            I_SecurityToken.connect(account_investor1).redeemByPartition(
                ethers.encodeBytes32String("UNLOCKED"),
                ethers.parseEther("10"),
                ethers.ZeroHash
            )
            ).to.be.reverted;
        });

        it("Should failed to call operatorRedeemByPartition -- msg.sender is not authorised", async() => {
            await expect(
            I_SecurityToken.connect(account_delegate).operatorRedeemByPartition(
                ethers.encodeBytes32String("UNLOCKED"),
                account_investor1.address,
                ethers.parseEther("10"),
                ethers.ZeroHash,
                ethers.toUtf8Bytes("Valid call from the operator")
            )
            ).to.be.reverted;
        });

        it("Should get the partitions of the secuirtyToken", async() => {
            let partitions = await stGetter.partitionsOf(account_investor1.address);
            console.log(`Partitions of the investor 1: ${ethers.decodeBytes32String(partitions[0]).replace(/\u0000/g, '')}`);
            expect(ethers.decodeBytes32String(partitions[0]).replace(/\u0000/g, '')).to.equal("UNLOCKED");
            expect(ethers.decodeBytes32String(partitions[1]).replace(/\u0000/g, '')).to.equal("LOCKED");
            partitions = await stGetter.partitionsOf(account_investor2.address);
            console.log(`Partitions of the investor 2: ${ethers.decodeBytes32String(partitions[0]).replace(/\u0000/g, '')}`);
        });
        });

    describe("Test cases for the storage", async () => {
        it("Test the storage values of the ERC20 vairables", async () => {
            const investors = await stGetter.getInvestors();

            console.log("Verifying the balances of the Addresses");
            const newKey: string[] = [];
            const abiCoder = ethers.AbiCoder.defaultAbiCoder();
            const securityTokenAddress = await I_SecurityToken.getAddress();

            for (const investor of investors) {
                // Slot for mapping is keccak256(abi.encode(key, slot_number))
                const dataToHash = abiCoder.encode(['address', 'uint256'], [investor, 0]); // balances mapping is at slot 0
                const storageSlot = ethers.keccak256(dataToHash);
                newKey.push(storageSlot);
            }

            for (let i = 0; i < investors.length; i++) {
                const balanceFromContract = await I_SecurityToken.balanceOf(investors[i]);
                const balanceFromStorage = BigInt(await readStorage(securityTokenAddress, newKey[i]));
                expect(balanceFromContract).to.equal(balanceFromStorage);
                console.log(`
                Balances for ${investors[i]}:
                From contract:     ${ethers.formatEther(balanceFromContract)}
                From storage:      ${ethers.formatEther(balanceFromStorage)}
                `);
            }

            const totalSupplyFromContract = await I_SecurityToken.totalSupply();
            const totalSupplyFromStorage = BigInt(await readStorage(securityTokenAddress, 2));
            expect(totalSupplyFromContract).to.equal(totalSupplyFromStorage);
            console.log(`
                TotalSupply from contract:      ${ethers.formatEther(totalSupplyFromContract)}
                TotalSupply from the storage:   ${ethers.formatEther(totalSupplyFromStorage)}
            `);

            const decodeCustomString = (hexString) => {
                try {
                    // Remove 0x prefix
                    const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
                    
                    // Convert hex to bytes
                    const bytes = [];
                    for (let i = 0; i < hex.length; i += 2) {
                        bytes.push(parseInt(hex.substr(i, 2), 16));
                    }
                    
                    // Find the first null byte or use all bytes except the last one (which might be length)
                    let endIndex = bytes.length - 1; // Exclude potential length byte
                    for (let i = 0; i < bytes.length - 1; i++) {
                        if (bytes[i] === 0) {
                            endIndex = i;
                            break;
                        }
                    }
                    
                    // Convert to string
                    return String.fromCharCode(...bytes.slice(0, endIndex));
                } catch (error) {
                    console.error('Error decoding custom string:', error);
                    return '';
                }
            };

            const nameFromContract = await I_SecurityToken.name();
            const nameFromStorage = await readStorage(securityTokenAddress, 6);
            expect(nameFromContract).to.equal(decodeCustomString(nameFromStorage));
            console.log(`
                Name of the ST:                     ${nameFromContract}
                Name of the ST from the storage:    ${decodeCustomString(nameFromStorage)}
            `);

            const symbolFromContract = await I_SecurityToken.symbol();
            const symbolFromStorage = await readStorage(securityTokenAddress, 7);
            expect(symbolFromContract).to.equal(decodeCustomString(symbolFromStorage));
            console.log(`
                Symbol of the ST:                     ${symbolFromContract}
                Symbol of the ST from the storage:    ${decodeCustomString(symbolFromStorage)}
            `);

            const ownerFromContract = await I_SecurityToken.owner();
            console.log(`Owner of the ST from the contract: ${ownerFromContract}`);

            const rawStorageValue = await readStorage(securityTokenAddress, 4);
            const ownerFromStorage = ethers.getAddress('0x' + rawStorageValue.slice(-40));

            console.log(`
                Address of the owner:                   ${ownerFromContract}
                Address of the owner from the storage:  ${ownerFromStorage}
            `);
            expect(ownerFromContract).to.equal(ownerFromStorage);
        });

        it("Verify the storage of the STStorage", async () => {
            const securityTokenAddress = await I_SecurityToken.getAddress();
            const storageSlot8 = await readStorage(securityTokenAddress, 8);
            const controllerFromContract = await stGetter.controller();
            const decimalsFromContract = await stGetter.decimals();

            console.log(`
                Controller address from the contract:                   ${controllerFromContract}
                decimals from the contract:                             ${decimalsFromContract}
                controller address from the storage + uint8 decimals:   ${storageSlot8}
            `);

            let hexData = storageSlot8.slice(2).padStart(64, '0');
    
            const storedDecimals = BigInt(`0x${hexData.slice(-2)}`);
            const storedController = ethers.getAddress(`0x${hexData.slice(22, 62)}`);
            expect(storedController).to.equal(controllerFromContract);
            expect(storedDecimals).to.equal(decimalsFromContract);

            const polymathRegistryFromContract = await stGetter.polymathRegistry();
            const rawStorageValue = await readStorage(securityTokenAddress, 9);
            console.log(rawStorageValue, "rawStorageValue");

            // Extract the address from the storage slot
            // PolymathRegistry address
            hexData = rawStorageValue.slice(2).padStart(64, '0');
            let addressHex = hexData.slice(-40);
            const polymathRegistryFromStorage = ethers.getAddress(`0x${addressHex}`);
            console.log(`
                PolymathRegistry address from the contract:         ${polymathRegistryFromContract}
                PolymathRegistry address from the storage:          ${polymathRegistryFromStorage}
            `);
            expect(polymathRegistryFromContract).to.equal(polymathRegistryFromStorage);

            // ModuleRegistry address
            let rawModuleRegistry = await readStorage(securityTokenAddress, 10);
            hexData = rawModuleRegistry.slice(2).padStart(64, '0');
            addressHex = hexData.slice(-40);
            const moduleRegistryFromStorage = ethers.getAddress(`0x${addressHex}`);
            const moduleRegistryFromContract = await stGetter.moduleRegistry();
            console.log(`
                ModuleRegistry address from the contract:         ${moduleRegistryFromContract}
                ModuleRegistry address from the storage:          ${moduleRegistryFromStorage}
            `);
            expect(moduleRegistryFromContract).to.equal(moduleRegistryFromStorage);

            // SecurityTokenRegistry address
            let rawSecurityTokenRegistry = await readStorage(securityTokenAddress, 11);
            hexData = rawSecurityTokenRegistry.slice(2).padStart(64, '0');
            addressHex = hexData.slice(-40);
            const securityTokenRegistryFromStorage = ethers.getAddress(`0x${addressHex}`);
            const securityTokenRegistryFromContract = await stGetter.securityTokenRegistry();
            console.log(`
                SecurityTokenRegistry address from the contract:         ${securityTokenRegistryFromContract}
                SecurityTokenRegistry address from the storage:          ${securityTokenRegistryFromStorage}
            `);
            expect(securityTokenRegistryFromContract).to.equal(securityTokenRegistryFromStorage);

            // PolyToken address
            let rawPolyToken = await readStorage(securityTokenAddress, 12);
            hexData = rawPolyToken.slice(2).padStart(64, '0');
            addressHex = hexData.slice(-40);
            const polyTokenFromStorage = ethers.getAddress(`0x${addressHex}`);
            const polyTokenFromContract = await stGetter.polyToken();
            console.log(`
                PolyToken address from the contract:         ${polyTokenFromContract}
                PolyToken address from the storage:          ${polyTokenFromStorage}
            `);
            expect(polyTokenFromContract).to.equal(polyTokenFromStorage);

            // GetterDelegate address
            let rawGetterDelegate = await readStorage(securityTokenAddress, 13);
            hexData = rawGetterDelegate.slice(2).padStart(64, '0');
            addressHex = hexData.slice(-40);
            const getterDelegateFromStorage = ethers.getAddress(`0x${addressHex}`);
            const getterDelegateFromContract = await stGetter.getterDelegate();
            console.log(`
                Delegate address from the contract:         ${getterDelegateFromContract}
                Delegate address from the storage:          ${getterDelegateFromStorage}
            `);
            expect(getterDelegateFromContract).to.equal(getterDelegateFromStorage);

            // DataStore address
            let rawDataStore = await readStorage(securityTokenAddress, 14);
            hexData = rawDataStore.slice(2).padStart(64, '0');
            addressHex = hexData.slice(-40);
            const dataStoreFromStorage = ethers.getAddress(`0x${addressHex}`);
            const dataStoreFromContract = await stGetter.dataStore();
            console.log(`
                Datastore address from the contract:         ${dataStoreFromContract}
                Datastore address from the storage:          ${dataStoreFromStorage}
            `);
            expect(dataStoreFromContract).to.equal(dataStoreFromStorage);

            // Granularity
            const granularityFromContract = await stGetter.granularity();
            const granularityFromStorage = BigInt(await readStorage(securityTokenAddress, 15));
            console.log(`
                Granularity value from the contract:         ${granularityFromContract}
                Granularity value from the storage:          ${granularityFromStorage}
            `);
            expect(granularityFromContract).to.equal(granularityFromStorage);

            // Current checkpoint ID
            const currentCheckpointIdFromContract = await stGetter.currentCheckpointId();
            const currentCheckpointIdFromStorage = BigInt(await readStorage(securityTokenAddress, 16));
            console.log(`
                Current checkpoint ID from the contract:    ${currentCheckpointIdFromContract}
                Current checkpoint ID from the storage:     ${currentCheckpointIdFromStorage}
            `);
            expect(currentCheckpointIdFromContract).to.equal(currentCheckpointIdFromStorage);

            // Token details
            const tokenDetailsFromContract = await stGetter.tokenDetails();
            const tokenDetailsFromStorage = await readStorage(securityTokenAddress, 17);
            console.log(`
                TokenDetails from the contract:    ${tokenDetailsFromContract}
                TokenDetails from the storage:     ${ethers.toUtf8String(tokenDetailsFromStorage)}
            `);
            expect(tokenDetailsFromContract).to.equal(ethers.toUtf8String(tokenDetailsFromStorage).replace(/\u0000/g, "").replace(/"$/, ""));
        });
    });

    describe(`Test cases for the ERC1643 contract\n`, async () => {
        describe(`Test cases for the setDocument() function of the ERC1643\n`, async () => {
            it("\tShould failed in executing the setDocument() function because msg.sender is not authorised\n", async () => {
                await expect(
                    I_SecurityToken.connect(account_temp).setDocument(ethers.encodeBytes32String("doc1"), "https://www.gogl.bts.fly", ethers.ZeroHash)
                ).to.be.reverted;
            });

            it("\tShould failed to set a document details as name is empty\n", async () => {
                await expect(
                    I_SecurityToken.connect(token_owner).setDocument(ethers.encodeBytes32String(""), "https://www.gogl.bts.fly", ethers.ZeroHash)
                ).to.be.reverted;
            });

            it("\tShould failed to set a document details as URI is empty\n", async () => {
                await expect(
                    I_SecurityToken.connect(token_owner).setDocument(ethers.encodeBytes32String("doc1"), "", ethers.ZeroHash)
                ).to.be.reverted;
            });

            it("\tShould sucessfully add the document details in the `_documents` mapping and change the length of the `_docsNames`\n", async () => {
                const docName = ethers.encodeBytes32String("doc1");
                const tx = await I_SecurityToken.connect(token_owner).setDocument(docName, uri, docHash);
                
                await expect(tx).to.emit(I_SecurityToken, "DocumentUpdated").withArgs(docName, uri, docHash);
                
                const allDocs = await stGetter.getAllDocuments();
                expect(allDocs.length).to.equal(1);
            });

            it("\tShould successfully add the new document and allow the empty docHash to be added in the `Document` structure\n", async () => {
                const docName = ethers.encodeBytes32String("doc2");
                const tx = await I_SecurityToken.connect(token_owner).setDocument(docName, uri, ethers.ZeroHash);
                
                await expect(tx).to.emit(I_SecurityToken, "DocumentUpdated").withArgs(docName, uri, empty_hash);

                const allDocs = await stGetter.getAllDocuments();
                expect(allDocs.length).to.equal(2);
            });

            it("\tShould successfully update the existing document and length of `_docsNames` should remain unaffected\n", async () => {
                const docName = ethers.encodeBytes32String("doc2");
                const newUri = "https://www.bts.l";
                const tx = await I_SecurityToken.connect(token_owner).setDocument(docName, newUri, ethers.ZeroHash);

                await expect(tx).to.emit(I_SecurityToken, "DocumentUpdated").withArgs(docName, newUri, empty_hash);

                const allDocs = await stGetter.getAllDocuments();
                expect(allDocs.length).to.equal(2);
            });
        });

        describe("Test cases for the getters functions", async () => {
            it("Should get the details of an existing document", async () => {
            const doc1Details = await stGetter.getDocument(ethers.encodeBytes32String("doc1"));
            expect(doc1Details[0]).to.equal(uri);
            expect(doc1Details[1]).to.equal(docHash);
            expect(Number(doc1Details[2])).to.be.closeTo(await latestTime(), 5);

            const doc2Details = await stGetter.getDocument(ethers.encodeBytes32String("doc2"));
            expect(doc2Details[0]).to.equal("https://www.bts.l");
            expect(doc2Details[1]).to.equal(empty_hash);
            expect(Number(doc2Details[2])).to.be.closeTo(await latestTime(), 5);
            });

            it("Should get empty details for a non-existent document", async () => {
            const doc3Details = await stGetter.getDocument(ethers.encodeBytes32String("doc3"));
            expect(doc3Details[0]).to.equal("");
            expect(doc3Details[1]).to.equal(empty_hash);
            expect(doc3Details[2]).to.equal(0n);
            });

            it("Should get all the documents present in the contract", async () => {
            const allDocs = await stGetter.getAllDocuments();
            expect(allDocs.length).to.equal(2);
            expect(ethers.decodeBytes32String(allDocs[0]).replace(/\u0000/g, '')).to.equal("doc1");
            expect(ethers.decodeBytes32String(allDocs[1]).replace(/\u0000/g, '')).to.equal("doc2");
            });
        });
        
        });

        describe("Test cases for the removeDocument()", async () => {
            before(async () => {
                // Setup documents for removal tests
                await I_SecurityToken.connect(token_owner).setDocument(ethers.encodeBytes32String("doc1"), uri, docHash);
                await I_SecurityToken.connect(token_owner).setDocument(ethers.encodeBytes32String("doc2"), "https://www.bts.l", empty_hash);
            });

            it("Should fail to remove document because msg.sender is not authorised", async () => {
                await expect(
                I_SecurityToken.connect(account_temp).removeDocument(ethers.encodeBytes32String("doc2"))
                ).to.be.reverted;
            });

            it("Should fail to remove a document that does not exist", async () => {
                await expect(
                I_SecurityToken.connect(token_owner).removeDocument(ethers.encodeBytes32String("doc3"))
                ).to.be.reverted;
            });

            it("Should successfully remove documents and check event parameters", async () => {
                // Add a new document to be the last in the array
                await I_SecurityToken.connect(token_owner).setDocument(ethers.encodeBytes32String("doc3"), "https://www.bts.l", empty_hash);
                
                // Remove the last document in the array
                let tx1 = await I_SecurityToken.connect(token_owner).removeDocument(ethers.encodeBytes32String("doc3"));
                await expect(tx1).to.emit(I_SecurityToken, "DocumentRemoved").withArgs(ethers.encodeBytes32String("doc3"), "https://www.bts.l", empty_hash);
                expect((await stGetter.getAllDocuments()).length).to.equal(2);

                // Remove a document that is not last in the array
                let tx2 = await I_SecurityToken.connect(token_owner).removeDocument(ethers.encodeBytes32String("doc1"));
                await expect(tx2).to.emit(I_SecurityToken, "DocumentRemoved").withArgs(ethers.encodeBytes32String("doc1"), uri, docHash);
                expect((await stGetter.getAllDocuments()).length).to.equal(1);
            });

            it("Should delete the remaining document", async () => {
                let tx = await I_SecurityToken.connect(token_owner).removeDocument(ethers.encodeBytes32String("doc2"));
                await expect(tx).to.emit(I_SecurityToken, "DocumentRemoved").withArgs(ethers.encodeBytes32String("doc2"), "https://www.bts.l", empty_hash);
                expect((await stGetter.getAllDocuments()).length).to.equal(0);
            });

        describe("Test cases for the getters after removal", async () => {
            it("Should get empty details for a removed document", async () => {
            const doc1Details = await stGetter.getDocument(ethers.encodeBytes32String("doc1"));
            expect(doc1Details[0]).to.equal("");
            expect(doc1Details[1]).to.equal(empty_hash);
            expect(doc1Details[2]).to.equal(0n);
            });

            it("Should get all documents after adding one back", async () => {
            // Add one doc before the getter call
            await I_SecurityToken.connect(token_owner).setDocument(ethers.encodeBytes32String("doc4"), "https://www.bts.l", docHash);
            const allDocs = await stGetter.getAllDocuments();
            expect(allDocs.length).to.equal(1);
            expect(ethers.decodeBytes32String(allDocs[0]).replace(/\u0000/g, '')).to.equal("doc4");
            });
        });
        });
});
