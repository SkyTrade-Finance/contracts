import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration, ensureException, latestBlock } from "./helpers/utils";
import { setUpPolymathNetwork, deployEtherDividendAndVerifyed, deployGPMAndVerifyed } from "./helpers/createInstances";
import { increaseTime, revertToSnapshot, takeSnapshot } from "./helpers/time";
import { encodeModuleCall, encodeProxyCall } from "./helpers/encodeCall";

describe("EtherDividendCheckpoint", function() {

    // Accounts Variable declaration
    let account_polymath: HardhatEthersSigner;
    let account_issuer: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let wallet: HardhatEthersSigner;
    let account_investor1: HardhatEthersSigner;
    let account_investor2: HardhatEthersSigner;
    let account_investor3: HardhatEthersSigner;
    let account_investor4: HardhatEthersSigner;
    let account_manager: HardhatEthersSigner;
    let account_temp: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    const message = "Transaction Should Fail!";
    const dividendName = "0x546573744469766964656e640000000000000000000000000000000000000000";

    // Contract Instance Declaration
    let I_GeneralTransferManagerFactory: any;
    let I_SecurityTokenRegistryProxy: any;
    let P_EtherDividendCheckpointFactory: any;
    let P_EtherDividendCheckpoint: any;
    let I_EtherDividendCheckpointFactory: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralPermissionManagerFactory: any;  
    let I_EtherDividendCheckpoint: any;
    let I_GeneralTransferManager: any;
    let I_ModuleRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_STRProxied: any;
    let I_MRProxied: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_STFactory: any;
    let I_SecurityToken: any;
    let I_PolyToken: any;
    let I_PolymathRegistry: any;
    let I_STRGetter: any;
    let I_STGetter: any;  
    let stGetter: any;

    // Contract Factories
    let GeneralTransferManagerFactory: any;
    let EtherDividendCheckpointFactory: any;
    let SecurityTokenFactory: any;
    let STGetterFactory: any;

    // SecurityToken Details
    const name = "Team";
    const symbol = "SAP";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    const contact = "team@polymath.network";

    // Module keys
    const delegateManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;
    const checkpointKey = 4;

    // Manager details
    const managerDetails = ethers.encodeBytes32String("Hello");

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

    const one_address = "0x0000000000000000000000000000000000000001";
    const address_zero = ethers.ZeroAddress;

    let currentTime: number;
    let snapId: string;

    const DividendParameters = ["address"];

    before(async () => {
        // Get signers
        accounts = await ethers.getSigners();
        
        currentTime = await latestTime();
        
        // Account assignments
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        token_owner = account_issuer;
        account_temp = accounts[2];
        wallet = accounts[3];
        account_manager = accounts[5];
        account_investor1 = accounts[6];
        account_investor2 = accounts[7];
        account_investor3 = accounts[8];
        account_investor4 = accounts[9];

        console.log(token_owner.address, "token_owner.address");

        // Get contract factories
        GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManager");
        EtherDividendCheckpointFactory = await ethers.getContractFactory("EtherDividendCheckpoint");

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

        // Deploy EtherDividendCheckpoint factories
        [P_EtherDividendCheckpointFactory] = await deployEtherDividendAndVerifyed(
            account_polymath.address,
            I_MRProxied,
            ethers.parseEther("500")
        );
        
        [I_EtherDividendCheckpointFactory] = await deployEtherDividendAndVerifyed(
            account_polymath.address, 
            I_MRProxied, 
            0n
        );

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
        EtherDividendCheckpointFactory:    ${I_EtherDividendCheckpointFactory.target}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Generate the SecurityToken", async () => {
        it("Should register the ticker before the generation of the security token", async () => {
            console.log("Registering the ticker before the generation of the security token", I_STRProxied);
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
                wallet.address,
                0
            );
            const receipt = await tx.wait();
            let securityTokenEvent: LogDescription | null = null;

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

            expect(await stGetter.getTreasuryWallet()).to.equal(wallet.address, "Incorrect wallet set");

            for (const log of receipt!.logs) {
                try {
                    const parsed = I_SecurityToken.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModuleAdded") {
                        securityTokenEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log with STRProxied: ${err.message}`);
                }
            }

            expect(securityTokenEvent).to.not.be.null;
            const nameBytes32 = ethers.decodeBytes32String(securityTokenEvent!.args._name).replace(/\u0000/g, '');
            expect(nameBytes32).to.equal("GeneralTransferManager", "SecurityToken doesn't have the transfer manager module");
        });

        it("Should initialize the auto attached modules", async () => {
            const moduleData = (await stGetter.getModulesByType(2))[0];
            I_GeneralTransferManager = await ethers.getContractAt("GeneralTransferManager", moduleData);
        });

        it("Should fail to attach the paid EtherDividendCheckpoint with the security token due to insufficient POLY", async () => {
            const bytesDividend = encodeModuleCall(DividendParameters, [wallet.address]);
            await expect(
            I_SecurityToken.connect(token_owner).addModule(
                P_EtherDividendCheckpointFactory.target,
                bytesDividend,
                ethers.parseEther("2000"),
                0n,
                false
            )
            ).to.be.reverted;
        });

        it("Should successfully attach the paid EtherDividendCheckpoint with the security token", async () => {
            snapId = await takeSnapshot();
            await I_PolyToken.connect(token_owner).transfer(I_SecurityToken.target, ethers.parseEther("2000"));
            const bytesDividend = encodeModuleCall(DividendParameters, [wallet.address]);
            console.log("Adding EtherDividendCheckpoint module with POLY payment");
            const tx = await I_SecurityToken.connect(token_owner).addModule(
                P_EtherDividendCheckpointFactory.target,
                bytesDividend,
                ethers.parseEther("2000"),
                0n,
                false
            );
            console.log("Adding EtherDividendCheckpoint module with POLY payment 1");
            const receipt = await tx.wait();
            let moduleAddedEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_SecurityToken.interface.parseLog(log);
                if (parsed && parsed.name === "ModuleAdded") {
                moduleAddedEvent = parsed;
                break;
                }
            } catch (e) {
                // Ignore parsing errors
            }
            }

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(checkpointKey);
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            expect(moduleName).to.equal("EtherDividendCheckpoint");
            P_EtherDividendCheckpoint = await ethers.getContractAt("EtherDividendCheckpoint", moduleAddedEvent!.args._module);
            await revertToSnapshot(snapId);
        });

        it("Should successfully attach the free EtherDividendCheckpoint with the security token", async () => {
            const bytesDividend = encodeModuleCall(DividendParameters, [address_zero]);
            const tx = await I_SecurityToken.connect(token_owner).addModule(
            I_EtherDividendCheckpointFactory.target,
            bytesDividend,
            0n,
            0n,
            false
            );
            const receipt = await tx.wait();
            let moduleAddedEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_SecurityToken.interface.parseLog(log);
                if (parsed && parsed.name === "ModuleAdded") {
                moduleAddedEvent = parsed;
                break;
                }
            } catch (e) {
                // Ignore parsing errors
            }
            }

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(checkpointKey);
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            expect(moduleName).to.equal("EtherDividendCheckpoint");
            I_EtherDividendCheckpoint = await ethers.getContractAt("EtherDividendCheckpoint", moduleAddedEvent!.args._module);
        });
        });

        describe("Check Dividend payouts", async () => {
        it("Buy some tokens for account_investor1 (1 ETH)", async () => {
            // Add the Investor in to the whitelist
            const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
            account_investor1.address,
            currentTime,
            currentTime,
            BigInt(currentTime) + BigInt(duration.days(300000))
            );

            const receipt = await tx.wait();
            let kycEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_GeneralTransferManager.interface.parseLog(log);
            if (parsed && parsed.name === "ModifyKYCData") {
            kycEvent = parsed;
            break;
            }
            } catch (e) {
            // Ignore parsing errors
            }
            }
            expect(kycEvent).to.not.be.null;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_investor1.address.toLowerCase());

            // Jump time
            await increaseTime(5000);

            // Mint some tokens
            await I_SecurityToken.connect(token_owner).issue(account_investor1.address, ethers.parseEther("1"), "0x");

            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("1"));
        });

        it("Buy some tokens for account_investor2 (2 ETH)", async () => {
            // Add the Investor in to the whitelist
            const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
            account_investor2.address,
            currentTime,
            currentTime,
            BigInt(currentTime) + BigInt(duration.days(3000000))
            );

            const receipt = await tx.wait();
            let kycEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_GeneralTransferManager.interface.parseLog(log);
            if (parsed && parsed.name === "ModifyKYCData") {
            kycEvent = parsed;
            break;
            }
            } catch (e) {
            // Ignore parsing errors
            }
            }
            expect(kycEvent).to.not.be.null;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_investor2.address.toLowerCase());

            // Mint some tokens
            await I_SecurityToken.connect(token_owner).issue(account_investor2.address, ethers.parseEther("2"), "0x");

            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("2"));
        });

        it("Should fail in creating the dividend (no value)", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, dividendName)
            ).to.be.reverted;
        });

        it("Should fail in creating the dividend (expiry in past)", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) - duration.days(10);
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, dividendName, {
            value: ethers.parseEther("1.5")
            })
            ).to.be.reverted;
        });

        it("Should fail in creating the dividend (dates in past)", async () => {
            const maturity = (await latestTime()) - duration.days(2);
            const expiry = (await latestTime()) - duration.days(1);
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, dividendName, {
            value: ethers.parseEther("1.5")
            })
            ).to.be.reverted;
        });

        it("Set withholding tax of 20% on investor 2", async () => {
            await I_EtherDividendCheckpoint.connect(token_owner).setWithholding(
            [account_investor2.address],
            [ethers.parseEther("0.2")]
            );
        });

        it("Should fail in creating the dividend (empty name)", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            await expect(
                I_EtherDividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, ethers.ZeroHash, {
                    value: ethers.parseEther("1.5")
                })
            ).to.be.reverted;
        });

        it("Create new dividend", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, dividendName, {
            value: ethers.parseEther("1.5")
            });
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
            if (parsed && parsed.name === "EtherDividendDeposited") {
            dividendEvent = parsed;
            break;
            }
            } catch (e) {
            // Ignore parsing errors
            }
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(1n);
            expect(dividendEvent!.args._name).to.equal(dividendName);
            console.log("Dividend first :" + dividendEvent!.args._dividendIndex.toString());
        });

        it("Investor 1 transfers his token balance to investor 2", async () => {
            await I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1"));
            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(0n);
            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("3"));
        });

        it("Should fail to push dividends (before maturity)", async () => {
            await expect(I_EtherDividendCheckpoint.connect(token_owner).pushDividendPayment(0, 0, 10)).to.be.reverted;
        });

        it("Should fail to push dividends (not owner)", async () => {
            // Increase time by 2 day
            await increaseTime(duration.days(2));
            await expect(I_EtherDividendCheckpoint.connect(account_temp).pushDividendPayment(0, 0, 10)).to.be.reverted;
        });

        it("Should fail to push dividends (invalid dividend index)", async () => {
            await expect(I_EtherDividendCheckpoint.connect(token_owner).pushDividendPayment(2, 0, 10)).to.be.reverted;
        });

        it("Issuer pushes dividends to account holders", async () => {
            const investor1Balance = await ethers.provider.getBalance(account_investor1.address);
            const investor2Balance = await ethers.provider.getBalance(account_investor2.address);
            await I_EtherDividendCheckpoint.connect(token_owner).pushDividendPayment(0, 0, 10);
            const investor1BalanceAfter = await ethers.provider.getBalance(account_investor1.address);
            const investor2BalanceAfter = await ethers.provider.getBalance(account_investor2.address);
            expect(investor1BalanceAfter - investor1Balance).to.equal(ethers.parseEther("0.5"));
            expect(investor2BalanceAfter - investor2Balance).to.equal(ethers.parseEther("0.8"));
            //Check fully claimed
            const dividend = await I_EtherDividendCheckpoint.dividends(0);
            expect(dividend[5]).to.equal(ethers.parseEther("1.5")); // claimedAmount
        });

        it("Should not allow reclaiming withholding tax with incorrect index", async () => {
            await expect(I_EtherDividendCheckpoint.connect(token_owner).withdrawWithholding(300)).to.be.reverted;
        });

        it("Issuer reclaims withholding tax", async () => {
            const walletBalance = await ethers.provider.getBalance(wallet.address);
            await I_EtherDividendCheckpoint.connect(token_owner).withdrawWithholding(0);
            const walletBalanceAfter = await ethers.provider.getBalance(wallet.address);
            expect(walletBalanceAfter - walletBalance).to.equal(ethers.parseEther("0.2"));
        });

        it("No more withholding tax to withdraw", async () => {
            const walletBalance = await ethers.provider.getBalance(wallet.address);
            await I_EtherDividendCheckpoint.connect(token_owner).withdrawWithholding(0);
            const walletBalanceAfter = await ethers.provider.getBalance(wallet.address);
            expect(walletBalanceAfter - walletBalance).to.equal(0n);
        });

        it("Set withholding tax of 100% on investor 2", async () => {
            // 100% is represented as 10**18 (100 * 10**16)
            await I_EtherDividendCheckpoint.connect(token_owner).setWithholding([account_investor2.address], [ethers.parseEther("1")]);
        });

        it("Buy some tokens for account_temp (1 ETH)", async () => {
            // Add the Investor in to the whitelist
            const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
            account_temp.address,
            currentTime,
            currentTime,
            BigInt(currentTime) + BigInt(duration.days(200000))
            );

            const receipt = await tx.wait();
            let kycEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_GeneralTransferManager.interface.parseLog(log);
            if (parsed && parsed.name === "ModifyKYCData") {
            kycEvent = parsed;
            break;
            }
            } catch (e) {
            // Ignore parsing errors
            }
            }
            expect(kycEvent).to.not.be.null;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_temp.address.toLowerCase());

            // Mint some tokens
            await I_SecurityToken.connect(token_owner).issue(account_temp.address, ethers.parseEther("1"), "0x");

            expect(await I_SecurityToken.balanceOf(account_temp.address)).to.equal(ethers.parseEther("1"));
        });

        it("Create new dividend", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, dividendName, {
            value: ethers.parseEther("1.5")
            });
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
            if (parsed && parsed.name === "EtherDividendDeposited") {
            dividendEvent = parsed;
            break;
            }
            } catch (e) {
            // Ignore parsing errors
            }
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(2n);
            console.log("Dividend second :" + dividendEvent!.args._dividendIndex.toString());
        });

        it("Issuer pushes dividends fails due to passed expiry", async () => {
            await increaseTime(duration.days(12));
            await expect(I_EtherDividendCheckpoint.connect(token_owner).pushDividendPayment(1, 0, 10)).to.be.reverted;
        });

        it("Issuer reclaims dividend", async () => {
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).reclaimDividend(1);
            const receipt = await tx.wait();
            let reclaimEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
                    if (parsed && parsed.name === "EtherDividendReclaimed") {
                        reclaimEvent = parsed;
                        break;
                    }
                } catch (e) {
                // Ignore parsing errors
                }
            }
            expect(reclaimEvent).to.not.be.null;
            expect(reclaimEvent!.args._claimedAmount).to.equal(ethers.parseEther("1.5"));
            await expect(I_EtherDividendCheckpoint.connect(token_owner).reclaimDividend(1)).to.be.reverted;
        });

        it("Still no more withholding tax to withdraw", async () => {
            const walletBalance = await ethers.provider.getBalance(wallet.address);
            await I_EtherDividendCheckpoint.connect(token_owner).withdrawWithholding(0);
            const walletBalanceAfter = await ethers.provider.getBalance(wallet.address);
            expect(walletBalanceAfter - walletBalance).to.equal(0n);
        });

        it("Buy some tokens for account_investor3 (7 ETH)", async () => {
            // Add the Investor in to the whitelist
            const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
                account_investor3.address,
                currentTime,
                currentTime,
                BigInt(currentTime) + BigInt(duration.days(10000))
            );

            const receipt = await tx.wait();
            let kycEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_GeneralTransferManager.interface.parseLog(log);
                    if (parsed && parsed.name === "ModifyKYCData") {
                        kycEvent = parsed;
                        break;
                    }
                } catch (e) {
                // Ignore parsing errors
                }
            }
            expect(kycEvent).to.not.be.null;
            expect(kycEvent!.args._investor.toLowerCase()).to.equal(account_investor3.address.toLowerCase());

            // Mint some tokens
            await I_SecurityToken.connect(token_owner).issue(account_investor3.address, ethers.parseEther("7"), "0x");

            expect(await I_SecurityToken.balanceOf(account_investor3.address)).to.equal(ethers.parseEther("7"));
        });

        it("Create another new dividend", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, dividendName, {
            value: ethers.parseEther("11")
            });
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
            if (parsed && parsed.name === "EtherDividendDeposited") {
            dividendEvent = parsed;
            break;
            }
            } catch (e) {
            // Ignore parsing errors
            }
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(3n);
            console.log("Dividend third :" + dividendEvent!.args._dividendIndex.toString());
        });

        it("should investor 3 claims dividend - fails bad index", async () => {
            await expect(I_EtherDividendCheckpoint.connect(account_investor3).pullDividendPayment(5)).to.be.reverted;
        });

        it("Should investor 3 claims dividend", async () => {
            const investor1Balance = await ethers.provider.getBalance(account_investor1.address);
            const investor2Balance = await ethers.provider.getBalance(account_investor2.address);
            const investor3Balance = await ethers.provider.getBalance(account_investor3.address);
            await I_EtherDividendCheckpoint.connect(account_investor3).pullDividendPayment(2);
            const investor1BalanceAfter = await ethers.provider.getBalance(account_investor1.address);
            const investor2BalanceAfter = await ethers.provider.getBalance(account_investor2.address);
            const investor3BalanceAfter = await ethers.provider.getBalance(account_investor3.address);
            expect(investor1BalanceAfter - investor1Balance).to.equal(0n);
            expect(investor2BalanceAfter - investor2Balance).to.equal(0n);
            expect(investor3BalanceAfter - investor3Balance).to.be.closeTo(ethers.parseEther("7"), ethers.parseEther("0.01"));
        });

        it("Still no more withholding tax to withdraw", async () => {
            const walletBalance = await ethers.provider.getBalance(wallet.address);
            await I_EtherDividendCheckpoint.connect(token_owner).withdrawWithholding(2);
            const walletBalanceAfter = await ethers.provider.getBalance(wallet.address);
            expect(walletBalanceAfter - walletBalance).to.equal(0n);
        });

        it("should investor 3 claims dividend again - fails", async () => {
            await expect(I_EtherDividendCheckpoint.connect(account_investor3).pullDividendPayment(2)).to.be.reverted;
        });

        it("Issuer pushes remainder", async () => {
            const investor1Balance = await ethers.provider.getBalance(account_investor1.address);
            const investor2Balance = await ethers.provider.getBalance(account_investor2.address);
            const investor3Balance = await ethers.provider.getBalance(account_investor3.address);
            await I_EtherDividendCheckpoint.connect(token_owner).pushDividendPayment(2, 0, 10);
            const investor1BalanceAfter = await ethers.provider.getBalance(account_investor1.address);
            const investor2BalanceAfter = await ethers.provider.getBalance(account_investor2.address);
            const investor3BalanceAfter = await ethers.provider.getBalance(account_investor3.address);
            expect(investor1BalanceAfter - investor1Balance).to.equal(0n);
            expect(investor2BalanceAfter - investor2Balance).to.equal(0n); // 100% withholding
            expect(investor3BalanceAfter - investor3Balance).to.equal(0n);
            //Check fully claimed
            const dividend = await I_EtherDividendCheckpoint.dividends(2);
            expect(dividend[5]).to.equal(ethers.parseEther("11"));
        });

        it("Issuer withdraws new withholding tax", async () => {
            const walletBalance = await ethers.provider.getBalance(wallet.address);
            await I_EtherDividendCheckpoint.connect(token_owner).withdrawWithholding(2);
            const walletBalanceAfter = await ethers.provider.getBalance(wallet.address);
            expect(walletBalanceAfter - walletBalance).to.equal(ethers.parseEther("3"));
        });

        it("Investor 2 transfers 1 ETH of his token balance to investor 1", async () => {
            await I_SecurityToken.connect(account_investor2).transfer(account_investor1.address, ethers.parseEther("1"));
            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("1"));
            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("2"));
            expect(await I_SecurityToken.balanceOf(account_investor3.address)).to.equal(ethers.parseEther("7"));
        });

        it("Create another new dividend with no value - fails", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(2);
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(maturity, expiry, 4, dividendName, { value: 0 })
            ).to.be.reverted;
        });

        it("Create another new dividend with explicit past expiry - fails", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) - duration.days(10);
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(maturity, expiry, 4, dividendName, {
            value: ethers.parseEther("11")
            })
            ).to.be.reverted;
        });

        it("Create another new dividend with bad dates - fails", async () => {
            const maturity = (await latestTime()) - duration.days(5);
            const expiry = (await latestTime()) - duration.days(2);
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(maturity, expiry, 4, dividendName, {
            value: ethers.parseEther("11")
            })
            ).to.be.reverted;
        });

        it("Create another new dividend with bad checkpoint in the future - fails", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(2);
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(maturity, expiry, 5, dividendName, {
            value: ethers.parseEther("11")
            })
            ).to.be.reverted;
        });

        it("Should not create dividend with more exclusions than limit", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            const limit = await I_EtherDividendCheckpoint.EXCLUDED_ADDRESS_LIMIT();
            const addresses = [];
            for (let i = 0; i < Number(limit) + 1; i++) {
            addresses.push(ethers.Wallet.createRandom().address);
            }
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(maturity, expiry, 4, addresses, dividendName, {
            value: ethers.parseEther("10")
            })
            ).to.be.reverted;
        });

        it("Create another new dividend with explicit checkpoint and excluding account_investor1", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            //checkpoint created in above test
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(
            maturity,
            expiry,
            4,
            [account_investor1.address],
            dividendName,
            { value: ethers.parseEther("10") }
            );
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
            if (parsed && parsed.name === "EtherDividendDeposited") {
            dividendEvent = parsed;
            break;
            }
            } catch (e) {
            // Ignore parsing errors
            }
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(4n);
            console.log("Dividend Fourth :" + dividendEvent!.args._dividendIndex.toString());
        });

        it("Should not create new dividend with duplicate exclusion", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            //checkpoint created in above test
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(
            maturity,
            expiry,
            4,
            [account_investor1.address, account_investor1.address],
            dividendName,
            { value: ethers.parseEther("10") }
            )
            ).to.be.reverted;
        });

        it("Should not create new dividend with 0x0 address in exclusion", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            //checkpoint created in above test
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(maturity, expiry, 4, [address_zero], dividendName, {
            value: ethers.parseEther("10")
            })
            ).to.be.reverted;
        });

        it("Non-owner pushes investor 1 - fails", async () => {
            await expect(
            I_EtherDividendCheckpoint.connect(account_investor2).pushDividendPaymentToAddresses(3, [
            account_investor2.address,
            account_investor1.address
            ])
            ).to.be.reverted;
        });

        it("issuer pushes investor 1 with bad dividend index - fails", async () => {
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).pushDividendPaymentToAddresses(6, [
            account_investor2.address,
            account_investor1.address
            ])
            ).to.be.reverted;
        });

        it("should calculate dividend before the push dividend payment", async () => {
            const dividendAmount1 = await I_EtherDividendCheckpoint.calculateDividend(3, account_investor1.address);
            const dividendAmount2 = await I_EtherDividendCheckpoint.calculateDividend(3, account_investor2.address);
            const dividendAmount3 = await I_EtherDividendCheckpoint.calculateDividend(3, account_investor3.address);
            const dividendAmount_temp = await I_EtherDividendCheckpoint.calculateDividend(3, account_temp.address);
            // 1 has 1/11th, 2 has 2/11th, 3 has 7/11th, temp has 1/11th, but 1 is excluded
            // Withholding of 100% is active for investor 2
            expect(dividendAmount1[0]).to.equal(ethers.parseEther("0")); // Excluded
            expect(dividendAmount1[1]).to.equal(ethers.parseEther("0"));
            expect(dividendAmount2[0]).to.equal(ethers.parseEther("2")); // Total dividend
            expect(dividendAmount2[1]).to.equal(ethers.parseEther("2")); // Withheld amount
            expect(dividendAmount3[0]).to.equal(ethers.parseEther("7"));
            expect(dividendAmount3[1]).to.equal(ethers.parseEther("0"));
            expect(dividendAmount_temp[0]).to.equal(ethers.parseEther("1"));
            expect(dividendAmount_temp[1]).to.equal(ethers.parseEther("0"));
        });

        it("Investor 2 claims dividend", async () => {
            // With 100% withholding, investor 2 receives 0 ETH.
            // We check that their balance does not increase.
            const investor2BalanceBefore = await ethers.provider.getBalance(account_investor2.address);
            const tx = await I_EtherDividendCheckpoint.connect(account_investor2).pullDividendPayment(3);
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
            const investor2BalanceAfter = await ethers.provider.getBalance(account_investor2.address);
            expect(investor2BalanceAfter).to.equal(investor2BalanceBefore - BigInt(gasUsed));
        });

        it("Should issuer pushes investor 1 and temp investor", async () => {
            const tempBalanceBefore = await ethers.provider.getBalance(account_temp.address);
            await I_EtherDividendCheckpoint.connect(token_owner).pushDividendPaymentToAddresses(3, [
            account_investor1.address,
            account_temp.address
            ]);
            const tempBalanceAfter = await ethers.provider.getBalance(account_temp.address);

            // account_investor1 is excluded, so no payment.
            // account_temp should receive their dividend.
            expect(tempBalanceAfter - tempBalanceBefore).to.equal(ethers.parseEther("1"));

            // Check claimed amount: Investor 2 claimed (2 ETH) + temp investor claimed (1 ETH)
            const dividend = await I_EtherDividendCheckpoint.dividends(3);
            expect(dividend[5]).to.equal(ethers.parseEther("3"));
        });

        it("should calculate dividend after the push dividend payment", async () => {
            // Dividends for these investors have been processed
            const dividendAmount1 = await I_EtherDividendCheckpoint.calculateDividend(3, account_investor1.address);
            const dividendAmount2 = await I_EtherDividendCheckpoint.calculateDividend(3, account_investor2.address);
            expect(dividendAmount1[0]).to.equal(0n);
            expect(dividendAmount2[0]).to.equal(0n);
        });

        it("Issuer unable to reclaim dividend (expiry not passed)", async () => {
            await expect(I_EtherDividendCheckpoint.connect(token_owner).reclaimDividend(3)).to.be.reverted;
        });

        it("Should fail to reclaim a non-existent dividend after expiry", async () => {
            await increaseTime(duration.days(11));
            await expect(I_EtherDividendCheckpoint.connect(token_owner).reclaimDividend(8)).to.be.reverted;
        });

        it("Issuer is able to reclaim dividend after expiry", async () => {
            // Reclaim goes to token_owner as they created the dividend with a zero address wallet
            const tokenOwnerBalance = await ethers.provider.getBalance(wallet.address);
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).reclaimDividend(3);
            const receipt = await tx.wait();
            const tokenOwnerAfter = await ethers.provider.getBalance(wallet.address);
            // 10 ETH total, 3 ETH claimed, 7 ETH remains to be reclaimed.
            expect(tokenOwnerAfter - tokenOwnerBalance).to.equal(ethers.parseEther("7"));
        });

        it("Should fail to reclaim dividend that has already been reclaimed", async () => {
            await expect(I_EtherDividendCheckpoint.connect(token_owner).reclaimDividend(3)).to.be.reverted;
        });

        it("Investor 3 unable to pull dividend after expiry", async () => {
            await expect(I_EtherDividendCheckpoint.connect(account_investor3).pullDividendPayment(3)).to.be.reverted;
        });

        it("Assign token balance to an address that can't receive funds", async () => {
            await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
            I_PolyToken.target,
            currentTime,
            currentTime,
            BigInt(currentTime) + BigInt(duration.days(1000000))
            );

            await increaseTime(5000);
            await I_SecurityToken.connect(token_owner).issue(I_PolyToken.target, ethers.parseEther("1"), "0x");

            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("1"));
            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("2"));
            expect(await I_SecurityToken.balanceOf(account_investor3.address)).to.equal(ethers.parseEther("7"));
            expect(await I_SecurityToken.balanceOf(account_temp.address)).to.equal(ethers.parseEther("1"));
            expect(await I_SecurityToken.balanceOf(I_PolyToken.target)).to.equal(ethers.parseEther("1"));
        });

        it("Create another new dividend", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).createDividendWithExclusions(maturity, expiry, [], dividendName, {
            value: ethers.parseEther("12")
            });
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
            if (parsed && parsed.name === "EtherDividendDeposited") {
            dividendEvent = parsed;
            break;
            }
            } catch (e) {}
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(6n, "Dividend should be created at checkpoint 6");
            console.log("Dividend Fifth :" + dividendEvent!.args._dividendIndex.toString());
        });

        it("Should issuer pushes all dividends", async () => {
            const investor1BalanceBefore = await ethers.provider.getBalance(account_investor1.address);
            const investor3BalanceBefore = await ethers.provider.getBalance(account_investor3.address);
            const tempBalanceBefore = await ethers.provider.getBalance(account_temp.address);

            await I_EtherDividendCheckpoint.connect(token_owner).pushDividendPayment(4, 0, 10);

            const investor1BalanceAfter = await ethers.provider.getBalance(account_investor1.address);
            const investor3BalanceAfter = await ethers.provider.getBalance(account_investor3.address);
            const tempBalanceAfter = await ethers.provider.getBalance(account_temp.address);

            expect(investor1BalanceAfter - investor1BalanceBefore).to.equal(ethers.parseEther("1"));
            expect(investor3BalanceAfter - investor3BalanceBefore).to.equal(ethers.parseEther("7"));
            expect(tempBalanceAfter - tempBalanceBefore).to.equal(ethers.parseEther("1"));

            // Check claimed amount (paid + withheld). 9 paid + 2 withheld (inv2) = 11
            const dividend = await I_EtherDividendCheckpoint.dividends(4);
            expect(dividend[5]).to.equal(ethers.parseEther("11"));
        });

        it("Should give the right dividend index for an existing checkpoint", async () => {
            const index = await I_EtherDividendCheckpoint.getDividendIndex(3);
            expect(index[0]).to.equal(2n);
        });

        it("Should give an empty array for a non-existent checkpoint", async () => {
            const index = await I_EtherDividendCheckpoint.getDividendIndex(8);
            expect(index.length).to.equal(0);
        });

        it("Should get the listed permissions", async () => {
            const permissions = await I_EtherDividendCheckpoint.getPermissions();
            expect(permissions.length).to.equal(2);
            expect(ethers.decodeBytes32String(permissions[0]).replace(/\u0000/g, "")).to.equal("ADMIN");
            expect(ethers.decodeBytes32String(permissions[1]).replace(/\u0000/g, "")).to.equal("OPERATOR");
        });

        it("should register a delegate", async () => {
            [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0n);
            const tx = await I_SecurityToken.connect(token_owner).addModule(
            I_GeneralPermissionManagerFactory.target,
            "0x",
            0n,
            0n,
            false
            );
            const receipt = await tx.wait();
            let moduleAddedEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
            const parsed = I_SecurityToken.interface.parseLog(log);
            if (parsed && parsed.name === "ModuleAdded" && ethers.decodeBytes32String(parsed.args._name).replace(/\u0000/g, "") === "GeneralPermissionManager") {
            moduleAddedEvent = parsed;
            break;
            }
            } catch (e) {}
            }
            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(delegateManagerKey);
            I_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);

            const delegateTx = await I_GeneralPermissionManager.connect(token_owner).addDelegate(account_manager.address, managerDetails);
            const delegateReceipt = await delegateTx.wait();
            let delegateAddedEvent: LogDescription | null = null;
            for (const log of delegateReceipt!.logs) {
            try {
            const parsed = I_GeneralPermissionManager.interface.parseLog(log);
            if (parsed && parsed.name === "AddDelegate") {
            delegateAddedEvent = parsed;
            break;
            }
            } catch (e) {}
            }
            expect(delegateAddedEvent).to.not.be.null;
            expect(delegateAddedEvent!.args._delegate).to.equal(account_manager.address);
        });

        it("should not allow manager without permission to create dividend", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            await expect(
            I_EtherDividendCheckpoint.connect(account_manager).createDividend(maturity, expiry, dividendName, {
            value: ethers.parseEther("12")
            })
            ).to.be.reverted;
        });

        it("should not allow manager without permission to create dividend with checkpoint", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const checkpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            await expect(
            I_EtherDividendCheckpoint.connect(account_manager).createDividendWithCheckpoint(maturity, expiry, checkpointId, dividendName, {
            value: ethers.parseEther("12")
            })
            ).to.be.reverted;
        });

        it("should not allow manager without permission to create dividend with exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [one_address];
            await expect(
            I_EtherDividendCheckpoint.connect(account_manager).createDividendWithExclusions(maturity, expiry, exclusions, dividendName, {
            value: ethers.parseEther("12")
            })
            ).to.be.reverted;
        });

        it("should not allow manager without permission to create dividend with checkpoint and exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [one_address];
            const checkpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            await expect(
            I_EtherDividendCheckpoint.connect(account_manager).createDividendWithCheckpointAndExclusions(
            maturity,
            expiry,
            checkpointId,
            exclusions,
            dividendName,
            { value: ethers.parseEther("12") }
            )
            ).to.be.reverted;
        });

        it("should not allow manager without permission to create checkpoint", async () => {
            await expect(I_EtherDividendCheckpoint.connect(account_manager).createCheckpoint()).to.be.reverted;
        });

        it("should give permission to manager", async () => {
            await I_GeneralPermissionManager.connect(token_owner).changePermission(account_manager.address, I_EtherDividendCheckpoint.target, ethers.encodeBytes32String("OPERATOR"), true);
            const tx = await I_GeneralPermissionManager.connect(token_owner).changePermission(account_manager.address, I_EtherDividendCheckpoint.target, ethers.encodeBytes32String("ADMIN"), true);
            
            const receipt = await tx.wait();
            let changePermissionEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_GeneralPermissionManager.interface.parseLog(log);
                if (parsed && parsed.name === "ChangePermission") {
                changePermissionEvent = parsed;
                break;
                }
            } catch (e) {}
            }
            expect(changePermissionEvent).to.not.be.null;
            expect(changePermissionEvent!.args._delegate).to.equal(account_manager.address);
        });

        it("should allow manager with permission to create dividend", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);

            const tx = await I_EtherDividendCheckpoint.connect(account_manager).createDividend(maturity, expiry, dividendName, {
            value: ethers.parseEther("12")
            });
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
                if (parsed && parsed.name === "EtherDividendDeposited") {
                dividendEvent = parsed;
                break;
                }
            } catch (e) {}
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(9n);
            console.log("Dividend sixth :" + dividendEvent!.args._dividendIndex.toString());
        });

        it("should allow manager with permission to create dividend with checkpoint", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const checkpointID = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            const tx = await I_EtherDividendCheckpoint.connect(account_manager).createDividendWithCheckpoint(maturity, expiry, checkpointID, dividendName, {
            value: ethers.parseEther("12")
            });
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
                if (parsed && parsed.name === "EtherDividendDeposited") {
                dividendEvent = parsed;
                break;
                }
            } catch (e) {}
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(10n);
            console.log("Dividend seventh :" + dividendEvent!.args._dividendIndex.toString());
        });

        it("should allow manager with permission to create dividend with exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [one_address];
            const tx = await I_EtherDividendCheckpoint.connect(account_manager).createDividendWithExclusions(maturity, expiry, exclusions, dividendName, {
            value: ethers.parseEther("12")
            });
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
                if (parsed && parsed.name === "EtherDividendDeposited") {
                dividendEvent = parsed;
                break;
                }
            } catch (e) {}
            }
            expect(dividendEvent).to.not.be.null;
            console.log("Dividend Eighth :" + dividendEvent!.args._dividendIndex.toString());
            expect(dividendEvent!.args._checkpointId).to.equal(11n);
        });

        it("Should fail to update the dividend dates because msg.sender is not authorised", async () => {
            await expect(
            I_EtherDividendCheckpoint.connect(account_polymath).updateDividendDates(7, 0, 1)
            ).to.be.reverted;
        });

        it("Should fail to update the dates when the dividend get expired", async() => {
            const id = await takeSnapshot();
            await increaseTime(duration.days(11));
            await expect(
            I_EtherDividendCheckpoint.connect(token_owner).updateDividendDates(7, 0, 1)
            ).to.be.reverted;
            await revertToSnapshot(id);
        });

        it("Should update the dividend dates", async() => {
            const newMaturity = (await latestTime()) - duration.days(4);
            const newExpiry = (await latestTime()) - duration.days(2);
            await I_EtherDividendCheckpoint.connect(token_owner).updateDividendDates(7, newMaturity, newExpiry);
            const info = await I_EtherDividendCheckpoint.getDividendData(7);
            expect(info[1]).to.equal(BigInt(newMaturity));
            expect(info[2]).to.equal(BigInt(newExpiry));
            // Can now reclaim the dividend
            await I_EtherDividendCheckpoint.connect(token_owner).reclaimDividend(7);
        });

         it("Reclaim ETH from the dividend contract", async () => {
            const currentDividendBalance = await ethers.provider.getBalance(I_EtherDividendCheckpoint.target);
            const currentIssuerBalance = await ethers.provider.getBalance(token_owner.address);
            await expect(I_EtherDividendCheckpoint.connect(account_polymath).reclaimETH()).to.be.reverted;
            const tx = await I_EtherDividendCheckpoint.connect(token_owner).reclaimETH();
            const receipt = await tx.wait();
            const gasCost = receipt!.gasUsed * receipt!.gasPrice;
            expect(await ethers.provider.getBalance(I_EtherDividendCheckpoint.target)).to.equal(0n);
            const newIssuerBalance = await ethers.provider.getBalance(token_owner.address);
            console.log("Reclaimed: " + currentDividendBalance.toString());
            expect(newIssuerBalance).to.equal(currentIssuerBalance - BigInt(gasCost) + currentDividendBalance);
        });

        it("should allow manager with permission to create dividend with checkpoint and exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [one_address];
            const checkpointID = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            const tx = await I_EtherDividendCheckpoint.connect(account_manager).createDividendWithCheckpointAndExclusions(
            maturity,
            expiry,
            checkpointID,
            exclusions,
            dividendName,
            { value: ethers.parseEther("12") }
            );
            const receipt = await tx.wait();
            let dividendEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_EtherDividendCheckpoint.interface.parseLog(log);
                if (parsed && parsed.name === "EtherDividendDeposited") {
                dividendEvent = parsed;
                break;
                }
            } catch (e) {}
            }
            expect(dividendEvent).to.not.be.null;
            expect(dividendEvent!.args._checkpointId).to.equal(12n);
        });

        it("should allow manager with permission to create checkpoint", async () => {
            const initCheckpointID = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_EtherDividendCheckpoint.connect(account_manager).createCheckpoint();
            const finalCheckpointID = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            expect(finalCheckpointID).to.equal(initCheckpointID + 1n);
        });

        describe("Test cases for the EtherDividendCheckpointFactory", async () => {
            it("should get the exact details of the factory", async () => {
            expect(await I_EtherDividendCheckpointFactory.setupCost()).to.equal(0n);
            expect((await I_EtherDividendCheckpointFactory.getTypes())[0]).to.equal(4);
            expect(await I_EtherDividendCheckpointFactory.version()).to.equal("3.0.0");
            expect(
                ethers.decodeBytes32String(await I_EtherDividendCheckpointFactory.name()).replace(/\u0000/g, "")
            ).to.equal("EtherDividendCheckpoint", "Wrong Module added");
            expect(
                await I_EtherDividendCheckpointFactory.description()
            ).to.equal("Create ETH dividends for token holders at a specific checkpoint", "Wrong Module added");
            expect(await I_EtherDividendCheckpointFactory.title()).to.equal("Ether Dividend Checkpoint", "Wrong Module added");
            const tags = await I_EtherDividendCheckpointFactory.getTags();
            expect(tags.length).to.equal(3);
            });
        });
        });
});
