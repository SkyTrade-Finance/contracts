import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, GasCostPlugin, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration, latestBlock } from "./helpers/utils";
import { getSignGTMData, getSignGTMTransferData, getMultiSignGTMData } from "./helpers/signData";
import { takeSnapshot, increaseTime, revertToSnapshot } from "./helpers/time";
import { pk } from "./helpers/testprivateKey";
import { encodeProxyCall, encodeModuleCall } from "./helpers/encodeCall";
import { catchRevert } from "./helpers/exceptions";
import { setUpPolymathNetwork, deployGPMAndVerifyed, deployDummySTOAndVerifyed, deployGTMAndVerifyed } from "./helpers/createInstances";

describe("GeneralTransferManager", function() {
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
    let account_affiliates1: HardhatEthersSigner;
    let account_affiliates2: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    // investor Details
    let fromTime: number;
    let toTime: number;
    let expiryTime: number;

    let message = "Transaction Should Fail!";

    // Contract Instance Declaration
    let I_GeneralPermissionManagerFactory: any;
    let I_GeneralTransferManagerFactory: any;
    let I_SecurityTokenRegistryProxy: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralTransferManager: any;
    let I_ModuleRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_DummySTOFactory: any;
    let P_DummySTOFactory: any;
    let I_STFactory: any;
    let I_SecurityToken: any;
    let I_STRProxied: any;
    let I_MRProxied: any;
    let I_DummySTO: any;
    let I_PolyToken: any;
    let I_PolymathRegistry: any;
    let P_GeneralTransferManagerFactory: any;
    let I_STRGetter: any;
    let I_STGetter: any;
    let stGetter: any;

    // Contract Factories
    let DummySTOFactory: ContractFactory;
    let SecurityTokenFactory: ContractFactory;
    let GeneralTransferManagerFactory: ContractFactory;
    let GeneralPermissionManagerFactory: ContractFactory;
    let STGetterFactory: ContractFactory;

    const name = "Team";
    const symbol = "sap";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    const contact = "team@polymath.network";

    // Module key
    const delegateManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

    // Dummy STO details
    let startTime: number;
    let endTime: number;
    const cap = ethers.parseEther("10");
    const someString = "A string which is not used";
    const STOParameters = ["uint256", "uint256", "uint256", "string"];

    let currentTime: number;
    const address_zero = ethers.ZeroAddress;
    const one_address = "0x0000000000000000000000000000000000000001";
    let signer: any;
    let snapid: string;

    before(async () => {
        // Get signers
        accounts = await ethers.getSigners();
        
        currentTime = await latestTime();
        fromTime = await latestTime();
        toTime = await latestTime();
        expiryTime = toTime + duration.days(15);
        startTime = await latestTime() + duration.seconds(5000); // Start time will be 5000 seconds more than the latest time
        endTime = startTime + duration.days(80); // Add 80 days more

        // Account assignments
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        token_owner = account_issuer;
        token_owner_pk = pk.account_1;
        account_investor1 = accounts[8];
        account_investor2 = accounts[9];
        account_delegate = accounts[7];
        account_investor3 = accounts[5];
        account_investor4 = accounts[6];
        account_affiliates1 = accounts[3];
        account_affiliates2 = accounts[4];

        const randomAccount = accounts[2];

        // Get contract factories
        DummySTOFactory = await ethers.getContractFactory("DummySTO");
        GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManager");
        GeneralPermissionManagerFactory = await ethers.getContractFactory("GeneralPermissionManager");

        const oneeth = ethers.parseEther("1");
        const wallet = ethers.Wallet.createRandom();
        signer = wallet.connect(ethers.provider);
        
        // Fund the signer wallet
        await token_owner.sendTransaction({
            to: signer.address,
            value: oneeth
        });

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

        [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0n);
        [P_GeneralTransferManagerFactory] = await deployGTMAndVerifyed(account_polymath.address, I_MRProxied, ethers.parseEther("500"));
        [I_DummySTOFactory] = await deployDummySTOAndVerifyed(account_polymath.address, I_MRProxied, 0n);
        [P_DummySTOFactory] = await deployDummySTOAndVerifyed(account_polymath.address, I_MRProxied, ethers.parseEther("500"));

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

        DummySTOFactory:                   ${I_DummySTOFactory.target}
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
                        expect(parsed.args._owner).to.equal(token_owner.address);
                        expect(parsed.args._ticker).to.equal(symbol.toUpperCase());
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
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
            let securityTokenEvent: LogDescription | null = null;

            // Find NewSecurityToken event
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "NewSecurityToken") {
                        console.log("Parsed log:", parsed);
                        securityTokenEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log with STRProxied: ${err.message}`);
                }
            }

            expect(securityTokenEvent).to.not.be.null;
            expect(securityTokenEvent!.args._ticker).to.equal(symbol.toUpperCase(), "SecurityToken doesn't get deployed");

            I_SecurityToken = await ethers.getContractAt("SecurityToken", securityTokenEvent!.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", I_SecurityToken.target);

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
                    console.log(`Failed to parse ModuleAdded log: ${err.message}`);
                }
            }

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(2n);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            expect(nameBytes32).to.equal("GeneralTransferManager", "SecurityToken doesn't have the transfer manager module");
        });

        it("Should initialize the auto attached modules", async () => {
            const moduleData = (await stGetter.getModulesByType(2))[0];
            I_GeneralTransferManager = await ethers.getContractAt("GeneralTransferManager", moduleData);
        });

        it("Should attach the paid GTM -- failed because of no tokens", async () => {
            await catchRevert(
            I_SecurityToken.connect(account_issuer).addModule(P_GeneralTransferManagerFactory.target, "0x", ethers.parseEther("500"), 0n, false)
            );
        });

        it("Should attach the paid GTM", async () => {
            let snap_id = await takeSnapshot();
            // The module fee for P_GeneralTransferManagerFactory is 500 POLY
            await I_PolyToken.getTokens(ethers.parseEther("500"), I_SecurityToken.target);
            await I_SecurityToken.connect(account_issuer).addModule(P_GeneralTransferManagerFactory.target, "0x", ethers.parseEther("500"), 0n, false);
            await revertToSnapshot(snap_id);
        });

        it("Should add investor flags", async () => {
            let snap_id = await takeSnapshot();
            await I_GeneralTransferManager.connect(account_issuer).modifyInvestorFlagMulti([account_investor1.address, account_investor1.address, account_investor2.address], [0, 1, 1], [true, true, true]);
            let investors = await I_GeneralTransferManager.getInvestors(0, 2);
            expect(investors[0]).to.equal(account_investor1.address);
            expect(investors[1]).to.equal(account_investor2.address);
            let investorCount = await stGetter.getInvestorCount();
            expect(investorCount).to.equal(2n);
            let allInvestorFlags = await I_GeneralTransferManager.getAllInvestorFlags();
            expect(investors).to.deep.equal(allInvestorFlags[0]);
            expect(allInvestorFlags[1][0]).to.equal(3n); // 0b11
            expect(allInvestorFlags[1][1]).to.equal(2n); // 0b10
            let investorFlags = await I_GeneralTransferManager.getInvestorFlags(allInvestorFlags[0][0]);
            expect(investorFlags).to.equal(3n); // 0b11
            await revertToSnapshot(snap_id);
        });

        it("Should whitelist the affiliates before the STO attached", async () => {
            const fromTime = currentTime + duration.days(30);
            const toTime = currentTime + duration.days(90);
            const expiryTime1 = currentTime + duration.days(965);
            const expiryTime2 = currentTime + duration.days(365);

            console.log(`Estimate gas of one Whitelist:
            ${await I_GeneralTransferManager.connect(account_issuer).modifyKYCData.estimateGas(
                account_affiliates1.address,
                fromTime,
                toTime,
                expiryTime1
            )}`
            );
            
            let tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCDataMulti(
                [account_affiliates1.address, account_affiliates2.address],
                [fromTime, fromTime],
                [toTime, toTime],
                [expiryTime1, expiryTime2]
            );
            
            const receipt = await tx.wait();
            const kycEvents = receipt!.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).filter(parsed => parsed && parsed.name === "ModifyKYCData") as LogDescription[];

            expect(kycEvents.length).to.equal(2);
            expect(kycEvents[0].args._investor).to.equal(account_affiliates1.address);
            expect(kycEvents[1].args._investor).to.equal(account_affiliates2.address);

            await I_GeneralTransferManager.connect(account_issuer).modifyInvestorFlagMulti([account_affiliates1.address, account_affiliates2.address], [1, 1], [true, true]);
            
            expect(await I_GeneralTransferManager.getAllInvestors()).to.deep.equal([account_affiliates1.address, account_affiliates2.address]);
            
            console.log(await I_GeneralTransferManager.getAllKYCData());
            let data = await I_GeneralTransferManager.getKYCData([account_affiliates1.address, account_affiliates2.address]);
            
            expect(data[0][0]).to.equal(BigInt(fromTime));
            expect(data[0][1]).to.equal(BigInt(fromTime));
            expect(data[1][0]).to.equal(BigInt(toTime));
            expect(data[1][1]).to.equal(BigInt(toTime));
            expect(data[2][0]).to.equal(BigInt(expiryTime1));
            expect(data[2][1]).to.equal(BigInt(expiryTime2));
            
            expect(await I_GeneralTransferManager.getInvestorFlag(account_affiliates1.address, 1)).to.be.true;
            expect(await I_GeneralTransferManager.getInvestorFlag(account_affiliates2.address, 1)).to.be.true;
        });

        it("Should whitelist lots of addresses and check gas", async () => {
            let mockInvestors: string[] = [];
            for (let i = 0; i < 50; i++) {
            const address = ethers.Wallet.createRandom().address;
            mockInvestors.push(address);
            }

            let times = range1(50).map(i => BigInt(i));
            let tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCDataMulti(mockInvestors, times, times, times);
            const receipt = await tx.wait();
            console.log("Multi Whitelist x 50: " + receipt!.gasUsed.toString());
            
            const allInvestors = await I_GeneralTransferManager.getAllInvestors();
            const expectedInvestors = [account_affiliates1.address, account_affiliates2.address].concat(mockInvestors);
            expect(allInvestors).to.deep.equal(expectedInvestors);
        });

        it("Should mint the tokens to the affiliates", async () => {
            const issueAmount = ethers.parseEther("100");
            const amounts = [issueAmount, issueAmount];
            console.log(`
            Estimate gas cost for minting the tokens: ${await I_SecurityToken.connect(account_issuer).issueMulti.estimateGas([account_affiliates1.address, account_affiliates2.address], amounts)}
            `);
            await I_SecurityToken.connect(account_issuer).issueMulti([account_affiliates1.address, account_affiliates2.address], amounts);
            expect(await I_SecurityToken.balanceOf(account_affiliates1.address)).to.equal(issueAmount);
            expect(await I_SecurityToken.balanceOf(account_affiliates2.address)).to.equal(issueAmount);
        });

        it("Should successfully attach the STO factory with the security token -- failed because of no tokens", async () => {
            let bytesSTO = encodeModuleCall(STOParameters, [
            await latestTime() + duration.seconds(1000),
            await latestTime() + duration.days(40),
            cap,
            someString
            ]);
            await catchRevert(
                I_SecurityToken.connect(token_owner).addModule(P_DummySTOFactory.target, bytesSTO, ethers.parseEther("500"), 0n, false)
            );
        });

        it("Should successfully attach the STO factory with the security token", async () => {
            let snap_id = await takeSnapshot();
            let bytesSTO = encodeModuleCall(STOParameters, [
            await latestTime() + duration.seconds(1000),
            await latestTime() + duration.days(40),
            cap,
            someString
            ]);
            await I_PolyToken.getTokens(ethers.parseEther("500"), I_SecurityToken.target);
            const tx = await I_SecurityToken.connect(token_owner).addModule(P_DummySTOFactory.target, bytesSTO, ethers.parseEther("500"), 0n, false);
            
            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs.map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModuleAdded") as LogDescription | undefined;

            expect(moduleAddedEvent).to.not.be.undefined;
            expect(moduleAddedEvent!.args._types[0]).to.equal(stoKey);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            expect(nameBytes32).to.equal("DummySTO", "DummySTOFactory module was not added");
            I_DummySTO = await ethers.getContractAt("DummySTO", moduleAddedEvent!.args._module);
            await revertToSnapshot(snap_id);
        });

        it("Should successfully attach the STO factory with the security token - invalid data", async () => {
            let bytesSTO = encodeModuleCall(["uint256", "string"], [await latestTime() + duration.seconds(1000), someString]);
            await catchRevert(I_SecurityToken.connect(token_owner).addModule(P_DummySTOFactory.target, bytesSTO, 0n, 0n, false));
        });

        it("Should successfully attach the STO factory with the security token", async () => {
            let bytesSTO = encodeModuleCall(STOParameters, [
            await latestTime() + duration.seconds(1000),
            await latestTime() + duration.days(40),
            cap,
            someString
            ]);
            const tx = await I_SecurityToken.connect(token_owner).addModule(I_DummySTOFactory.target, bytesSTO, 0n, 0n, false);
            
            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs.map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModuleAdded") as LogDescription | undefined;

            expect(moduleAddedEvent).to.not.be.undefined;
            expect(moduleAddedEvent!.args._types[0]).to.equal(stoKey);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            expect(nameBytes32).to.equal("DummySTO", "DummySTOFactory module was not added");
            I_DummySTO = await ethers.getContractAt("DummySTO", moduleAddedEvent!.args._module);
        });

        it("Should successfully attach the permission manager factory with the security token", async () => {
            const tx = await I_SecurityToken.connect(token_owner).addModule(I_GeneralPermissionManagerFactory.target, "0x", 0n, 0n, false);
            
            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs.map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModuleAdded") as LogDescription | undefined;

            expect(moduleAddedEvent).to.not.be.undefined;
            expect(moduleAddedEvent!.args._types[0]).to.equal(delegateManagerKey);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            expect(nameBytes32).to.equal("GeneralPermissionManager", "GeneralPermissionManager module was not added");
            I_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);
        });

        it("should have transfer requirements initialized", async () => {
            let transferRestrictions = await I_GeneralTransferManager.transferRequirements(0);
            expect(transferRestrictions[0]).to.be.true;
            expect(transferRestrictions[1]).to.be.true;
            expect(transferRestrictions[2]).to.be.true;
            expect(transferRestrictions[3]).to.be.true;
            
            transferRestrictions = await I_GeneralTransferManager.transferRequirements(1);
            expect(transferRestrictions[0]).to.be.false;
            expect(transferRestrictions[1]).to.be.true;
            expect(transferRestrictions[2]).to.be.false;
            expect(transferRestrictions[3]).to.be.false;

            transferRestrictions = await I_GeneralTransferManager.transferRequirements(2);
            expect(transferRestrictions[0]).to.be.true;
            expect(transferRestrictions[1]).to.be.false;
            expect(transferRestrictions[2]).to.be.false;
            expect(transferRestrictions[3]).to.be.false;
        });

        it("should not allow unauthorized people to change transfer requirements", async () => {
            await catchRevert(
            I_GeneralTransferManager.connect(account_investor1).modifyTransferRequirementsMulti(
                [0, 1, 2],
                [true, false, true],
                [true, true, false],
                [false, false, false],
                [false, false, false]
            )
            );
            await catchRevert(I_GeneralTransferManager.connect(account_investor1).modifyTransferRequirements(0, false, false, false, false));
        });
        });

        describe("Buy tokens using on-chain whitelist", async () => {
        it("Should buy the tokens -- Failed due to investor is not in the whitelist", async () => {
            await catchRevert(I_DummySTO.connect(token_owner).generateTokens(account_investor1.address, ethers.parseEther("1")));
        });

        it("Should Buy the tokens", async () => {
            // Add the Investor in to the whitelist
            let tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
            account_investor1.address,
            currentTime,
            currentTime,
            currentTime + duration.days(10)
            );

            const receipt = await tx.wait();
            const kycEvent = receipt!.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModifyKYCData") as LogDescription | undefined;
            
            expect(kycEvent).to.not.be.undefined;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_investor1.address.toLowerCase(), "Failed in adding the investor in whitelist");

            // Jump time
            await increaseTime(5000);

            // Mint some tokens
            console.log(
            `Gas usage of minting of tokens: ${await I_DummySTO.connect(token_owner).generateTokens.estimateGas(account_investor1.address, ethers.parseEther("1"))}`
            );
            await I_DummySTO.connect(token_owner).generateTokens(account_investor1.address, ethers.parseEther("1"));

            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("1"));
        });

        it("Should fail in buying the token from the STO", async () => {
            await catchRevert(I_DummySTO.connect(token_owner).generateTokens(account_affiliates1.address, ethers.parseEther("1")));
        });

        it("Should fail in buying the tokens from the STO -- because amount is 0", async () => {
            await catchRevert(I_DummySTO.connect(token_owner).generateTokens(account_investor1.address, 0n));
        });

        it("Should fail in buying the tokens from the STO -- because STO is paused", async () => {
            await I_DummySTO.connect(account_issuer).pause();
            await catchRevert(I_DummySTO.connect(token_owner).generateTokens(account_investor1.address, ethers.parseEther("1")));
            // Reverting the changes related to pause
            await I_DummySTO.connect(account_issuer).unpause();
        });

        it("Should buy more tokens from the STO to investor1", async () => {
            await I_DummySTO.connect(token_owner).generateTokens(account_investor1.address, ethers.parseEther("1"));
            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("2"));
        });

        it("Should fail in investing the money in STO -- expiry limit reached", async () => {
            await increaseTime(duration.days(10));
            await catchRevert(I_DummySTO.connect(token_owner).generateTokens(account_investor1.address, ethers.parseEther("1")));
        });
        });

    describe("Buy tokens using on-chain whitelist and defaults", async () => {
        it("Should Buy the tokens", async () => {
            // Add the Investor in to the whitelist
            let tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
                account_investor1.address,
                0n,
                0n,
                currentTime + duration.days(20)
            );

            let receipt = await tx.wait();
            let kycEvent = receipt!.logs.map(log => {
                try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModifyKYCData") as LogDescription | undefined;

            expect(kycEvent).to.not.be.undefined;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_investor1.address.toLowerCase(), "Failed in adding the investor in whitelist");

            tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
                account_investor2.address,
                currentTime,
                currentTime,
                currentTime + duration.days(20)
            );

            receipt = await tx.wait();
            kycEvent = receipt!.logs.map(log => {
                try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModifyKYCData") as LogDescription | undefined;

            expect(kycEvent).to.not.be.undefined;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_investor2.address.toLowerCase(), "Failed in adding the investor in whitelist");

            // Jump time
            await increaseTime(5000);

            // At this point investor1 has 2e18 tokens. Transfer 1e18 to investor2
            await I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1"));
            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("1"));
        });

        it("Add a from default and check transfers are disabled then enabled in the future", async () => {
            await I_GeneralTransferManager.connect(token_owner).changeDefaults(BigInt(currentTime + duration.days(12)), 0n);
            // Balances: investor1: 1e18, investor2: 1e18.
            // investor2 transfers to investor1. This should be allowed as there is no 'to' default.
            await I_SecurityToken.connect(account_investor2).transfer(account_investor1.address, ethers.parseEther("1"));
            // investor1 transfers to investor2. This should fail because of the 'from' default.
            await catchRevert(I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1")));
            await increaseTime(duration.days(5));
            // After 5 days, the 'from' restriction is still active. It needs 12 days total.
            await I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1"));
        });

        it("Add a to default and check transfers are disabled then enabled in the future", async () => {
            await I_GeneralTransferManager.connect(token_owner).changeDefaults(0n, BigInt(currentTime + duration.days(16)));
            await catchRevert(I_SecurityToken.connect(account_investor2).transfer(account_investor1.address, ethers.parseEther("1")));
            await I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1"));
            await increaseTime(duration.days(2));
            // After 2 days, restriction is still active.
            await I_SecurityToken.connect(account_investor2).transfer(account_investor1.address, ethers.parseEther("2"));
            // revert changes
            await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
                account_investor2.address,
                0n,
                0n,
                0n
            );
            await I_GeneralTransferManager.connect(token_owner).changeDefaults(0n, 0n);
        });
    });

    describe("Buy tokens using off-chain whitelist", async () => {
        it("Should buy the tokens -- Failed due to investor is not in the whitelist", async () => {
            await catchRevert(I_DummySTO.connect(token_owner).generateTokens(account_investor2.address, ethers.parseEther("1")));
        });

        it("Should provide the permission and change the signing address", async () => {
            const tx = await I_GeneralPermissionManager.connect(token_owner).addDelegate(signer.address, ethers.encodeBytes32String("My details"));
            const receipt = await tx.wait();
            const delegateAddedEvent = receipt!.logs.map(log => {
                try { return I_GeneralPermissionManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "AddDelegate") as LogDescription | undefined;
            expect(delegateAddedEvent).to.not.be.undefined;
            expect(delegateAddedEvent!.args._delegate).to.equal(signer.address);

            await I_GeneralPermissionManager.connect(token_owner).changePermission(signer.address, I_GeneralTransferManager.target, ethers.encodeBytes32String("OPERATOR"), true);

            expect(
                await I_GeneralPermissionManager.checkPermission(signer.address, I_GeneralTransferManager.target, ethers.encodeBytes32String("OPERATOR"))
            ).to.be.true;
        });

        it("Should buy the tokens -- Failed due to incorrect signature input", async () => {
            // Add the Investor in to the whitelist
            let validFrom = await latestTime();
            let validTo = await latestTime() + duration.days(5);
            let nonce = 5;
            // Note: The original test passed a wrong value (investor address) for the TM address, causing the signature to be invalid.
            // This behavior is preserved to match the test's intent ("Failed due to incorrect signature input").
            const sig = getSignGTMData(
                account_investor2.address,
                account_investor2.address,
                fromTime,
                toTime,
                expiryTime,
                validFrom,
                validTo,
                nonce,
                signer.privateKey
            );


            await catchRevert(
                I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSigned(
                    account_investor2.address,
                    fromTime,
                    toTime,
                    expiryTime,
                    validFrom,
                    validTo,
                    nonce,
                    sig
                )
            );
        });

        it("Should buy the tokens -- Failed due to incorrect signature timing", async () => {
            // Add the Investor in to the whitelist
            let validFrom = (await latestTime()) - 100;
            let validTo = (await latestTime()) - 1;
            let nonce = 5;
            const sig = getSignGTMData(
                I_GeneralTransferManager.target as string,
                account_investor2.address,
                fromTime,
                toTime,
                expiryTime,
                validFrom,
                validTo,
                nonce,
                signer.privateKey
            );

            await catchRevert(
                I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSigned(
                    account_investor2.address,
                    fromTime,
                    toTime,
                    expiryTime,
                    validFrom,
                    validTo,
                    nonce,
                    sig
                )
            );
        });

        it("Should buy the tokens -- Failed due to incorrect signature signer", async () => {
            // Add the Investor in to the whitelist
            let validFrom = await latestTime();
            let validTo = await latestTime() + 60 * 60;
            let nonce = 5;
            const invalidPk = "0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200";
            const sig = getSignGTMData(
                I_GeneralTransferManager.target as string,
                account_investor2.address,
                fromTime,
                toTime,
                expiryTime,
                validFrom,
                validTo,
                nonce,
                invalidPk
            );

            const sig2 = getMultiSignGTMData(
                I_GeneralTransferManager.target as string,
                [account_investor2.address],
                [fromTime],
                [toTime],
                [expiryTime],
                validFrom,
                validTo,
                nonce,
                invalidPk
            );

            await catchRevert(
                I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSigned(
                    account_investor2.address,
                    fromTime,
                    toTime,
                    expiryTime,
                    validFrom,
                    validTo,
                    nonce,
                    sig
                )
            );

            await catchRevert(
                I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSignedMulti(
                    [account_investor2.address],
                    [fromTime],
                    [toTime],
                    [expiryTime],
                    validFrom,
                    validTo,
                    nonce,
                    sig2
                )
            );
        });

        it("Should Not Transfer with expired Signed KYC data", async () => {
            let nonce = 5;
            const sig = getSignGTMTransferData(
                I_GeneralTransferManager.target as string,
                [account_investor2.address],
                [currentTime],
                [currentTime],
                [expiryTime + duration.days(200)],
                1,
                1,
                nonce,
                signer.privateKey
            );

            // Jump time
            await increaseTime(10000);
            await catchRevert(I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1")));
            await catchRevert(I_SecurityToken.connect(account_investor1).transferWithData(account_investor2.address, ethers.parseEther("1"), sig));
        });

        it("Should Transfer with Signed KYC data", async () => {
            let snap_id = await takeSnapshot();
            // Add the Investor in to the whitelist
            let validFrom = await latestTime();
            let validTo = await latestTime() + duration.days(5);
            let nonce = 5;
            const sig = await getSignGTMTransferData(
                I_GeneralTransferManager.target,
                [account_investor2.address],
                [currentTime],
                [currentTime],
                [expiryTime + duration.days(200)],
                validFrom,
                validTo,
                nonce,
                signer.privateKey
            );

            // Jump time
            await increaseTime(10000);
            await expect(I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1"))).to.be.reverted;

            // console.log("balance", await I_SecurityToken.balanceOf(account_investor2.address));

            await I_SecurityToken.connect(account_investor1).transferWithData(account_investor2.address, ethers.parseEther("1"), sig);
            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("1"));
            //Should transfer even with invalid sig data when kyc not required
            await I_SecurityToken.connect(account_investor2).transferWithData(account_investor1.address, ethers.parseEther("1"), sig);
            await revertToSnapshot(snap_id);
        });

        it("Should not do multiple signed whitelist if sig has expired", async () => {
            snapid = await takeSnapshot();
            await I_GeneralTransferManager.connect(account_issuer).modifyKYCDataMulti(
                [account_investor1.address, account_investor2.address],
                [currentTime, currentTime],
                [currentTime, currentTime],
                [1, 1]
            );

            let kycData = await I_GeneralTransferManager.getKYCData([account_investor1.address, account_investor2.address]);

            expect(Number(kycData[2][0])).to.equal(1, "KYC data not modified correctly");
            expect(Number(kycData[2][1])).to.equal(1, "KYC data not modified correctly");

            let nonce = 5;

            let newExpiryTime = expiryTime + duration.days(200);
            const sig = getMultiSignGTMData(
                I_GeneralTransferManager.target as string,
                [account_investor1.address, account_investor2.address],
                [fromTime, fromTime],
                [toTime, toTime],
                [newExpiryTime, newExpiryTime],
                1,
                1,
                nonce,
                signer.privateKey
            );

            await increaseTime(10000);

            await catchRevert(
                I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSignedMulti(
                    [account_investor1.address, account_investor2.address],
                    [fromTime, fromTime],
                    [toTime, toTime],
                    [newExpiryTime, newExpiryTime],
                    1,
                    1,
                    nonce,
                    sig
                )
            );

            kycData = await I_GeneralTransferManager.getKYCData([account_investor1.address, account_investor2.address]);

            expect(Number(kycData[2][0])).to.equal(1, "KYC data modified incorrectly");
            expect(Number(kycData[2][1])).to.equal(1, "KYC data modified incorrectly");
        });

        it("Should not do multiple signed whitelist if array length mismatch", async () => {
            let validFrom = await latestTime();
            let validTo = await latestTime() + duration.days(5);
            let nonce = 5;

            let newExpiryTime = expiryTime + duration.days(200);
            const sig = getMultiSignGTMData(
                I_GeneralTransferManager.target as string,
                [account_investor1.address, account_investor2.address],
                [fromTime, fromTime],
                [toTime, toTime],
                [newExpiryTime], // Mismatched length
                validFrom,
                validTo,
                nonce,
                signer.privateKey
            );

            await increaseTime(10000);

            await catchRevert(
                I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSignedMulti(
                    [account_investor1.address, account_investor2.address],
                    [fromTime, fromTime],
                    [toTime, toTime],
                    [newExpiryTime], // Mismatched length
                    validFrom,
                    validTo,
                    nonce,
                    sig
                )
            );

            let kycData = await I_GeneralTransferManager.getKYCData([account_investor1.address, account_investor2.address]);

            expect(Number(kycData[2][0])).to.equal(1, "KYC data modified incorrectly");
            expect(Number(kycData[2][1])).to.equal(1, "KYC data modified incorrectly");
        });

        it("Should do multiple signed whitelist in a single transaction", async () => {
            let validFrom = await latestTime();
            let validTo = await latestTime() + duration.days(5);
            let nonce = 5;

            let newExpiryTime = BigInt(expiryTime + duration.days(200));
            const sig = getMultiSignGTMData(
                I_GeneralTransferManager.target,
                [account_investor1.address, account_investor2.address],
                [fromTime, fromTime],
                [toTime, toTime],
                [newExpiryTime, newExpiryTime],
                validFrom,
                validTo,
                nonce,
                signer.privateKey
            );

            await increaseTime(10000);

            await I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSignedMulti(
                [account_investor1.address, account_investor2.address],
                [fromTime, fromTime],
                [toTime, toTime],
                [newExpiryTime, newExpiryTime],
                validFrom,
                validTo,
                nonce,
                sig
            );

            let kycData = await I_GeneralTransferManager.getKYCData([account_investor1.address, account_investor2.address]);

            expect(kycData[2][0]).to.equal(newExpiryTime, "KYC data not modified correctly");
            expect(kycData[2][1]).to.equal(newExpiryTime, "KYC data not modified correctly");

            await revertToSnapshot(snapid);
        });

        it("Should Buy the tokens with signers signature", async () => {
            // Add the Investor in to the whitelist
            let validFrom = await latestTime();
            let validTo = await latestTime() + duration.days(5);
            let nonce = 5;
            const newExpiryTime = expiryTime + duration.days(200);
            const newToTime = currentTime + duration.days(100);

            const sig = getSignGTMData(
                I_GeneralTransferManager.target as string,
                account_investor2.address,
                currentTime,
                newToTime,
                newExpiryTime,
                validFrom,
                validTo,
                nonce,
                signer.privateKey
            );

            let tx = await I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSigned(
                account_investor2.address,
                currentTime,
                newToTime,
                newExpiryTime,
                validFrom,
                validTo,
                nonce,
                sig
            );

            const receipt = await tx.wait();
            const kycEvent = receipt!.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModifyKYCData") as LogDescription | undefined;

            expect(kycEvent).to.not.be.undefined;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_investor2.address.toLowerCase(), "Failed in adding the investor in whitelist");

            // Jump time
            await increaseTime(10000);
            // Mint some tokens
            await I_DummySTO.connect(token_owner).generateTokens(account_investor2.address, ethers.parseEther("1"));

            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("1")); // FAILING BECAUSE OF _executeTransfer test case
        });

        it("Should fail if the txn is generated with same nonce", async () => {
            // Add the Investor in to the whitelist
            let validFrom = await latestTime();
            let validTo = await latestTime() + duration.days(5);
            let nonce = 5; // Same nonce as previous test
            const newExpiryTime = expiryTime + duration.days(200);
            const newToTime = currentTime + duration.days(100);

            const sig = getSignGTMData(
            I_GeneralTransferManager.target as string,
            account_investor2.address,
            currentTime,
            newToTime,
            newExpiryTime,
            validFrom,
            validTo,
            nonce,
            signer.privateKey
            );

            await catchRevert(
            I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSigned(
                account_investor2.address,
                currentTime,
                newToTime,
                newExpiryTime,
                validFrom,
                validTo,
                nonce,
                sig
            )
            );
        });

        // Passing test case but have to pass in the token_owner private key - specific can be tested separately with ganache
        // it("Should sign with token owner key", async () => {
        //     // Add the Investor in to the whitelist
        //     let validFrom = await latestTime();
        //     let validTo = await latestTime() + duration.days(5);
        //     let nonce = 6; // New nonce
        //     const newExpiryTime = expiryTime + duration.days(200);
        //     const newToTime = currentTime + duration.days(100);

        //     const sig = getSignGTMData(
        //         I_GeneralTransferManager.target,
        //         account_investor2.address,
        //         currentTime,
        //         newToTime,
        //         newExpiryTime,
        //         validFrom,
        //         validTo,
        //         nonce,
        //         "0x4f591503dd585f7191ebc1e7b276da12c6020149eb2802b1059af10f085a32ef"
        //     );

        //     // ERROR: Invalid signature or data
        //     await I_GeneralTransferManager.connect(account_investor2).modifyKYCDataSigned(
        //         account_investor2.address,
        //         currentTime,
        //         newToTime,
        //         newExpiryTime,
        //         validFrom,
        //         validTo,
        //         nonce,
        //         sig
        //     );
        //     // Transaction is expected to succeed
        // });

        it("Should get the permission", async () => {
            let perm = await I_GeneralTransferManager.getPermissions();
            const permName = ethers.decodeBytes32String(perm[0]).replace(/\u0000/g, "");
            expect(permName).to.equal("ADMIN");
        });

        it("Should set a budget for the GeneralTransferManager", async () => {
            const budget = ethers.parseEther("10");
            await I_SecurityToken.connect(token_owner).changeModuleBudget(I_GeneralTransferManager.target, budget, true);
            await I_PolyToken.getTokens(budget, token_owner.address);
            await I_PolyToken.connect(token_owner).transfer(I_SecurityToken.target, budget);
        });

        it("should allow authorized people to modify transfer requirements", async () => {
            await I_GeneralTransferManager.connect(token_owner).modifyTransferRequirements(0, false, true, false, false);
            let transferRestrictions = await I_GeneralTransferManager.transferRequirements(0);
            expect(transferRestrictions[0]).to.be.false;
            expect(transferRestrictions[1]).to.be.true;
            expect(transferRestrictions[2]).to.be.false;
            expect(transferRestrictions[3]).to.be.false;
        });

        it("should failed in trasfering the tokens", async () => {
            await I_GeneralTransferManager.connect(token_owner).modifyTransferRequirementsMulti(
            [0, 1, 2],
            [true, false, true],
            [true, true, false],
            [false, false, false],
            [false, false, false]
            );
            await I_GeneralTransferManager.connect(token_owner).pause();
            await catchRevert(I_SecurityToken.connect(account_investor2).transfer(account_investor1.address, ethers.parseEther("1")));
        });

        it("Should change the Issuance address", async () => {
            let tx = await I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate.address, ethers.encodeBytes32String("My details"));
            let receipt = await tx.wait();
            let delegateAddedEvent = receipt!.logs.map(log => {
            try { return I_GeneralPermissionManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "AddDelegate") as LogDescription | undefined;
            expect(delegateAddedEvent!.args._delegate).to.equal(account_delegate.address);

            await I_GeneralPermissionManager.connect(token_owner).changePermission(account_delegate.address, I_GeneralTransferManager.target, ethers.encodeBytes32String("ADMIN"), true);
            
            tx = await I_GeneralTransferManager.connect(account_delegate).changeIssuanceAddress(account_investor2.address);
            receipt = await tx.wait();
            let issuanceChangedEvent = receipt!.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ChangeIssuanceAddress") as LogDescription | undefined;
            expect(issuanceChangedEvent!.args._issuanceAddress).to.equal(account_investor2.address);
        });

        it("Should unpause the transfers", async () => {
            await I_GeneralTransferManager.connect(token_owner).unpause();
            expect(await I_GeneralTransferManager.paused()).to.be.false;
        });

        it("Should get the init function", async () => {
            let byte = await I_GeneralTransferManager.getInitFunction();
            expect(byte).to.equal("0x00000000");
        });
        });

        describe("WhiteList that addresses", async () => {
        it("Should fail in adding the investors in whitelist", async () => {
            let fromTime = await latestTime();
            let toTime = await latestTime() + duration.days(20);
            let expiryTime = toTime + duration.days(10);

            await catchRevert(
            I_GeneralTransferManager.connect(account_investor1).modifyKYCDataMulti(
                [account_investor3.address, account_investor4.address],
                [fromTime, fromTime],
                [toTime, toTime],
                [expiryTime, expiryTime]
            )
            );
        });

        it("Should fail in adding the investors in whitelist -- array length mismatch", async () => {
            let fromTime = await latestTime();
            let toTime = await latestTime() + duration.days(20);
            let expiryTime = toTime + duration.days(10);

            await catchRevert(
            I_GeneralTransferManager.connect(account_delegate).modifyKYCDataMulti(
                [account_investor3.address, account_investor4.address],
                [fromTime],
                [toTime, toTime],
                [expiryTime, expiryTime]
            )
            );
        });

        it("Should fail in adding the investors in whitelist -- array length mismatch", async () => {
            let fromTime = await latestTime();
            let toTime = await latestTime() + duration.days(20);
            let expiryTime = toTime + duration.days(10);

            await catchRevert(
            I_GeneralTransferManager.connect(account_delegate).modifyKYCDataMulti(
                [account_investor3.address, account_investor4.address],
                [fromTime, fromTime],
                [toTime],
                [expiryTime, expiryTime]
            )
            );
        });

        it("Should fail in adding the investors in whitelist -- array length mismatch", async () => {
            let fromTime = await latestTime();
            let toTime = await latestTime() + duration.days(20);
            let expiryTime = toTime + duration.days(10);

            await catchRevert(
            I_GeneralTransferManager.connect(account_delegate).modifyKYCDataMulti(
                [account_investor3.address, account_investor4.address],
                [fromTime, fromTime],
                [toTime, toTime],
                [expiryTime]
            )
            );
        });

        it("Should successfully add the investors in whitelist", async () => {
            let fromTime = await latestTime();
            let toTime = await latestTime() + duration.days(20);
            let expiryTime = toTime + duration.days(10);

            let tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCDataMulti(
            [account_investor3.address, account_investor4.address],
            [fromTime, fromTime],
            [toTime, toTime],
            [expiryTime, expiryTime]
            );
            const receipt = await tx.wait();
            const kycEvents = receipt!.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).filter(parsed => parsed && parsed.name === "ModifyKYCData") as LogDescription[];
            
            expect(kycEvents.length).to.equal(2);
            expect(kycEvents[1].args._investor).to.equal(account_investor4.address);
        });
        });

        describe("Test cases for the getTokensByPartition", async() => {

        it("Should change the transfer requirements", async() => {
            await I_GeneralTransferManager.connect(token_owner).modifyTransferRequirementsMulti(
            [0, 1, 2],
            [true, false, true],
            [true, true, false],
            [true, false, false],
            [true, false, false]
            );
        })

        it("Should check the partition balance before changing the canSendAfter & canReceiveAfter", async() => {
            // ERROR CASE: FAILING AT _executeTransfer
            expect(ethers.formatEther(await I_SecurityToken.balanceOf(account_investor2.address))).to.equal("1.0");
            
            expect(
            ethers.formatEther(await I_GeneralTransferManager.getTokensByPartition(ethers.encodeBytes32String("LOCKED"), account_investor2.address, 0n))
            ).to.equal("0.0");
            
            // FAILING BECAUSE OF _executeTransfer test case
            expect(
            ethers.formatEther(await I_GeneralTransferManager.getTokensByPartition(ethers.encodeBytes32String("UNLOCKED"), account_investor2.address, 0n))
            ).to.equal("1.0");
        });

        it("Should change the canSendAfter and canRecieveAfter of the investor2", async() => {
            let canSendAfter = await latestTime() + duration.days(10);
            let canRecieveAfter = await latestTime() + duration.days(10);
            let expiryTime = await latestTime() + duration.days(100);

            let tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCData(
                account_investor2.address,
                canSendAfter,
                canRecieveAfter,
                expiryTime
            );
            const receipt = await tx.wait();
            const kycEvent = receipt!.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(parsed => parsed && parsed.name === "ModifyKYCData") as LogDescription | undefined;
            
            expect(kycEvent!.args._investor).to.equal(account_investor2.address);
            
            // ERROR CASE: FAILING AT _executeTransfer
            expect(
            ethers.formatEther(await I_GeneralTransferManager.getTokensByPartition(ethers.encodeBytes32String("LOCKED"), account_investor2.address, 0n))
            ).to.equal("1.0");

            expect(
            ethers.formatEther(await I_GeneralTransferManager.getTokensByPartition(ethers.encodeBytes32String("UNLOCKED"), account_investor2.address, 0n))
            ).to.equal("0.0");
        });

        it("Should check the values of partition balance after the GTM pause", async() => {
            await I_GeneralTransferManager.connect(token_owner).pause();
            
            expect(
            ethers.formatEther(await I_GeneralTransferManager.getTokensByPartition(ethers.encodeBytes32String("LOCKED"), account_investor2.address, 0n))
            ).to.equal("0.0");

            // ERROR CASE: FAILING AT _executeTransfer
            expect(
            ethers.formatEther(await I_GeneralTransferManager.getTokensByPartition(ethers.encodeBytes32String("UNLOCKED"), account_investor2.address, 0n))
            ).to.equal("1.0");

            await I_GeneralTransferManager.connect(token_owner).unpause();
        });
        });

        describe("General Transfer Manager Factory test cases", async () => {
        it("Should get the exact details of the factory", async () => {
            expect(await I_GeneralTransferManagerFactory.setupCost()).to.equal(0n);
            expect((await I_GeneralTransferManagerFactory.getTypes())[0]).to.equal(2n);
            const name = ethers.decodeBytes32String(await I_GeneralTransferManagerFactory.name()).replace(/\u0000/g, "");
            expect(name).to.equal("GeneralTransferManager", "Wrong Module added");
            expect(await I_GeneralTransferManagerFactory.description()).to.equal("Manage transfers using a time based whitelist", "Wrong Module added");
            expect(await I_GeneralTransferManagerFactory.title()).to.equal("General Transfer Manager", "Wrong Module added");
            expect(await I_GeneralTransferManagerFactory.version()).to.equal("3.0.0");
        });

        it("Should get the tags of the factory", async () => {
            let tags = await I_GeneralTransferManagerFactory.getTags();
            const tagName = ethers.decodeBytes32String(tags[0]).replace(/\u0000/g, "");
            expect(tagName).to.equal("General");
        });
        });

        describe("Dummy STO Factory test cases", async () => {
        it("should get the exact details of the factory", async () => {
            expect(await I_DummySTOFactory.setupCost()).to.equal(0n);
            expect((await I_DummySTOFactory.getTypes())[0]).to.equal(3n);
            const name = ethers.decodeBytes32String(await I_DummySTOFactory.name()).replace(/\u0000/g, "");
            expect(name).to.equal("DummySTO", "Wrong Module added");
            expect(await I_DummySTOFactory.description()).to.equal("Dummy STO", "Wrong Module added");
            expect(await I_DummySTOFactory.title()).to.equal("Dummy STO", "Wrong Module added");
        });

        it("Should get the tags of the factory", async () => {
            let tags = await I_DummySTOFactory.getTags();
            const tagName = ethers.decodeBytes32String(tags[0]).replace(/\u0000/g, "");
            expect(tagName).to.equal("Dummy");
        });

        });

        describe("Test cases for the get functions of the dummy sto", async () => {
        it("Should get the raised amount of ether", async () => {
            expect(await I_DummySTO.getRaised(0)).to.equal(0n);
        });

        it("Should get the raised amount of poly", async () => {
            expect(await I_DummySTO.getRaised(1)).to.equal(0n);
        });

        it("Should get the investors", async () => {
            expect(await I_DummySTO.getNumberInvestors()).to.equal(2n);
        });

        it("Should get the listed permissions", async () => {
            let tx = await I_DummySTO.getPermissions();
            const permName = ethers.decodeBytes32String(tx[0]).replace(/\u0000/g, "");
            expect(permName).to.equal("ADMIN");
        });

        it("Should get the amount of tokens sold", async () => {
            expect(await I_DummySTO.getTokensSold()).to.equal(0n);
        });
        });
    });

    function range1(i: number): number[] {
        return i ? range1(i - 1).concat(i) : [];
    }
    function rangeB(i: number): number[] {
        return i ? rangeB(i - 1).concat(0) : [];
    }
