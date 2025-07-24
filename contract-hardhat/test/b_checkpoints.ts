import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { setUpPolymathNetwork } from "./helpers/createInstances";
import { initializeContracts } from "../scripts/polymath-deploy";

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
    USDTieredSTO,
    USDTieredSTOFactory,
} from "../typechain-types";

describe("Checkpoints", function() {
    // Accounts Variable declaration
    let account_polymath: HardhatEthersSigner;
    let account_issuer: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let account_investor1: HardhatEthersSigner;
    let account_investor2: HardhatEthersSigner;
    let account_investor3: HardhatEthersSigner;
    let account_investor4: HardhatEthersSigner;
    let account_controller: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    const message = "Transaction Should Fail!";

    // investor Details
    let fromTime: number;
    let toTime: number;
    let expiryTime: number;

    // Contract Instance Declaration
    let I_GeneralPermissionManagerFactory: Contract;
    let I_SecurityTokenRegistryProxy: SecurityTokenRegistryProxy;
    let I_GeneralTransferManagerFactory: GeneralTransferManagerFactory;
    let I_GeneralPermissionManager: Contract;
    let I_GeneralTransferManager: GeneralTransferManager;
    let I_ExchangeTransferManager: Contract;
    let I_STRProxied: any;
    let I_MRProxied: Contract;
    let I_ModuleRegistry: Contract;
    let I_ModuleRegistryProxy: Contract;
    let I_FeatureRegistry: Contract;
    let I_SecurityTokenRegistry: Contract;
    let I_STFactory: Contract;
    let I_SecurityToken: Contract;
    let I_PolyToken: Contract;
    let I_PolymathRegistry: Contract;
    let I_STRGetter: Contract;
    let I_STGetter: Contract;
    let stGetter: Contract;

    // Contract factories
    let SecurityToken: ContractFactory;
    let GeneralTransferManager: ContractFactory;
    let STGetter: ContractFactory;

    // SecurityToken Details
    const name = "Team";
    const symbol = "SAP";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    const contact = "team@polymath.network";

    // Module key
    const delegateManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

    before(async () => {

        await initializeContracts();
        // Get signers
        accounts = await ethers.getSigners();
        
        fromTime = await latestTime();
        toTime = await latestTime();
        expiryTime = toTime + duration.days(15);
        
        // Accounts setup
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        token_owner = account_issuer;
        account_controller = accounts[3];
        account_investor1 = accounts[6];
        account_investor2 = accounts[7];
        account_investor3 = accounts[8];
        account_investor4 = accounts[9];
        
        console.log(token_owner.address, "token_owner.address");

        GeneralTransferManager = await ethers.getContractFactory("GeneralTransferManager");

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
                token_owner.address,
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

        it("Should set the controller", async() => {
            await I_SecurityToken.connect(token_owner).setController(account_controller.address);
        });

        it("Should initialize the auto attached modules", async () => {
            const moduleData: string[] = await stGetter.getModulesByType(transferManagerKey);
            console.log("Module Data:", moduleData[0], moduleData);

            I_GeneralTransferManager = GeneralTransferManager.attach(moduleData[0]);
        });
    });

    describe("Buy tokens using on-chain whitelist", async () => {
        it("Should Buy the tokens", async () => {
            // Add the Investor in to the whitelist
            const ltime = await latestTime();
            const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
                account_investor1.address,
                ltime,
                ltime,
                ltime + (duration.days(10)),
                {
                    gasLimit: 6000000
                }
            );
            
            const receipt = await tx.wait();
            let GeneralTransferManagerEvent: LogDescription | null = null;

            // Updated event parsing for ethers v6
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_GeneralTransferManager.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModifyKYCData") {
                        GeneralTransferManagerEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
            
            expect(GeneralTransferManagerEvent).to.not.be.null;
            expect(GeneralTransferManagerEvent!.args._investor.toLowerCase()).to.equal(
                account_investor1.address.toLowerCase(),
                "Failed in adding the investor in whitelist"
            );

            // Mint some tokens - Fixed: use "0x" instead of "0x0"
            await I_SecurityToken.connect(token_owner).issue(
                account_investor1.address, 
                ethers.parseEther("10"), 
                "0x"
            );

            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("10"));
        });

        it("Should Buy some more tokens", async () => {
            // Add the Investor in to the whitelist
            const ltime = await latestTime();
            const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
                account_investor2.address,
                ltime,
                ltime,
                ltime + (duration.days(10)),
                {
                    gasLimit: 6000000
                }
            );

            const receipt = await tx.wait();
            let GeneralTransferManagerEvent: LogDescription | null = null;

            // Fixed event parsing
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_GeneralTransferManager.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModifyKYCData") {
                        GeneralTransferManagerEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }

            expect(GeneralTransferManagerEvent).to.not.be.null;
            expect(GeneralTransferManagerEvent!.args._investor.toLowerCase()).to.equal(
                account_investor2.address.toLowerCase(),
                "Failed in adding the investor in whitelist"
            );

            // Mint some tokens - Fixed: use "0x" instead of "0x0"
            await I_SecurityToken.connect(token_owner).issue(
                account_investor2.address, 
                ethers.parseEther("10"), 
                "0x"
            );

            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("10"));
        });

        it("Add a new token holder", async () => {
            const ltime = (await latestTime());
            const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
                account_investor3.address,
                ltime,
                ltime,
                ltime + ((duration.days(10))),
                {
                    gasLimit: 6000000
                }
            );

            const receipt = await tx.wait();
            let GeneralTransferManagerEvent: LogDescription | null = null;

            // Fixed event parsing
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_GeneralTransferManager.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModifyKYCData") {
                        GeneralTransferManagerEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }

            expect(GeneralTransferManagerEvent).to.not.be.null;
            expect(GeneralTransferManagerEvent!.args._investor.toLowerCase()).to.equal(
                account_investor3.address.toLowerCase(),
                "Failed in adding the investor in whitelist"
            );

            // Mint some tokens - Fixed: use "0x" instead of "0x0"
            await I_SecurityToken.connect(token_owner).issue(
                account_investor3.address, 
                ethers.parseEther("10"), 
                "0x"
            );

            expect(await I_SecurityToken.balanceOf(account_investor3.address)).to.equal(ethers.parseEther("10"));
        });

        it("Fuzz test balance checkpoints", async () => {
            await I_SecurityToken.connect(token_owner).changeGranularity(1);
            const cps: bigint[][] = [];
            const ts: bigint[] = [];
            
            for (let j = 0; j < 10; j++) {
                const balance1 = await I_SecurityToken.balanceOf(account_investor1.address);
                const balance2 = await I_SecurityToken.balanceOf(account_investor2.address);
                const balance3 = await I_SecurityToken.balanceOf(account_investor3.address);
                const totalSupply = await I_SecurityToken.totalSupply();
                
                cps.push([balance1, balance2, balance3]);
                ts.push(totalSupply);
                
                // Fixed: Convert BigInt to string for JSON.stringify
                console.log(
                    "Checkpoint: " +
                        (j + 1) +
                        " Balances: " +
                        JSON.stringify(cps[cps.length - 1].map(b => b.toString())) +
                        " TotalSupply: " +
                        totalSupply.toString()
                );
                
                const investorLength = await stGetter.getInvestorCount();
                const tx = await I_SecurityToken.connect(token_owner).createCheckpoint();
                const receipt = await tx.wait();
                
                // Fixed event parsing for ethers v6
                let checkpointEvent: LogDescription | null = null;
                for (const log of receipt!.logs) {
                    try {
                        const parsed = I_SecurityToken.interface.parseLog(log);
                        
                        if (parsed && parsed.name === "CheckpointCreated") {
                            checkpointEvent = parsed;
                            break;
                        }
                    } catch (err: any) {
                        console.log(`Failed to parse checkpoint event: ${err.message}`);
                    }
                }
                
                expect(checkpointEvent).to.not.be.null;
                expect(checkpointEvent!.args[1]).to.equal(investorLength);
                
                const checkpointTimes: bigint[] = await stGetter.getCheckpointTimes();
                expect(checkpointTimes.length).to.equal(j + 1);
                console.log("Checkpoint Times: " + checkpointTimes.map(t => t.toString()));
                
                const txs = Math.floor(Math.random() * 3);
                for (let i = 0; i < txs; i++) {
                    let sender: HardhatEthersSigner;
                    let receiver: HardhatEthersSigner;
                    const s = Math.random() * 3;
                    if (s < 1) {
                        sender = account_investor1;
                    } else if (s < 2) {
                        sender = account_investor2;
                    } else {
                        sender = account_investor3;
                    }
                    const r = Math.random() * 3;
                    if (r < 1) {
                        receiver = account_investor1;
                    } else if (r < 2) {
                        receiver = account_investor2;
                    } else {
                        receiver = account_investor3;
                    }
                    const m = Math.floor(Math.random() * 10) + 1;
                    let amount: bigint;
                    if (m > 8) {
                        console.log("Sending full balance");
                        amount = await I_SecurityToken.balanceOf(sender.address);
                    } else {
                        const senderBalance = await I_SecurityToken.balanceOf(sender.address);
                        // Fixed: Use proper BigInt arithmetic
                        amount = (senderBalance * BigInt(m)) / BigInt(10);
                    }
                    console.log("Sender: " + sender.address + " Receiver: " + receiver.address + " Amount: " + amount.toString());
                    await I_SecurityToken.connect(sender).transfer(receiver.address, amount);
                }
                
                if (Math.random() > 0.5) {
                    const n = BigInt(Math.floor(Math.random() * 1000000000000000000));
                    const r = Math.random() * 3;
                    let minter: HardhatEthersSigner;
                    if (r < 1) {
                        minter = account_investor1;
                    } else if (r < 2) {
                        minter = account_investor2;
                    } else {
                        minter = account_investor3;
                    }
                    console.log("Minting: " + n.toString() + " to: " + minter.address);
                    await I_SecurityToken.connect(token_owner).issue(minter.address, n, "0x");
                }
                
                if (Math.random() > 0.5) {
                    let n = BigInt(Math.floor(Math.random() * 1000000000000000000));
                    const r = Math.random() * 3;
                    let burner: HardhatEthersSigner;
                    if (r < 1) {
                        burner = account_investor1;
                    } else if (r < 2) {
                        burner = account_investor2;
                    } else {
                        burner = account_investor3;
                    }
                    const burnerBalance = await I_SecurityToken.balanceOf(burner.address);
                    if (n > (burnerBalance / BigInt(2))) {
                        n = burnerBalance / BigInt(2);
                    }
                    console.log("Burning: " + n.toString() + " from: " + burner.address);
                    await I_SecurityToken.connect(account_controller).controllerRedeem(burner.address, n, "0x", "0x");
                }
                
                console.log("Checking Interim...");
                for (let k = 0; k < cps.length; k++) {
                    const balance1 = await stGetter.balanceOfAt(account_investor1.address, k + 1);
                    const balance2 = await stGetter.balanceOfAt(account_investor2.address, k + 1);
                    const balance3 = await stGetter.balanceOfAt(account_investor3.address, k + 1);
                    const totalSupply = await stGetter.totalSupplyAt(k + 1);
                    const balances: bigint[] = [balance1, balance2, balance3];
                    
                    console.log("Checking TotalSupply: " + totalSupply.toString() + " is " + ts[k].toString() + " at checkpoint: " + (k + 1));
                    expect(totalSupply).to.equal(ts[k]);
                    console.log("Checking Balances: " + balances.map(b => b.toString()) + " is " + cps[k].map(b => b.toString()) + " at checkpoint: " + (k + 1));
                    
                    for (let l = 0; l < cps[k].length; l++) {
                        expect(balances[l]).to.equal(cps[k][l]);
                    }
                }
            }
            
            console.log("Checking...");
            for (let k = 0; k < cps.length; k++) {
                const balance1 = await stGetter.balanceOfAt(account_investor1.address, k + 1);
                const balance2 = await stGetter.balanceOfAt(account_investor2.address, k + 1);
                const balance3 = await stGetter.balanceOfAt(account_investor3.address, k + 1);
                const totalSupply = await stGetter.totalSupplyAt(k + 1);
                const balances: bigint[] = [balance1, balance2, balance3];
                
                console.log("Checking TotalSupply: " + totalSupply.toString() + " is " + ts[k].toString() + " at checkpoint: " + (k + 1));
                expect(totalSupply).to.equal(ts[k]);
                console.log("Checking Balances: " + balances.map(b => b.toString()) + " is " + cps[k].map(b => b.toString()) + " at checkpoint: " + (k + 1));
                
                for (let l = 0; l < cps[k].length; l++) {
                    expect(balances[l]).to.equal(cps[k][l]);
                }
            }
        });
    });
});