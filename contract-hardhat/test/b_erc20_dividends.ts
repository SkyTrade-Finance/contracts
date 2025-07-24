import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { setUpPolymathNetwork, deployERC20DividendAndVerifyed, deployGPMAndVerifyed } from "./helpers/createInstances";
import Web3 from "web3";
import { increaseTime, revertToSnapshot, takeSnapshot } from "./helpers/time";
import { encodeModuleCall, encodeProxyCall } from "./helpers/encodeCall";

describe("ERC20DividendCheckpoint", function() {

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
    let I_ERC20DividendCheckpointFactory: any;
    let P_ERC20DividendCheckpointFactory: any;
    let P_ERC20DividendCheckpoint: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralPermissionManagerFactory: any;
    let I_ERC20DividendCheckpoint: any;
    let I_GeneralTransferManager: any;
    let I_ExchangeTransferManager: any;
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
    let ERC20DividendCheckpointFactory: any;

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
        ERC20DividendCheckpointFactory = await ethers.getContractFactory("ERC20DividendCheckpoint");

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

        console.log("=== DEBUG INFO ===");
        console.log("I_STRProxied address:", await I_STRProxied.getAddress());
        console.log("I_STRProxied constructor name:", I_STRProxied.constructor.name);
        console.log("Available functions:", Object.getOwnPropertyNames(I_STRProxied).filter(name => typeof I_STRProxied[name] === 'function'));
        console.log("Has registerNewTicker:", typeof I_STRProxied.registerNewTicker);

        // Deploy ERC20DividendCheckpoint factories
        [P_ERC20DividendCheckpointFactory] = await deployERC20DividendAndVerifyed(
            account_polymath.address,
            I_MRProxied,
            ethers.parseEther("500")
        );
        
        [I_ERC20DividendCheckpointFactory] = await deployERC20DividendAndVerifyed(
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
        ERC20DividendCheckpointFactory:    ${I_ERC20DividendCheckpointFactory.target}
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

        it("Should initialize the auto attached modules", async () => {
            const moduleData = await stGetter.getModulesByType(transferManagerKey);
            I_GeneralTransferManager = await ethers.getContractAt("GeneralTransferManager", moduleData[0]);
            expect(await I_GeneralTransferManager.getAddress()).to.equal(moduleData[0]);
        });

        it("Should successfully attach the ERC20DividendCheckpoint with the security token - fail insufficient payment", async () => {
            const bytesDividend = encodeModuleCall(DividendParameters, [wallet.address]);
            await expect(
                I_SecurityToken.connect(token_owner).addModule(
                    P_ERC20DividendCheckpointFactory.target,
                    bytesDividend,
                    ethers.parseEther("2000"),
                    0n,
                    false
                )
            ).to.be.reverted;
        });

        it("Should successfully attach the ERC20DividendCheckpoint with the security token with budget", async () => {
            const snapId = await takeSnapshot();
            try {
                await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("2000"), token_owner.address);
                await I_PolyToken.connect(token_owner).transfer(I_SecurityToken.target, ethers.parseEther("2000"));

                const bytesDividend = encodeModuleCall(DividendParameters, [wallet.address]);
                const tx = await I_SecurityToken.connect(token_owner).addModule(
                    P_ERC20DividendCheckpointFactory.target,
                    bytesDividend,
                    ethers.parseEther("2000"),
                    0n,
                    false
                );

                const receipt = await tx.wait();
                const moduleAddedEvent = receipt!.logs
                    .map(log => {
                        try {
                            return I_SecurityToken.interface.parseLog(log);
                        } catch {
                            return null;
                        }
                    })
                    .find(parsed => parsed && parsed.name === "ModuleAdded");

                expect(moduleAddedEvent).to.not.be.null;
                expect(moduleAddedEvent!.args._types[0]).to.equal(checkpointKey);
                const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
                expect(moduleName).to.equal("ERC20DividendCheckpoint");

                P_ERC20DividendCheckpoint = await ethers.getContractAt("ERC20DividendCheckpoint", moduleAddedEvent!.args._module);
            } finally {
                await revertToSnapshot(snapId);
            }
        });

        it("Should successfully attach the ERC20DividendCheckpoint with the security token", async () => {
            const bytesDividend = encodeModuleCall(DividendParameters, [address_zero]);
            const tx = await I_SecurityToken.connect(token_owner).addModule(
                I_ERC20DividendCheckpointFactory.target,
                bytesDividend,
                0n,
                0n,
                false
            );

            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs
                .map(log => {
                    try {
                        return I_SecurityToken.interface.parseLog(log);
                    } catch {
                        return null;
                    }
                })
                .find(parsed => parsed && parsed.name === "ModuleAdded");

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(checkpointKey);
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            expect(moduleName).to.equal("ERC20DividendCheckpoint");

            I_ERC20DividendCheckpoint = await ethers.getContractAt("ERC20DividendCheckpoint", moduleAddedEvent!.args._module);
        });
    });

describe("Check Dividend payouts", async () => {
    it("Buy some tokens for account_investor1 (1 ETH)", async () => {
        const fromTime = BigInt(await latestTime());
        const toTime = fromTime + BigInt(duration.days(30));
        const tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCData(
            account_investor1.address,
            fromTime,
            fromTime,
            toTime
        );
        await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData");

        await increaseTime(5000);
        await I_SecurityToken.connect(token_owner).issue(account_investor1.address, ethers.parseEther("1"), ethers.ZeroHash);
        expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("1"));
    });

    it("Buy some tokens for account_investor2 (2 ETH)", async () => {
        const fromTime = BigInt(await latestTime());
        const toTime = fromTime + BigInt(duration.days(30));
        const tx = await I_GeneralTransferManager.connect(token_owner).modifyKYCData(
            account_investor2.address,
            fromTime,
            fromTime,
            toTime
        );
        await expect(tx).to.emit(I_GeneralTransferManager, "ModifyKYCData");

        await I_SecurityToken.connect(token_owner).issue(account_investor2.address, ethers.parseEther("2"), ethers.ZeroHash);
        expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("2"));
    });

    it("Should fail in creating the dividend - incorrect allowance", async () => {
        const maturity = await latestTime();
        const expiry = (await latestTime()) + duration.days(10);
        await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("1.5"), token_owner.address);
        await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("1.5"),
                dividendName
            )
        ).to.be.reverted;
    });

    it("Should fail in creating the dividend - maturity > expiry", async () => {
        const maturity = await latestTime();
        const expiry = (await latestTime()) - duration.days(10);
        await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("1.5"));
        await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("1.5"),
                dividendName
            )
        ).to.be.reverted;
    });

    it("Should fail in creating the dividend - now > expiry", async () => {
        const maturity = (await latestTime()) - duration.days(2);
        const expiry = (await latestTime()) - duration.days(1);
        await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("1.5"),
                dividendName
            )
        ).to.be.reverted;
    });

    it("Should fail in creating the dividend - bad token", async () => {
        const maturity = await latestTime();
        const expiry = (await latestTime()) + duration.days(10);
        await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, address_zero, ethers.parseEther("1.5"), dividendName)
        ).to.be.reverted;
    });

    it("Should fail in creating the dividend - amount is 0", async () => {
        const maturity = await latestTime();
        const expiry = (await latestTime()) + duration.days(10);
        await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).createDividend(maturity, expiry, I_PolyToken.target, 0n, dividendName)
        ).to.be.reverted;
    });

    it("Create new dividend of POLY tokens", async () => {
        const maturity = (await latestTime()) + duration.days(1);
        const expiry = (await latestTime()) + duration.days(10);

        const tx = await I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("1.5"),
            dividendName
        );

        const data = await I_ERC20DividendCheckpoint.getDividendsData();
        expect(data[1][0]).to.equal(BigInt(maturity));
        expect(data[2][0]).to.equal(BigInt(expiry));
        expect(data[3][0]).to.equal(ethers.parseEther("1.5"));
        expect(data[4][0]).to.equal(0n);
        expect(data[5][0]).to.equal(dividendName);
    });

    it("Investor 1 transfers his token balance to investor 2", async () => {
        await I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, ethers.parseEther("1"));
        expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(0n);
        expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("3"));
    });

    it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails maturity in the future", async () => {
        await expect(I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(0, 0n, 10)).to.be.reverted;
    });

    it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails not owner", async () => {
        await increaseTime(duration.days(2));
        await expect(I_ERC20DividendCheckpoint.connect(account_temp).pushDividendPayment(0, 0n, 10)).to.be.reverted;
    });

    it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails wrong index", async () => {
        await expect(I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(2, 0n, 10)).to.be.reverted;
    });

    it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint", async () => {
        const investor1Balance = await I_PolyToken.balanceOf(account_investor1.address);
        const investor2Balance = await I_PolyToken.balanceOf(account_investor2.address);
        await I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(0, 0n, 10);
        const investor1BalanceAfter = await I_PolyToken.balanceOf(account_investor1.address);
        const investor2BalanceAfter = await I_PolyToken.balanceOf(account_investor2.address);
        expect(investor1BalanceAfter - investor1Balance).to.equal(ethers.parseEther("0.5"));
        expect(investor2BalanceAfter - investor2Balance).to.equal(ethers.parseEther("1"));

        const dividendData = await I_ERC20DividendCheckpoint.dividends(0);
        expect(dividendData.claimedAmount).to.equal(ethers.parseEther("1.5"));
    });

    it("Buy some tokens for account_temp (1 ETH)", async () => {
        const fromTime = BigInt(await latestTime());
        const toTime = fromTime + BigInt(duration.days(20));

        await I_GeneralTransferManager.connect(token_owner).modifyKYCData(
            account_temp.address,
            fromTime,
            fromTime,
            toTime
        );

        await I_SecurityToken.connect(token_owner).issue(account_temp.address, ethers.parseEther("1"), ethers.ZeroHash);
        expect(await I_SecurityToken.balanceOf(account_temp.address)).to.equal(ethers.parseEther("1"));
    });

it("Should not allow to create dividend without name", async () => {
    const maturity = (await latestTime()) + duration.days(1);
    const expiry = (await latestTime()) + duration.days(10);
    await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("1.5"), token_owner.address);
    await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("1.5"));
    await expect(
    I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
        maturity,
        expiry,
        I_PolyToken.target,
        ethers.parseEther("1.5"),
        ethers.ZeroHash
    )
    ).to.be.reverted;
});

it("Create new dividend", async () => {
    const maturity = (await latestTime()) + duration.days(1);
    const expiry = (await latestTime()) + duration.days(10);
    await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("1.5"), token_owner.address);
    // transfer approved in above test
    const tx = await I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
    maturity,
    expiry,
    I_PolyToken.target,
    ethers.parseEther("1.5"),
    dividendName
    );
    
    const receipt = await tx.wait();
    const dividendDepositedEvent = receipt!.logs
    .map(log => {
        try {
        return I_ERC20DividendCheckpoint.interface.parseLog(log);
        } catch {
        return null;
        }
    })
    .find(parsed => parsed && parsed.name === "ERC20DividendDeposited");

    expect(dividendDepositedEvent).to.not.be.null;
    expect(dividendDepositedEvent!.args._checkpointId).to.equal(2n);
});

it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails past expiry", async () => {
    await increaseTime(duration.days(12));
    await expect(I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(1, 0n, 10)).to.be.reverted;
});

it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails already reclaimed", async () => {
    await I_ERC20DividendCheckpoint.connect(token_owner).changeWallet(wallet.address);
    const tx = await I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(1);
    
    const receipt = await tx.wait();
    const dividendReclaimedEvent = receipt!.logs
    .map(log => {
        try {
        return I_ERC20DividendCheckpoint.interface.parseLog(log);
        } catch {
        return null;
        }
    })
    .find(parsed => parsed && parsed.name === "ERC20DividendReclaimed");

    expect(dividendReclaimedEvent).to.not.be.null;
    expect(dividendReclaimedEvent!.args._claimedAmount).to.equal(ethers.parseEther("1.5"));
    
    await expect(I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(1)).to.be.reverted;
});

it("Buy some tokens for account_investor3 (7 ETH)", async () => {
    const fromTime = BigInt(await latestTime());
    const toTime = fromTime + BigInt(duration.days(100000));

    const tx = await I_GeneralTransferManager.connect(account_issuer).modifyKYCData(
    account_investor3.address,
    fromTime,
    fromTime,
    toTime
    );

    const receipt = await tx.wait();
    const modifyKYCDataEvent = receipt!.logs
    .map(log => {
        try {
        return I_GeneralTransferManager.interface.parseLog(log);
        } catch {
        return null;
        }
    })
    .find(parsed => parsed && parsed.name === "ModifyKYCData");

    expect(modifyKYCDataEvent).to.not.be.null;
    expect(modifyKYCDataEvent!.args._investor.toLowerCase()).to.equal(account_investor3.address.toLowerCase());

    // Mint some tokens
    await I_SecurityToken.connect(token_owner).issue(account_investor3.address, ethers.parseEther("7"), ethers.ZeroHash);

    expect(await I_SecurityToken.balanceOf(account_investor3.address)).to.equal(ethers.parseEther("7"));
});

it("Should allow to exclude same number of address as EXCLUDED_ADDRESS_LIMIT", async () => {
    const limit = await I_ERC20DividendCheckpoint.EXCLUDED_ADDRESS_LIMIT();
    let addresses = [];
    addresses.push(account_temp.address);
    for (let i = 0; i < Number(limit) - 1; i++) {
    // Generate unique dummy addresses
    addresses.push(ethers.getAddress(`0x${(i + 1).toString().padStart(40, '0')}`));
    }
    await I_ERC20DividendCheckpoint.connect(token_owner).setDefaultExcluded(addresses);
    const excluded = await I_ERC20DividendCheckpoint.getDefaultExcluded();
    expect(excluded[0]).to.equal(account_temp.address);
});

it("Should not allow to exclude duplicate address", async () => {
    let addresses = [];
    addresses.push(account_investor3.address);
    addresses.push(account_investor3.address);
    await expect(I_ERC20DividendCheckpoint.connect(token_owner).setDefaultExcluded(addresses)).to.be.reverted;
});

it("Should not allow to exclude 0x0 address", async () => {
    let addresses = [];
    addresses.push(account_investor3.address);
    addresses.push(address_zero);
    await expect(I_ERC20DividendCheckpoint.connect(token_owner).setDefaultExcluded(addresses)).to.be.reverted;
});

it("Exclude account_temp using global exclusion list", async () => {
    await I_ERC20DividendCheckpoint.connect(token_owner).setDefaultExcluded([account_temp.address]);
    const excluded = await I_ERC20DividendCheckpoint.getDefaultExcluded();
    expect(excluded[0]).to.equal(account_temp.address);
});

it("Should not allow to exclude more address than EXCLUDED_ADDRESS_LIMIT", async () => {
    const limit = await I_ERC20DividendCheckpoint.EXCLUDED_ADDRESS_LIMIT();
    let addresses = [];
    for (let i = 0; i < Number(limit) + 1; i++) {
    // Generate unique dummy addresses
    addresses.push(ethers.getAddress(`0x${(i + 1).toString().padStart(40, '0')}`));
    }
    await expect(I_ERC20DividendCheckpoint.connect(token_owner).setDefaultExcluded(addresses)).to.be.reverted;
});

it("Create another new dividend", async () => {
    const maturity = await latestTime();
    const expiry = (await latestTime()) + duration.days(10);
    await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("11"), token_owner.address);
    await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("11"));
    const tx = await I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
    maturity,
    expiry,
    I_PolyToken.target,
    ethers.parseEther("10"),
    dividendName
    );
    
    const receipt = await tx.wait();
    const dividendDepositedEvent = receipt!.logs
    .map(log => {
        try {
        return I_ERC20DividendCheckpoint.interface.parseLog(log);
        } catch {
        return null;
        }
    })
    .find(parsed => parsed && parsed.name === "ERC20DividendDeposited");

    expect(dividendDepositedEvent).to.not.be.null;
    expect(dividendDepositedEvent!.args._checkpointId).to.equal(3n);
    expect(await I_ERC20DividendCheckpoint.isExcluded(account_temp.address, dividendDepositedEvent!.args._dividendIndex)).to.be.true;
});

it("should investor 3 claims dividend - fail bad index", async () => {
    await expect(I_ERC20DividendCheckpoint.connect(account_investor3).pullDividendPayment(5)).to.be.reverted;
});

it("should investor 3 claims dividend", async () => {
    const investor1Balance = await I_PolyToken.balanceOf(account_investor1.address);
    const investor2Balance = await I_PolyToken.balanceOf(account_investor2.address);
    const investor3Balance = await I_PolyToken.balanceOf(account_investor3.address);
    
    await I_ERC20DividendCheckpoint.connect(account_investor3).pullDividendPayment(2);
    
    const investor1BalanceAfter = await I_PolyToken.balanceOf(account_investor1.address);
    const investor2BalanceAfter = await I_PolyToken.balanceOf(account_investor2.address);
    const investor3BalanceAfter = await I_PolyToken.balanceOf(account_investor3.address);
    
    expect(investor1BalanceAfter - investor1Balance).to.equal(0n);
    expect(investor2BalanceAfter - investor2Balance).to.equal(0n);
    expect(investor3BalanceAfter - investor3Balance).to.equal(ethers.parseEther("7"));
    
    const info = await I_ERC20DividendCheckpoint.getDividendProgress(2);
    
    // Find the index for account_temp and account_investor3
    const tempIndex = info[0].findIndex((addr: string) => addr === account_temp.address);
    const investor3Index = info[0].findIndex((addr: string) => addr === account_investor3.address);

    expect(tempIndex).to.not.equal(-1);
    expect(investor3Index).to.not.equal(-1);

    expect(info[0][tempIndex]).to.equal(account_temp.address); // address
    expect(info[1][tempIndex]).to.be.false; // claimed
    expect(info[2][tempIndex]).to.be.true; // excluded
    expect(info[3][tempIndex]).to.equal(0n); // withheld

    expect(info[0][investor3Index]).to.equal(account_investor3.address); // address
    expect(info[1][investor3Index]).to.be.true; // claimed
    expect(info[2][investor3Index]).to.be.false; // excluded
    expect(info[3][investor3Index]).to.equal(0n); // withheld
});

it("should investor 3 claims dividend - fails already claimed", async () => {
    await expect(I_ERC20DividendCheckpoint.connect(account_investor3).pullDividendPayment(2)).to.be.reverted;
});

it("should issuer pushes remain", async () => {
    const investor1BalanceAfter1 = await I_PolyToken.balanceOf(account_investor1.address);
    const investor2BalanceAfter1 = await I_PolyToken.balanceOf(account_investor2.address);
    const investor3BalanceAfter1 = await I_PolyToken.balanceOf(account_investor3.address);
    const investorTempBalanceAfter1 = await I_PolyToken.balanceOf(account_temp.address);

    await I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(2, 0n, 10);

    const investor1BalanceAfter2 = await I_PolyToken.balanceOf(account_investor1.address);
    const investor2BalanceAfter2 = await I_PolyToken.balanceOf(account_investor2.address);
    const investor3BalanceAfter2 = await I_PolyToken.balanceOf(account_investor3.address);
    const investorTempBalanceAfter2 = await I_PolyToken.balanceOf(account_temp.address);

    expect(investor1BalanceAfter2 - investor1BalanceAfter1).to.equal(0n);
    expect(investor2BalanceAfter2 - investor2BalanceAfter1).to.equal(ethers.parseEther("3"));
    expect(investor3BalanceAfter2 - investor3BalanceAfter1).to.equal(0n);
    expect(investorTempBalanceAfter2 - investorTempBalanceAfter1).to.equal(0n);

    //Check fully claimed
    const dividendData = await I_ERC20DividendCheckpoint.dividends(2);
    expect(dividendData.claimedAmount).to.equal(ethers.parseEther("10"));
});

it("Delete global exclusion list", async () => {
    await I_ERC20DividendCheckpoint.connect(token_owner).setDefaultExcluded([]);
    const excluded = await I_ERC20DividendCheckpoint.getDefaultExcluded();
    expect(excluded.length).to.equal(0);
});

it("Investor 2 transfers 1 ETH of his token balance to investor 1", async () => {
    await I_SecurityToken.connect(account_investor2).transfer(account_investor1.address, ethers.parseEther("1"));
    expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(ethers.parseEther("1"));
    expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(ethers.parseEther("2"));
    expect(await I_SecurityToken.balanceOf(account_investor3.address)).to.equal(ethers.parseEther("7"));
    expect(await I_SecurityToken.balanceOf(account_temp.address)).to.equal(ethers.parseEther("1"));
});

it("Create another new dividend with explicit checkpoint - fails bad allowance", async () => {
    const maturity = await latestTime();
    const expiry = (await latestTime()) + duration.days(2);
    const tx = await I_SecurityToken.connect(token_owner).createCheckpoint();
    const receipt = await tx.wait();
    const checkpointCreatedEvent = receipt!.logs
        .map(log => {
            try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
        })
        .find(parsed => parsed && parsed.name === "CheckpointCreated");
    expect(checkpointCreatedEvent).to.not.be.null;
    const checkpointId = checkpointCreatedEvent!.args._checkpointId;
    expect(checkpointId).to.equal(4n);

    await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("20"), token_owner.address);
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("20"),
            checkpointId,
            dividendName
        )
    ).to.be.reverted;
});

it("Create another new dividend with explicit - fails maturity > expiry", async () => {
    const maturity = await latestTime();
    const expiry = (await latestTime()) - duration.days(10);
    await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("20"));
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("20"),
            4,
            dividendName
        )
    ).to.be.reverted;
});

it("Create another new dividend with explicit - fails now > expiry", async () => {
    const maturity = (await latestTime()) - duration.days(5);
    const expiry = (await latestTime()) - duration.days(2);
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("20"),
            4,
            dividendName
        )
    ).to.be.reverted;
});

it("Create another new dividend with explicit - fails bad checkpoint", async () => {
    const maturity = await latestTime();
    const expiry = (await latestTime()) + duration.days(2);
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpoint(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("20"),
            5, // Non-existent checkpoint
            dividendName
        )
    ).to.be.reverted;
});

it("Set withholding tax of 20% on account_temp and 100% on investor2", async () => {
    const withholdingRates = [
        BigInt(20 * 10 ** 16), // 20%
        BigInt(100 * 10 ** 16) // 100%
    ];
    await I_ERC20DividendCheckpoint.connect(token_owner).setWithholding(
        [account_temp.address, account_investor2.address],
        withholdingRates
    );
    // const tempWithholding = await I_ERC20DividendCheckpoint.withholding(account_temp.address);
    // const investor2Withholding = await I_ERC20DividendCheckpoint.withholding(account_investor2.address);
    // expect(tempWithholding).to.equal(withholdingRates[0]);
    // expect(investor2Withholding).to.equal(withholdingRates[1]);
});

it("Should not allow mismatching input lengths", async () => {
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).setWithholding(
            [account_temp.address],
            [BigInt(20 * 10 ** 16), BigInt(10 * 10 ** 16)]
        )
    ).to.be.reverted;
});

it("Should not allow withholding greater than limit", async () => {
    const highWithholding = BigInt(20) * BigInt(10) ** BigInt(26);
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).setWithholding([account_temp.address], [highWithholding])
    ).to.be.reverted;
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).setWithholdingFixed([account_temp.address], highWithholding)
    ).to.be.reverted;
});

it("Should not create dividend with more exclusions than limit", async () => {
    const maturity = await latestTime();
    const expiry = (await latestTime()) + duration.days(10);
    await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("11"), token_owner.address);
    await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("11"));
    const limit = await I_ERC20DividendCheckpoint.EXCLUDED_ADDRESS_LIMIT();
    let addresses = [];
    for (let i = 0; i < Number(limit) + 1; i++) {
        // Generate unique dummy addresses
        addresses.push(ethers.getAddress(`0x${(i + 1).toString().padStart(40, '0')}`));
    }
    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("10"),
            4,
            addresses,
            dividendName
        )
    ).to.be.reverted;
});

it("Create another new dividend with explicit checkpoint and exclusion", async () => {
    const maturity = await latestTime();
    const expiry = (await latestTime()) + duration.days(10);
    await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("11"), token_owner.address);
    await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("11"));

    const tx = await I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(
        maturity,
        expiry,
        I_PolyToken.target,
        ethers.parseEther("10"),
        4,
        [account_investor1.address],
        dividendName
    );
    
    const receipt = await tx.wait();
    const dividendDepositedEvent = receipt!.logs
        .map(log => { try { return I_ERC20DividendCheckpoint.interface.parseLog(log); } catch { return null; } })
        .find(parsed => parsed && parsed.name === "ERC20DividendDeposited");

    expect(dividendDepositedEvent).to.not.be.null;
    expect(dividendDepositedEvent!.args._checkpointId).to.equal(4n);
});

it("Should not create new dividend with duplicate exclusion", async () => {
    const maturity = await latestTime();
    const expiry = (await latestTime()) + duration.days(10);
    await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("11"), token_owner.address);
    await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("11"));

    await expect(
        I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("10"),
            4,
            [account_investor1.address, account_investor1.address],
            dividendName
        )
    ).to.be.reverted;
});

        it("Should not create new dividend with 0x0 address in exclusion", async () => {
            const maturity = await latestTime();
            const expiry = (await latestTime()) + duration.days(10);
            await I_PolyToken.connect(token_owner).getTokens(ethers.parseEther("11"), token_owner.address);
            //token transfer approved in above test
            await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).createDividendWithCheckpointAndExclusions(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("10"),
                4,
                [address_zero],
                dividendName
            )
            ).to.be.reverted;
        });

        it("Should not allow excluded to pull Dividend Payment", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_investor1).pullDividendPayment(3)).to.be.reverted;
        });

        it("Investor 2 claims dividend, issuer pushes investor 1 - fails not owner", async () => {
            await expect(
            I_ERC20DividendCheckpoint.connect(account_investor2).pushDividendPaymentToAddresses(2, [
                account_investor2.address,
                account_investor1.address
            ])
            ).to.be.reverted;
        });

        it("Investor 2 claims dividend, issuer pushes investor 1 - fails bad index", async () => {
            await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPaymentToAddresses(5, [
                account_investor2.address,
                account_investor1.address
            ])
            ).to.be.reverted;
        });

        it("should not calculate dividend for invalid index", async () => {
            await expect(I_ERC20DividendCheckpoint.calculateDividend(5, account_investor1.address)).to.be.reverted;
        });

        it("should calculate dividend before the push dividend payment", async () => {
            const dividendAmount1 = await I_ERC20DividendCheckpoint.calculateDividend(3, account_investor1.address);
            const dividendAmount2 = await I_ERC20DividendCheckpoint.calculateDividend(3, account_investor2.address);
            const dividendAmount3 = await I_ERC20DividendCheckpoint.calculateDividend(3, account_investor3.address);
            const dividendAmount_temp = await I_ERC20DividendCheckpoint.calculateDividend(3, account_temp.address);
            expect(dividendAmount1[0]).to.equal(ethers.parseEther("0"));
            expect(dividendAmount2[0]).to.equal(ethers.parseEther("2"));
            expect(dividendAmount3[0]).to.equal(ethers.parseEther("7"));
            expect(dividendAmount_temp[0]).to.equal(ethers.parseEther("1"));
            expect(dividendAmount1[1]).to.equal(ethers.parseEther("0"));
            expect(dividendAmount2[1]).to.equal(ethers.parseEther("2"));
            expect(dividendAmount3[1]).to.equal(ethers.parseEther("0"));
            expect(dividendAmount_temp[1]).to.equal(ethers.parseEther("0.2"));
        });

        it("Pause and unpause the dividend contract", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_polymath).pause()).to.be.reverted;
            await I_ERC20DividendCheckpoint.connect(token_owner).pause();
            await expect(I_ERC20DividendCheckpoint.connect(account_investor2).pullDividendPayment(3)).to.be.reverted;
            await expect(I_ERC20DividendCheckpoint.connect(account_polymath).unpause()).to.be.reverted;
            await I_ERC20DividendCheckpoint.connect(token_owner).unpause();
        });

        it("Investor 2 claims dividend", async () => {
            const investor1Balance = await I_PolyToken.balanceOf(account_investor1.address);
            const investor2Balance = await I_PolyToken.balanceOf(account_investor2.address);
            const investor3Balance = await I_PolyToken.balanceOf(account_investor3.address);
            const tempBalance = await ethers.provider.getBalance(account_temp.address);

            const tx = await I_ERC20DividendCheckpoint.connect(account_investor2).pullDividendPayment(3);
            const receipt = await tx.wait();

            const investor1BalanceAfter1 = await I_PolyToken.balanceOf(account_investor1.address);
            const investor2BalanceAfter1 = await I_PolyToken.balanceOf(account_investor2.address);
            const investor3BalanceAfter1 = await I_PolyToken.balanceOf(account_investor3.address);
            const tempBalanceAfter1 = await ethers.provider.getBalance(account_temp.address);

            expect(investor1BalanceAfter1 - investor1Balance).to.equal(0n);
            // Full amount is in withheld tax
            expect(investor2BalanceAfter1 - investor2Balance).to.equal(0n);
            expect(investor3BalanceAfter1 - investor3Balance).to.equal(0n);
            expect(tempBalanceAfter1 - tempBalance).to.equal(0n);

            //Check tx contains event...
            const dividendClaimedEvent = receipt!.logs
            .map(log => {
                try {
                return I_ERC20DividendCheckpoint.interface.parseLog(log);
                } catch {
                return null;
                }
            })
            .find(parsed => parsed && parsed.name === "ERC20DividendClaimed");

            expect(dividendClaimedEvent).to.not.be.null;
            expect(dividendClaimedEvent!.args._payee).to.equal(account_investor2.address);
            expect(dividendClaimedEvent!.args._withheld).to.equal(ethers.parseEther("2"));
            expect(dividendClaimedEvent!.args._amount).to.equal(ethers.parseEther("2"));
        });

        it("Should issuer pushes temp investor - investor1 excluded", async () => {
            const investor1BalanceAfter1 = await I_PolyToken.balanceOf(account_investor1.address);
            const investor2BalanceAfter1 = await I_PolyToken.balanceOf(account_investor2.address);
            const investor3BalanceAfter1 = await I_PolyToken.balanceOf(account_investor3.address);
            const tempBalanceAfter1 = await I_PolyToken.balanceOf(account_temp.address);
            // Issuer can still push payments when contract is paused
            await I_ERC20DividendCheckpoint.connect(token_owner).pause();
            await I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPaymentToAddresses(3, [
            account_temp.address,
            account_investor1.address
            ]);
            await I_ERC20DividendCheckpoint.connect(token_owner).unpause();
            const investor1BalanceAfter2 = await I_PolyToken.balanceOf(account_investor1.address);
            const investor2BalanceAfter2 = await I_PolyToken.balanceOf(account_investor2.address);
            const investor3BalanceAfter2 = await I_PolyToken.balanceOf(account_investor3.address);
            const tempBalanceAfter2 = await I_PolyToken.balanceOf(account_temp.address);
            expect(investor1BalanceAfter2 - investor1BalanceAfter1).to.equal(0n);
            expect(investor2BalanceAfter2 - investor2BalanceAfter1).to.equal(0n);
            expect(investor3BalanceAfter2 - investor3BalanceAfter1).to.equal(0n);
            expect(tempBalanceAfter2 - tempBalanceAfter1).to.equal(ethers.parseEther("0.8"));
            //Check fully claimed
            const dividendData = await I_ERC20DividendCheckpoint.dividends(3);
            expect(dividendData.claimedAmount).to.equal(ethers.parseEther("3"));
        });

        it("should calculate dividend after the push dividend payment", async () => {
            const dividendAmount1 = await I_ERC20DividendCheckpoint.calculateDividend(3, account_investor1.address);
            const dividendAmount2 = await I_ERC20DividendCheckpoint.calculateDividend(3, account_investor2.address);
            expect(dividendAmount1[0]).to.equal(0n);
            expect(dividendAmount2[0]).to.equal(0n);
        });

        it("Should not allow reclaiming withholding tax with incorrect index", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(token_owner).withdrawWithholding(300)).to.be.reverted;
        });

        it("Issuer reclaims withholding tax", async () => {
            const info = await I_ERC20DividendCheckpoint.getDividendProgress(3);

            console.log("Address:");
            console.log(info[0][0]);
            console.log(info[0][1]);
            console.log(info[0][2]);
            console.log(info[0][3]);

            console.log("Claimed:");
            console.log(info[1][0]);
            console.log(info[1][1]);
            console.log(info[1][2]);
            console.log(info[1][3]);

            console.log("Excluded:");
            console.log(info[2][0]);
            console.log(info[2][1]);
            console.log(info[2][2]);
            console.log(info[2][3]);

            console.log("Withheld:");
            console.log(info[3][0].toString());
            console.log(info[3][1].toString());
            console.log(info[3][2].toString());
            console.log(info[3][3].toString());

            console.log("Claimed:");
            console.log(info[4][0].toString());
            console.log(info[4][1].toString());
            console.log(info[4][2].toString());
            console.log(info[4][3].toString());

            console.log("Balance:");
            console.log(info[5][0].toString());
            console.log(info[5][1].toString());
            console.log(info[5][2].toString());
            console.log(info[5][3].toString());

            expect(info[0][0]).to.equal(account_investor1.address, "account match");
            expect(info[0][1]).to.equal(account_investor2.address, "account match");
            expect(info[0][2]).to.equal(account_temp.address, "account match");
            expect(info[0][3]).to.equal(account_investor3.address, "account match");

            expect(info[3][0]).to.equal(0n, "withheld match");
            expect(info[3][1]).to.equal(ethers.parseEther("2"), "withheld match");
            expect(info[3][2]).to.equal(ethers.parseEther("0.2"), "withheld match");
            expect(info[3][3]).to.equal(0n, "withheld match");

            expect(info[4][0]).to.equal(0n, "excluded");
            expect(info[4][1]).to.equal(ethers.parseEther("0"), "claim match");
            expect(info[4][2]).to.equal(ethers.parseEther("0.8"), "claim match");
            expect(info[4][3]).to.equal(ethers.parseEther("7"), "claim match");

            expect(info[5][0]).to.equal(await stGetter.balanceOfAt(account_investor1.address, 4), "balance match");
            expect(info[5][1]).to.equal(await stGetter.balanceOfAt(account_investor2.address, 4), "balance match");
            expect(info[5][2]).to.equal(await stGetter.balanceOfAt(account_temp.address, 4), "balance match");
            expect(info[5][3]).to.equal(await stGetter.balanceOfAt(account_investor3.address, 4), "balance match");

            let dividend = await I_ERC20DividendCheckpoint.dividends(3);
            console.log("totalWithheld: " + dividend[8].toString());
            console.log("totalWithheldWithdrawn: " + dividend[9].toString());
            expect(dividend.totalWithheld).to.equal(ethers.parseEther("2.2"));
            expect(dividend.totalWithheldWithdrawn).to.equal(0n);
            const issuerBalance = await I_PolyToken.balanceOf(wallet.address);
            await I_ERC20DividendCheckpoint.connect(token_owner).withdrawWithholding(3);
            const issuerBalanceAfter = await I_PolyToken.balanceOf(wallet.address);
            expect(issuerBalanceAfter - issuerBalance).to.equal(ethers.parseEther("2.2"));
            dividend = await I_ERC20DividendCheckpoint.dividends(3);
            console.log("totalWithheld: " + dividend.totalWithheld.toString());
            console.log("totalWithheldWithdrawn: " + dividend.totalWithheldWithdrawn.toString());
            expect(dividend.totalWithheld).to.equal(ethers.parseEther("2.2"));
            expect(dividend.totalWithheldWithdrawn).to.equal(ethers.parseEther("2.2"));
        });

        it("Issuer changes wallet address", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(wallet).changeWallet(token_owner.address)).to.be.reverted;
            await I_ERC20DividendCheckpoint.connect(token_owner).changeWallet(token_owner.address);
            const newWallet1 = await I_ERC20DividendCheckpoint.wallet();
            expect(newWallet1).to.equal(token_owner.address, "Wallets match");
            await I_ERC20DividendCheckpoint.connect(token_owner).changeWallet(wallet.address);
            const newWallet2 = await I_ERC20DividendCheckpoint.wallet();
            expect(newWallet2).to.equal(wallet.address, "Wallets match");
        });

        it("Issuer unable to reclaim dividend (expiry not passed)", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(3)).to.be.reverted;
        });

        it("Issuer is unable to reclaim invalid dividend", async () => {
            await increaseTime(11 * 24 * 60 * 60);
            await expect(I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(8)).to.be.reverted;
        });

        it("Investor 3 unable to pull dividend after expiry", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_investor3).pullDividendPayment(3)).to.be.reverted;
        });

        it("Issuer is able to reclaim dividend after expiry", async () => {
            const tokenOwnerBalance = await I_PolyToken.balanceOf(wallet.address);
            await I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(3);
            const tokenOwnerAfter = await I_PolyToken.balanceOf(wallet.address);
            expect(tokenOwnerAfter - tokenOwnerBalance).to.equal(ethers.parseEther("7"));
        });

        it("Issuer is unable to reclaim already reclaimed dividend", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(3)).to.be.reverted;
        });

        it("Investor 3 unable to pull dividend after reclaiming", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_investor3).pullDividendPayment(3)).to.be.reverted;
        });

        it("Should give the right dividend index", async () => {
            const index = await I_ERC20DividendCheckpoint.getDividendIndex(3);
            expect(index[0]).to.equal(2n);
        });

        it("Should give the right dividend index", async () => {
            const index = await I_ERC20DividendCheckpoint.getDividendIndex(8);
            expect(index.length).to.equal(0);
        });

        it("Should get the listed permissions", async () => {
            const tx = await I_ERC20DividendCheckpoint.getPermissions();
            expect(tx.length).to.equal(2);
        });

        it("should register a delegate", async () => {
            [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0n);
            const tx = await I_SecurityToken.connect(token_owner).addModule(I_GeneralPermissionManagerFactory.target, "0x", 0n, 0n, false);
            
            const receipt = await tx.wait();
            const moduleAddedEvent = receipt!.logs
            .map(log => { try { return I_SecurityToken.interface.parseLog(log); } catch { return null; } })
            .find(parsed => parsed && parsed.name === "ModuleAdded");

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(delegateManagerKey);
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            expect(moduleName).to.equal("GeneralPermissionManager");

            I_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);
            const delegateTx = await I_GeneralPermissionManager.connect(token_owner).addDelegate(account_manager.address, managerDetails);
            
            await expect(delegateTx)
            .to.emit(I_GeneralPermissionManager, "AddDelegate")
            .withArgs(account_manager.address, managerDetails);
        });

        it("should not allow manager without permission to set default excluded", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_manager).setDefaultExcluded([address_zero])).to.be.reverted;
        });

        it("should not allow manager without permission to set withholding", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_manager).setWithholding([address_zero], [0n])).to.be.reverted;
        });

        it("should not allow manager without permission to set withholding fixed", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_manager).setWithholdingFixed([address_zero], 0n)).to.be.reverted;
        });

        it("should not allow manager without permission to create dividend", async () => {
            await I_PolyToken.connect(token_owner).transfer(account_manager.address, ethers.parseEther("100"));
            await I_PolyToken.connect(account_manager).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("100"));
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);

            await expect(
            I_ERC20DividendCheckpoint.connect(account_manager).createDividend(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("1.5"),
                dividendName
            )
            ).to.be.reverted;
        });

        it("should not allow manager without permission to create dividend with checkpoint", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const checkpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            await expect(
            I_ERC20DividendCheckpoint.connect(account_manager).createDividendWithCheckpoint(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("1.5"),
                checkpointId,
                dividendName
            )
            ).to.be.reverted;
        });

        it("should not allow manager without permission to create dividend with exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [one_address];
            await expect(
            I_ERC20DividendCheckpoint.connect(account_manager).createDividendWithExclusions(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("1.5"),
                exclusions,
                dividendName
            )
            ).to.be.reverted;
        });

        it("should not allow manager without permission to create checkpoint", async () => {
            await expect(I_ERC20DividendCheckpoint.connect(account_manager).createCheckpoint()).to.be.reverted;
        });

        it("should not allow manager without permission to create dividend with checkpoint and exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [one_address];
            const checkpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            await expect(
            I_ERC20DividendCheckpoint.connect(account_manager).createDividendWithCheckpointAndExclusions(
                maturity,
                expiry,
                I_PolyToken.target,
                ethers.parseEther("1.5"),
                checkpointId,
                exclusions,
                dividendName
            )
            ).to.be.reverted;
        });

        it("should give permission to manager", async () => {
            await I_GeneralPermissionManager.connect(token_owner).changePermission(account_manager.address, I_ERC20DividendCheckpoint.target, ethers.encodeBytes32String("OPERATOR"), true);
            const tx = await I_GeneralPermissionManager.connect(token_owner).changePermission(account_manager.address, I_ERC20DividendCheckpoint.target, ethers.encodeBytes32String("ADMIN"), true);
            await expect(tx)
            .to.emit(I_GeneralPermissionManager, "ChangePermission")
            .withArgs(account_manager.address, I_ERC20DividendCheckpoint.target, ethers.encodeBytes32String("ADMIN"), true);
        });

        it("should allow manager with permission to set default excluded", async () => {
            const tx = await I_ERC20DividendCheckpoint.connect(account_manager).setDefaultExcluded([one_address]);
            await expect(tx).to.emit(I_ERC20DividendCheckpoint, "SetDefaultExcludedAddresses").withArgs([one_address]);
        });

        it("should allow manager with permission to set withholding", async () => {
            const tx = await I_ERC20DividendCheckpoint.connect(account_manager).setWithholding([one_address], [0n]);
            await expect(tx).to.emit(I_ERC20DividendCheckpoint, "SetWithholding").withArgs([one_address], [0n]);
        });

        it("should allow manager with permission to set withholding fixed", async () => {
            const tx = await I_ERC20DividendCheckpoint.connect(account_manager).setWithholdingFixed([one_address], 0n);
            await expect(tx).to.emit(I_ERC20DividendCheckpoint, "SetWithholdingFixed").withArgs([one_address], 0n);
        });

        it("should allow manager with permission to create dividend", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);

            const tx = await I_ERC20DividendCheckpoint.connect(account_manager).createDividend(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("1.5"),
            dividendName
            );
            
            const receipt = await tx.wait();
            const dividendDepositedEvent = receipt!.logs
            .map(log => { try { return I_ERC20DividendCheckpoint.interface.parseLog(log); } catch { return null; } })
            .find(parsed => parsed && parsed.name === "ERC20DividendDeposited");

            expect(dividendDepositedEvent).to.not.be.null;
            expect(dividendDepositedEvent!.args._name).to.equal(dividendName);
        });

        it("should allow manager with permission to create dividend with checkpoint", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const checkpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            const tx = await I_ERC20DividendCheckpoint.connect(account_manager).createDividendWithCheckpoint(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("1.5"),
            checkpointId,
            dividendName
            );
            const info = await I_ERC20DividendCheckpoint.getCheckpointData(checkpointId);

            expect(info[0][0]).to.equal(account_investor1.address, "account match");
            expect(info[0][1]).to.equal(account_investor2.address, "account match");
            expect(info[0][2]).to.equal(account_temp.address, "account match");
            expect(info[0][3]).to.equal(account_investor3.address, "account match");
            expect(info[1][0]).to.equal(await stGetter.balanceOfAt(account_investor1.address, checkpointId), "balance match");
            expect(info[1][1]).to.equal(await stGetter.balanceOfAt(account_investor2.address, checkpointId), "balance match");
            expect(info[1][2]).to.equal(await stGetter.balanceOfAt(account_temp.address, checkpointId), "balance match");
            expect(info[1][3]).to.equal(await stGetter.balanceOfAt(account_investor3.address, checkpointId), "balance match");
            expect(info[2][0]).to.equal(0n, "withholding match");
            expect(info[2][1]).to.equal(BigInt(100 * 10 ** 16), "withholding match");
            expect(info[2][2]).to.equal(BigInt(20 * 10 ** 16), "withholding match");
            expect(info[2][3]).to.equal(0n, "withholding match");
            
            const receipt = await tx.wait();
            const dividendDepositedEvent = receipt!.logs
            .map(log => { try { return I_ERC20DividendCheckpoint.interface.parseLog(log); } catch { return null; } })
            .find(parsed => parsed && parsed.name === "ERC20DividendDeposited");
            
            expect(dividendDepositedEvent!.args._checkpointId).to.equal(checkpointId);
        });

        it("should allow manager with permission to create dividend with exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [account_temp.address];
            const tx = await I_ERC20DividendCheckpoint.connect(account_manager).createDividendWithExclusions(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("1.5"),
            exclusions,
            dividendName
            );
            
            const receipt = await tx.wait();
            const dividendDepositedEvent = receipt!.logs
            .map(log => { try { return I_ERC20DividendCheckpoint.interface.parseLog(log); } catch { return null; } })
            .find(parsed => parsed && parsed.name === "ERC20DividendDeposited");

            expect(dividendDepositedEvent).to.not.be.null;
            expect(dividendDepositedEvent!.args._checkpointId).to.equal(9n);
            console.log("Gas used w/ max exclusions - non-default: " + receipt!.gasUsed.toString());
            const info = await I_ERC20DividendCheckpoint.getDividendProgress(dividendDepositedEvent!.args._dividendIndex);
            
            const tempIndex = info[0].findIndex((addr: string) => addr === account_temp.address);
            expect(tempIndex).to.not.equal(-1);
            expect(info[0][tempIndex]).to.equal(account_temp.address, "account_temp is in list");
            expect(info[2][tempIndex]).to.be.true;
        });

        it("should allow manager with permission to create dividend with checkpoint and exclusion", async () => {
            const maturity = (await latestTime()) + duration.days(1);
            const expiry = (await latestTime()) + duration.days(10);
            const exclusions = [one_address];
            const checkpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_SecurityToken.connect(token_owner).createCheckpoint();
            const tx = await I_ERC20DividendCheckpoint.connect(account_manager).createDividendWithCheckpointAndExclusions(
            maturity,
            expiry,
            I_PolyToken.target,
            ethers.parseEther("1.5"),
            checkpointId,
            exclusions,
            dividendName
            );
            
            const receipt = await tx.wait();
            const dividendDepositedEvent = receipt!.logs
            .map(log => { try { return I_ERC20DividendCheckpoint.interface.parseLog(log); } catch { return null; } })
            .find(parsed => parsed && parsed.name === "ERC20DividendDeposited");

            expect(dividendDepositedEvent).to.not.be.null;
            expect(dividendDepositedEvent!.args._checkpointId).to.equal(checkpointId);
            console.log(dividendDepositedEvent!.args._dividendIndex.toString());
        });

        it("Should fail to update the dividend dates because msg.sender is not authorised", async () => {
            await expect(
            I_ERC20DividendCheckpoint.connect(account_polymath).updateDividendDates(7, 0, 1)
            ).to.be.reverted;
        });

        it("Should fail to update the dates when the dividend get expired", async() => {
            const snapId = await takeSnapshot();
            await increaseTime(duration.days(11));
            await expect(
            I_ERC20DividendCheckpoint.connect(token_owner).updateDividendDates(7, 0, 1)
            ).to.be.reverted;
            await revertToSnapshot(snapId);
        });

        it("Should update the dividend dates", async() => {
            const newMaturity = (await latestTime()) - duration.days(4);
            const newExpiry = (await latestTime()) - duration.days(2);
            await I_ERC20DividendCheckpoint.connect(token_owner).updateDividendDates(7, BigInt(newMaturity), BigInt(newExpiry));
            const info = await I_ERC20DividendCheckpoint.getDividendData(7);
            expect(info[1]).to.equal(BigInt(newMaturity));
            expect(info[2]).to.equal(BigInt(newExpiry));
            // Can now reclaim the dividend
            await I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(7);
        });

         it("Reclaim ERC20 tokens from the dividend contract", async () => {
            const currentDividendBalance = await I_PolyToken.balanceOf(I_ERC20DividendCheckpoint.target);
            const currentIssuerBalance = await I_PolyToken.balanceOf(token_owner.address);
            await expect(I_ERC20DividendCheckpoint.connect(account_polymath).reclaimERC20(I_PolyToken.target)).to.be.reverted;
            await I_ERC20DividendCheckpoint.connect(token_owner).reclaimERC20(I_PolyToken.target);
            expect(await I_PolyToken.balanceOf(I_ERC20DividendCheckpoint.target)).to.equal(0n);
            const newIssuerBalance = await I_PolyToken.balanceOf(token_owner.address);
            console.log("Reclaimed: " + currentDividendBalance.toString());
            expect(newIssuerBalance - currentIssuerBalance).to.equal(currentDividendBalance);
        });

        it("should allow manager with permission to create checkpoint", async () => {
            const initCheckpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            await I_ERC20DividendCheckpoint.connect(account_manager).createCheckpoint();
            const finalCheckpointId = await I_SecurityToken.connect(token_owner).createCheckpoint.staticCall();
            expect(finalCheckpointId).to.equal(initCheckpointId + 1n);
        });

        describe("Test cases for the ERC20DividendCheckpointFactory", async () => {
            it("should get the exact details of the factory", async () => {
            expect(await I_ERC20DividendCheckpointFactory.setupCost()).to.equal(0n);
            expect((await I_ERC20DividendCheckpointFactory.getTypes())[0]).to.equal(4);
            expect(await I_ERC20DividendCheckpointFactory.version()).to.equal("3.0.0");
            expect(
                ethers.decodeBytes32String(await I_ERC20DividendCheckpointFactory.name()).replace(/\u0000/g, "")
            ).to.equal("ERC20DividendCheckpoint");
            expect(
                await I_ERC20DividendCheckpointFactory.description()
            ).to.equal("Create ERC20 dividends for token holders at a specific checkpoint");
            expect(await I_ERC20DividendCheckpointFactory.title()).to.equal("ERC20 Dividend Checkpoint");
            const tags = await I_ERC20DividendCheckpointFactory.getTags();
            expect(tags.length).to.equal(3);
            });
        });
    });
});



