import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { increaseTime } from "./helpers/time";
import { encodeProxyCall } from "./helpers/encodeCall";
import { catchRevert } from "./helpers/exceptions";
import { setUpPolymathNetwork, deployUSDTieredSTOAndVerified } from "./helpers/createInstances";
import Web3 from "web3";

const web3 = new Web3("http://localhost:8545"); // Hardcoded development port

// const GAS_PRICE = process.env.COVERAGE === "true" ? 1n : 10000000000n; // 10 GWEI
const GAS_PRICE = 1n; // 10 GWEI


//const TOLERANCE = 2; // Allow balances to be off by 2 WEI for rounding purposes

describe("USDTieredSTO Sim", function() {
    // Accounts Variable declaration
    let POLYMATH: HardhatEthersSigner;
    let ISSUER: HardhatEthersSigner;
    let WALLET: HardhatEthersSigner;
    let TREASURYWALLET: HardhatEthersSigner;
    let INVESTOR1: HardhatEthersSigner;
    let ACCREDITED1: HardhatEthersSigner;
    let ACCREDITED2: HardhatEthersSigner;
    let NONACCREDITED1: HardhatEthersSigner;
    let NONACCREDITED2: HardhatEthersSigner;
    let NOTWHITELISTED: HardhatEthersSigner;
    let NOTAPPROVED: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    console.log(process.env.COVERAGE, "process.env.COVERAGE");

    // Contract Instance Declaration
    let I_GeneralTransferManagerFactory: any;
    let I_USDTieredSTOProxyFactory: any;
    let I_SecurityTokenRegistryProxy: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralTransferManager: any;
    let I_ModuleRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_USDTieredSTOFactory: any;
    let I_USDOracle: any;
    let I_POLYOracle: any;
    let I_STFactory: any;
    let I_MRProxied: any;
    let I_STRProxied: any;
    let I_SecurityToken: any;
    let I_USDTieredSTO_Array: any[] = [];
    let I_PolyToken: any;
    let I_DaiToken: any;
    let I_PolymathRegistry: any;
    let I_STRGetter: any;
    let I_STGetter: any;
    let stGetter: any;

    // SecurityToken Details for funds raise Type ETH
    const NAME = "Team";
    const SYMBOL = "SAP";
    const TOKENDETAILS = "This is equity type of issuance";
    const DECIMALS = 18;

    // Module key
    const TMKEY = 2;
    const STOKEY = 3;

    // Initial fee for ticker registry and security token registry
    const REGFEE = ethers.parseEther("1000");
    const STOSetupCost = 0n;

    // MockOracle USD prices
    const USDETH = ethers.parseEther("500"); // 500 USD/ETH
    const USDPOLY = ethers.parseUnits("25", 16); // 0.25 USD/POLY

    // STO Configuration Arrays
    let _startTime: bigint[] = [];
    let _endTime: bigint[] = [];
    let _ratePerTier: bigint[][] = [];
    let _ratePerTierDiscountPoly: bigint[][] = [];
    let _tokensPerTierTotal: bigint[][] = [];
    let _tokensPerTierDiscountPoly: bigint[][] = [];
    let _nonAccreditedLimitUSD: bigint[] = [];
    let _minimumInvestmentUSD: bigint[] = [];
    let _fundRaiseTypes: number[][] = [];
    let _wallet: string[] = [];
    let _treasuryWallet: string[] = [];
    let _usdToken: string[] = [];

    const address_zero = ethers.ZeroAddress;

    const functionSignature = {
        name: "configure",
        type: "function",
        inputs: [
            {
                type: "uint256",
                name: "_startTime"
            },
            {
                type: "uint256",
                name: "_endTime"
            },
            {
                type: "uint256[]",
                name: "_ratePerTier"
            },
            {
                type: "uint256[]",
                name: "_ratePerTierDiscountPoly"
            },
            {
                type: "uint256[]",
                name: "_tokensPerTier"
            },
            {
                type: "uint256[]",
                name: "_tokensPerTierDiscountPoly"
            },
            {
                type: "uint256",
                name: "_nonAccreditedLimitUSD"
            },
            {
                type: "uint256",
                name: "_minimumInvestmentUSD"
            },
            {
                type: "uint8[]",
                name: "_fundRaiseTypes"
            },
            {
                type: "address",
                name: "_wallet"
            },
            {
                type: "address",
                name: "_treasuryWallet"
            },
            {
                type: "address[]",
                name: "_usdTokens"
            }
        ]
    };

    function getRandomInt(min: bigint, max: bigint): bigint {
        const range = max - min + 1n;
        const random = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
        return min + (random % range);
    }

    function minBN(a: bigint, b: bigint): bigint {
        return a < b ? a : b;
    }

    let currentTime: number;
    let e18 = 10n ** 18n;
    let e16 = 10n ** 16n;

    before(async () => {
        // Get signers
        accounts = await ethers.getSigners();
        
        currentTime = await latestTime();
        
        // Account assignments
        POLYMATH = accounts[0];
        ISSUER = accounts[1];
        WALLET = accounts[2];
        TREASURYWALLET = WALLET;
        ACCREDITED1 = accounts[3];
        ACCREDITED2 = accounts[4];
        NONACCREDITED1 = accounts[5];
        NONACCREDITED2 = accounts[6];
        NOTWHITELISTED = accounts[7];
        NOTAPPROVED = accounts[8];
        INVESTOR1 = accounts[9];

        // Deploy DaiToken (PolyTokenFaucet)
        const PolyTokenFaucetFactory = await ethers.getContractFactory("PolyTokenFaucet");
        I_DaiToken = await PolyTokenFaucetFactory.connect(POLYMATH).deploy();

        // Step:1 Create the polymath ecosystem contract instances
        const instances = await setUpPolymathNetwork(POLYMATH.address, ISSUER.address);

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

        // STEP 5: Deploy the USDTieredSTOFactory
        [I_USDTieredSTOFactory] = await deployUSDTieredSTOAndVerified(POLYMATH.address, I_MRProxied, STOSetupCost);

        // Step 12: Deploy & Register Mock Oracles
        const MockOracleFactory = await ethers.getContractFactory("MockOracle");
        I_USDOracle = await MockOracleFactory.connect(POLYMATH).deploy(
            address_zero, 
            ethers.encodeBytes32String("ETH"), 
            ethers.encodeBytes32String("USD"), 
            USDETH
        ); // 500 dollars per ETH
        I_POLYOracle = await MockOracleFactory.connect(POLYMATH).deploy(
            I_PolyToken.target, 
            ethers.encodeBytes32String("POLY"), 
            ethers.encodeBytes32String("USD"), 
            USDPOLY
        ); // 25 cents per POLY
        
        await I_PolymathRegistry.connect(POLYMATH).changeAddress("ethUsdOracle", I_USDOracle.target);
        await I_PolymathRegistry.connect(POLYMATH).changeAddress("polyUsdOracle", I_POLYOracle.target);

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

        USDOracle:                         ${I_USDOracle.target}
        POLYOracle:                        ${I_POLYOracle.target}
        USDTieredSTOFactory:               ${I_USDTieredSTOFactory.target}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Deploy the STO", async () => {
        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.connect(ISSUER).getTokens(REGFEE, ISSUER.address);
            await I_PolyToken.connect(ISSUER).approve(I_STRProxied.target, REGFEE);
            const tx = await I_STRProxied.connect(ISSUER).registerNewTicker(ISSUER.address, SYMBOL);
            const receipt = await tx.wait();
            
            const strProxiedAddress = I_STRProxied.target;
        
            const logs = receipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        assert.equal(parsed.args._owner, ISSUER.address);
                        assert.equal(parsed.args._ticker, SYMBOL);
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    // Ignore errors for logs that don't match the interface
                }
            }
        
            assert.isTrue(eventFound, "RegisterTicker event not found");
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            await I_PolyToken.connect(ISSUER).getTokens(REGFEE, ISSUER.address);
            await I_PolyToken.connect(ISSUER).approve(I_STRProxied.target, REGFEE);

            const tx = await I_STRProxied.connect(ISSUER).generateNewSecurityToken(
                NAME, 
                SYMBOL, 
                TOKENDETAILS, 
                true, 
                ISSUER.address, 
                0 // 0 for poly fee
            );
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
                    // Ignore errors for logs that don't match the interface
                }
            }
            
            assert.isNotNull(securityTokenEvent, "NewSecurityToken event not found");
            assert.equal(securityTokenEvent!.args._ticker, SYMBOL, "SecurityToken ticker mismatch");

            I_SecurityToken = await ethers.getContractAt("ISecurityToken", securityTokenEvent!.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", await I_SecurityToken.getAddress());
            assert.equal(await stGetter.getTreasuryWallet(), ISSUER.address, "Incorrect wallet set");
            
            let moduleAddedEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
                try {
                    // The ModuleAdded event is emitted by the SecurityToken, not the STR
                    const parsed = I_SecurityToken.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModuleAdded") {
                        moduleAddedEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    // Ignore errors for logs that don't match the interface
                }
            }

            assert.isNotNull(moduleAddedEvent, "ModuleAdded event not found");
            assert.equal(Number(moduleAddedEvent!.args._types[0]), TMKEY);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            assert.equal(nameBytes32, "GeneralTransferManager");
        });

        it("Should initialize the auto attached modules", async () => {
            let moduleAddress = (await stGetter.getModulesByType(TMKEY))[0];
            I_GeneralTransferManager = await ethers.getContractAt("GeneralTransferManager", moduleAddress);
        });

        it("Should successfully attach the first STO module to the security token", async () => {
            let stoId = 0;
            const now = BigInt(await latestTime());

            // These arrays are being built for a single STO (stoId = 0)
            _startTime[stoId] = now + BigInt(duration.days(2));
            _endTime[stoId] = _startTime[stoId] + BigInt(duration.days(100));
            _ratePerTier[stoId] = [50n * e16, 130n * e16, 170n * e16]; // [ 0.05, 0.13, 0.17 ] USD/Token
            _ratePerTierDiscountPoly[stoId] = [50n * e16, 80n * e16, 130n * e16]; // [ 0.05, 0.08, 0.13 ] USD/Token
            _tokensPerTierTotal[stoId] = [200n * e18, 500n * e18, 300n * e18]; // [ 200, 500, 300 ] Tokens
            _tokensPerTierDiscountPoly[stoId] = [0n, 50n * e18, 300n * e18]; // [ 0, 50, 300 ] Tokens
            _nonAccreditedLimitUSD[stoId] = 10n * e18; // 10 USD
            _minimumInvestmentUSD[stoId] = 0n; // 0 USD
            _fundRaiseTypes[stoId] = [0, 1, 2]; // 0: ETH, 1: POLY, 2: DAI
            _wallet[stoId] = WALLET.address;
            _treasuryWallet[stoId] = TREASURYWALLET.address;
            _usdToken[stoId] = await I_DaiToken.getAddress();

            const stoInterface = new ethers.Interface([functionSignature]);
            const configData = [
                _startTime[stoId],
                _endTime[stoId],
                _ratePerTier[stoId],
                _ratePerTierDiscountPoly[stoId],
                _tokensPerTierTotal[stoId],
                _tokensPerTierDiscountPoly[stoId],
                _nonAccreditedLimitUSD[stoId],
                _minimumInvestmentUSD[stoId],
                _fundRaiseTypes[stoId],
                _wallet[stoId],
                _treasuryWallet[stoId],
                [_usdToken[stoId]]
            ];
            
            const bytesSTO = stoInterface.encodeFunctionData("configure", configData);
            
            const tx = await I_SecurityToken.connect(ISSUER).addModule(
                I_USDTieredSTOFactory.target, 
                bytesSTO, 
                0n, // 0 POLY fee
                0n, // 0 USD fee
                false, // not archivable
                { gasPrice: GAS_PRICE }
            );
            
            const receipt = await tx.wait();
            console.log(`Gas addModule: ${receipt!.gasUsed.toString()}`);

            const moduleAddedEvent = receipt!.logs
                .map(log => { try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }})
                .find(e => e && e.name === 'ModuleAdded');

            assert.isNotNull(moduleAddedEvent, "ModuleAdded event for STO not found");
            assert.equal(Number(moduleAddedEvent!.args._types[0]), STOKEY, "USDTieredSTO module key mismatch");
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            assert.equal(moduleName, "USDTieredSTO", "USDTieredSTOFactory module was not added with the correct name");
            
            const stoModuleAddress = moduleAddedEvent!.args._module;
            const stoModule = await ethers.getContractAt("USDTieredSTO", stoModuleAddress);
            I_USDTieredSTO_Array.push(stoModule);

            assert.equal((await I_USDTieredSTO_Array[stoId].startTime()).toString(), _startTime[stoId].toString(), "Incorrect _startTime in config");
            assert.equal((await I_USDTieredSTO_Array[stoId].endTime()).toString(), _endTime[stoId].toString(), "Incorrect _endTime in config");
            for (var i = 0; i < _ratePerTier[stoId].length; i++) {
                const tier = await I_USDTieredSTO_Array[stoId].tiers(i);
                assert.equal(tier[0].toString(), _ratePerTier[stoId][i].toString(), "Incorrect _ratePerTier in config");
                assert.equal(tier[1].toString(), _ratePerTierDiscountPoly[stoId][i].toString(), "Incorrect _ratePerTierDiscountPoly in config");
                assert.equal(tier[2].toString(), _tokensPerTierTotal[stoId][i].toString(), "Incorrect _tokensPerTierTotal in config");
                assert.equal(tier[3].toString(), _tokensPerTierDiscountPoly[stoId][i].toString(), "Incorrect _tokensPerTierDiscountPoly in config");
            }
            assert.equal((await I_USDTieredSTO_Array[stoId].nonAccreditedLimitUSD()).toString(), _nonAccreditedLimitUSD[stoId].toString(), "Incorrect _nonAccreditedLimitUSD in config");
            assert.equal((await I_USDTieredSTO_Array[stoId].minimumInvestmentUSD()).toString(), _minimumInvestmentUSD[stoId].toString(), "Incorrect _minimumInvestmentUSD in config");
            assert.equal(await I_USDTieredSTO_Array[stoId].wallet(), _wallet[stoId], "Incorrect _wallet in config");
            assert.equal(await I_USDTieredSTO_Array[stoId].treasuryWallet(), _treasuryWallet[stoId], "Incorrect _reserveWallet in config");
            assert.equal(await I_USDTieredSTO_Array[stoId].getNumberOfTiers(), BigInt(_tokensPerTierTotal[stoId].length), "Incorrect number of tiers");
            expect((await I_USDTieredSTO_Array[stoId].getPermissions()).length).to.equal(2, "Incorrect number of permissions");
        });

        it("Should successfully prepare the STO", async () => {
            // Move time to after STO start time
            await increaseTime(duration.days(3));

            // Whitelist investors
            const fromTime = await latestTime();
            const toTime = fromTime + duration.days(30);
            const expiryTime = toTime + duration.days(100);

            // Add all investors to KYC whitelist
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED2.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED2.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NOTAPPROVED.address, fromTime, toTime, expiryTime);

            // Set investor flags
            // Flag 0: IsAccredited
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED2.address, 0, true);
            // Flag 1: CanNotBuyFromSTO
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(NOTAPPROVED.address, 1, true);
        });
    });

    describe("Simulate purchasing", async () => {
        it("Should successfully complete simulation", async () => {
            let stoId = 0;

            console.log(`
        ------------------- Investor Addresses -------------------
        ACCREDITED1:    ${ACCREDITED1.address}
        ACCREDITED2:    ${ACCREDITED2.address}
        NONACCREDITED1: ${NONACCREDITED1.address}
        NONACCREDITED2: ${NONACCREDITED2.address}
        NOTWHITELISTED: ${NOTWHITELISTED.address}
        NOTAPPROVED:    ${NOTAPPROVED.address}
        ----------------------------------------------------------
            `);

            let totalTokens = 0n;
            for (var i = 0; i < _tokensPerTierTotal[stoId].length; i++) {
                totalTokens += _tokensPerTierTotal[stoId][i];
            }
            let tokensSold = 0n;
            while (true) {
                let rn = getRandomInt(0n, 5n);
                let rno = Number(rn);
                switch (rno) {
                    case 0: // ACCREDITED1
                        await invest(ACCREDITED1, true);
                        break;
                    case 1: // ACCREDITED2
                        await invest(ACCREDITED2, true);
                        break;
                    case 2: // NONACCREDITED1
                        let usd_NONACCREDITED1 = await I_USDTieredSTO_Array[stoId].investorInvestedUSD(NONACCREDITED1.address);
                        if (_nonAccreditedLimitUSD[stoId] > usd_NONACCREDITED1)
                            // under non-accredited cap
                            await invest(NONACCREDITED1, false);
                        // over non-accredited cap
                        else await investFAIL(NONACCREDITED1);
                        break;
                    case 3: // NONACCREDITED2
                        let usd_NONACCREDITED2 = await I_USDTieredSTO_Array[stoId].investorInvestedUSD(NONACCREDITED2.address);
                        if (_nonAccreditedLimitUSD[stoId] > usd_NONACCREDITED2)
                            // under non-accredited cap
                            await invest(NONACCREDITED2, false);
                        // over non-accredited cap
                        else await investFAIL(NONACCREDITED2);
                        break;
                    case 4: // NOTWHITELISTED
                        await investFAIL(NOTWHITELISTED);
                        break;
                    case 5: // NOTAPPROVED
                        await investFAIL(NOTAPPROVED);
                        break;
                }
                console.log("Next round");
                tokensSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
                console.log("Tokens Sold: " + (tokensSold / e18).toString());
                if (tokensSold >= totalTokens - 1n) {
                    console.log(`${tokensSold} tokens sold, simulation completed successfully!`);
                    break;
                }
            }

            async function invest(_investor: HardhatEthersSigner, _isAccredited: boolean) {
                // need to add check if reached non-accredited cap
                let USD_remaining: bigint;
                if (!_isAccredited) {
                    let USD_to_date = await I_USDTieredSTO_Array[stoId].investorInvestedUSD.staticCall(_investor.address);
                    USD_remaining = _nonAccreditedLimitUSD[stoId] - USD_to_date;
                } else {
                    USD_remaining = totalTokens * 2n;
                }

                let log_remaining = USD_remaining;
                let isPoly = Math.random() >= 0.33;
                let isDai = Math.random() >= 0.33;

                let Token_counter = getRandomInt(10n ** 10n, 5n * 10n ** 11n) * 10n ** 8n;
                let investment_USD = 0n;
                let investment_ETH = 0n;
                let investment_POLY = 0n;
                let investment_DAI = 0n;
                let investment_Token = 0n;

                let Tokens_total: bigint[] = [];
                let Tokens_discount: bigint[] = [];
                for (var i = 0; i < _ratePerTier[stoId].length; i++) {
                    let tierData = await I_USDTieredSTO_Array[stoId].tiers(i);
                    console.log(`Tier ${i}:`, tierData);
                    Tokens_total.push(BigInt(tierData[2]) - BigInt(tierData[4]));
                    Tokens_discount.push(BigInt(tierData[3]) - BigInt(tierData[5]));
                }

                let tier = 0;
                let Token_Tier: bigint;
                let USD_Tier: bigint;
                let POLY_Tier: bigint;
                let ETH_Tier: bigint;
                let DAI_Tier: bigint;

                let USD_overflow: bigint;
                let Token_overflow: bigint;

                while (Token_counter > 0n) {
                    if (tier == _ratePerTier[stoId].length) {
                        break;
                    }
                    if (Tokens_total[tier] > 0n) {
                        if (isPoly) {
                            // 1. POLY and discount (consume up to cap then move to regular)
                            if (Tokens_discount[tier] > 0n) {
                                Token_Tier = minBN(minBN(Tokens_total[tier], Tokens_discount[tier]), Token_counter);
                                USD_Tier = (Token_Tier * _ratePerTierDiscountPoly[stoId][tier]) / e18;
                                if (USD_Tier >= USD_remaining) {
                                    USD_overflow = USD_Tier - USD_remaining;
                                    Token_overflow = (USD_overflow * e18) / _ratePerTierDiscountPoly[stoId][tier];
                                    USD_Tier = USD_Tier - USD_overflow;
                                    Token_Tier = Token_Tier - Token_overflow;
                                    Token_counter = 0n;
                                }
                                POLY_Tier = (USD_Tier * e18) / USDPOLY;
                                USD_remaining = USD_remaining - USD_Tier;
                                Tokens_total[tier] = Tokens_total[tier] - Token_Tier;
                                Tokens_discount[tier] = Tokens_discount[tier] - Token_Tier;
                                Token_counter = Token_counter - Token_Tier;
                                investment_Token = investment_Token + Token_Tier;
                                investment_USD = investment_USD + USD_Tier;
                                investment_POLY = investment_POLY + POLY_Tier;
                            }
                            // 2. POLY and regular (consume up to cap then skip to next tier)
                            if (Tokens_total[tier] > 0n && Token_counter > 0n) {
                                Token_Tier = minBN(Tokens_total[tier], Token_counter);
                                USD_Tier = (Token_Tier * _ratePerTier[stoId][tier]) / e18;
                                if (USD_Tier >= USD_remaining) {
                                    USD_overflow = USD_Tier - USD_remaining;
                                    Token_overflow = (USD_overflow * e18) / _ratePerTier[stoId][tier];
                                    USD_Tier = USD_Tier - USD_overflow;
                                    Token_Tier = Token_Tier - Token_overflow;
                                    Token_counter = 0n;
                                }
                                POLY_Tier = (USD_Tier * e18) / USDPOLY;
                                USD_remaining = USD_remaining - USD_Tier;
                                Tokens_total[tier] = Tokens_total[tier] - Token_Tier;
                                Token_counter = Token_counter - Token_Tier;
                                investment_Token = investment_Token + Token_Tier;
                                investment_USD = investment_USD + USD_Tier;
                                investment_POLY = investment_POLY + POLY_Tier;
                            }
                        } else if (isDai) {
                            // 3. DAI (consume up to cap then skip to next tier)
                            Token_Tier = minBN(Tokens_total[tier], Token_counter);
                            USD_Tier = (Token_Tier * _ratePerTier[stoId][tier]) / e18;
                            if (USD_Tier >= USD_remaining) {
                                USD_overflow = USD_Tier - USD_remaining;
                                Token_overflow = (USD_overflow * e18) / _ratePerTier[stoId][tier];
                                USD_Tier = USD_Tier - USD_overflow;
                                Token_Tier = Token_Tier - Token_overflow;
                                Token_counter = 0n;
                            }
                            DAI_Tier = USD_Tier;
                            USD_remaining = USD_remaining - USD_Tier;
                            Tokens_total[tier] = Tokens_total[tier] - Token_Tier;
                            Token_counter = Token_counter - Token_Tier;
                            investment_Token = investment_Token + Token_Tier;
                            investment_USD = investment_USD + USD_Tier;
                            investment_DAI = investment_USD;
                        } else {
                            // 4. ETH (consume up to cap then skip to next tier)
                            Token_Tier = minBN(Tokens_total[tier], Token_counter);
                            USD_Tier = (Token_Tier * _ratePerTier[stoId][tier]) / e18;
                            if (USD_Tier >= USD_remaining) {
                                USD_overflow = USD_Tier - USD_remaining;
                                Token_overflow = (USD_overflow * e18) / _ratePerTier[stoId][tier];
                                USD_Tier = USD_Tier - USD_overflow;
                                Token_Tier = Token_Tier - Token_overflow;
                                Token_counter = 0n;
                            }
                            ETH_Tier = (USD_Tier * e18) / USDETH;
                            USD_remaining = USD_remaining - USD_Tier;
                            Tokens_total[tier] = Tokens_total[tier] - Token_Tier;
                            Token_counter = Token_counter - Token_Tier;
                            investment_Token = investment_Token + Token_Tier;
                            investment_USD = investment_USD + USD_Tier;
                            investment_ETH = investment_ETH + ETH_Tier;
                        }
                    }
                    tier = tier + 1;
                }

                await processInvestment(
                    _investor,
                    investment_Token,
                    investment_USD,
                    investment_POLY,
                    investment_DAI,
                    investment_ETH,
                    isPoly,
                    isDai,
                    log_remaining,
                    Tokens_total,
                    Tokens_discount,
                    tokensSold
                );
            }

            async function investFAIL(_investor: HardhatEthersSigner) {
                let isPoly = Math.random() >= 0.3;
                let isDAI = Math.random() >= 0.3;
                let investment_POLY = 40n * e18; // 10 USD = 40 POLY
                let investment_ETH = 2n * e16; // 10 USD = 0.02 ETH
                let investment_DAI = 10n * e18; // 10 USD = 10 DAI

                if (isPoly) {
                    await I_PolyToken.connect(POLYMATH).getTokens(investment_POLY, _investor.address);
                    await I_PolyToken.connect(_investor).approve(I_USDTieredSTO_Array[stoId].target, investment_POLY);
                    await expect(
                        I_USDTieredSTO_Array[stoId].connect(_investor).buyWithPOLY(_investor.address, investment_POLY, { gasPrice: GAS_PRICE })
                    ).to.be.reverted;
                } else if (isDAI) {
                    await I_DaiToken.connect(POLYMATH).getTokens(investment_DAI, _investor.address);
                    await I_DaiToken.connect(_investor).approve(I_USDTieredSTO_Array[stoId].target, investment_DAI);
                    await expect(
                        I_USDTieredSTO_Array[stoId].connect(_investor).buyWithUSD(_investor.address, investment_DAI, I_DaiToken.target, [ethers.ZeroHash], 0, false, 0, { gasPrice: GAS_PRICE })
                    ).to.be.reverted;
                } else
                    await expect(
                        I_USDTieredSTO_Array[stoId].connect(_investor).buyWithETH(_investor.address, { value: investment_ETH, gasPrice: GAS_PRICE })
                    ).to.be.reverted;
            }

            async function processInvestment(
                _investor: HardhatEthersSigner,
                investment_Token: bigint,
                investment_USD: bigint,
                investment_POLY: bigint,
                investment_DAI: bigint,
                investment_ETH: bigint,
                isPoly: boolean,
                isDai: boolean,
                log_remaining: bigint,
                Tokens_total: bigint[],
                Tokens_discount: bigint[],
                tokensSold: bigint
            ) {
                console.log(`
            ------------------- New Investment -------------------
            Investor:   ${_investor.address}
            N-A USD Remaining:      ${log_remaining}
            Total Cap Remaining:    ${Tokens_total}
            Discount Cap Remaining: ${Tokens_discount}
            Total Tokens Sold:      ${tokensSold}
            Token Investment:       ${investment_Token}
            USD Investment:         ${investment_USD}
            POLY Investment:        ${investment_POLY}
            DAI Investment:         ${investment_DAI}
            ETH Investment:         ${investment_ETH}
            ------------------------------------------------------
                `);

                if (isPoly) {
                    await I_PolyToken.connect(POLYMATH).getTokens(investment_POLY, _investor.address);
                    await I_PolyToken.connect(_investor).approve(I_USDTieredSTO_Array[stoId].target, investment_POLY);
                } else if (isDai) {
                    await I_DaiToken.connect(POLYMATH).getTokens(investment_DAI, _investor.address);
                    await I_DaiToken.connect(_investor).approve(I_USDTieredSTO_Array[stoId].target, investment_DAI);
                }

                let init_TokenSupply = await I_SecurityToken.totalSupply();
                let init_InvestorTokenBal = await I_SecurityToken.balanceOf(_investor.address);
                let init_InvestorETHBal = await ethers.provider.getBalance(_investor.address);
                let init_InvestorPOLYBal = await I_PolyToken.balanceOf(_investor.address);
                let init_InvestorDAIBal = await I_DaiToken.balanceOf(_investor.address);
                let init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
                let init_STOETHBal = await ethers.provider.getBalance(I_USDTieredSTO_Array[stoId].target);
                let init_STOPOLYBal = await I_PolyToken.balanceOf(I_USDTieredSTO_Array[stoId].target);
                let init_STODAIBal = await I_DaiToken.balanceOf(I_USDTieredSTO_Array[stoId].target);
                let init_RaisedUSD = await I_USDTieredSTO_Array[stoId].fundsRaisedUSD();
                let init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(0);
                let init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(1);
                let init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(2);
                let init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
                let init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);
                let init_WalletDAIBal = await I_DaiToken.balanceOf(WALLET.address);

                let tx;
                let gasCost = 0n;

                if (isPoly && investment_POLY > 10n) {
                    tx = await I_USDTieredSTO_Array[stoId].connect(_investor).buyWithPOLY(_investor.address, investment_POLY, {
                        gasPrice: GAS_PRICE
                    });
                    const receipt = await tx.wait();
                    gasCost = receipt!.gasUsed * GAS_PRICE;
                    console.log(
                        `buyWithPOLY: ${investment_Token / e18} tokens for ${investment_POLY / e18} POLY by ${_investor.address}`
                    );
                } else if (isDai && investment_DAI > 10n) {
                    tx = await I_USDTieredSTO_Array[stoId].connect(_investor).buyWithUSD(_investor.address, investment_DAI, I_DaiToken.target, [ethers.ZeroHash], 0, false, 0, { gasPrice: GAS_PRICE });
                    const receipt = await tx.wait();
                    gasCost = receipt!.gasUsed * GAS_PRICE;
                    console.log(
                        `buyWithUSD: ${investment_Token / e18} tokens for ${investment_DAI / e18} DAI by ${_investor.address}`
                    );
                } else if (investment_ETH > 0n) {
                    tx = await I_USDTieredSTO_Array[stoId].connect(_investor).buyWithETH(_investor.address, {
                        value: investment_ETH,
                        gasPrice: GAS_PRICE
                    });
                    const receipt = await tx.wait();
                    gasCost = receipt!.gasUsed * GAS_PRICE;
                    console.log(
                        `buyWithETH: ${investment_Token / e18} tokens for ${investment_ETH / e18} ETH by ${_investor.address}`
                    );
                }

                let final_TokenSupply = await I_SecurityToken.totalSupply();
                let final_InvestorTokenBal = await I_SecurityToken.balanceOf(_investor.address);
                let final_InvestorETHBal = await ethers.provider.getBalance(_investor.address);
                let final_InvestorPOLYBal = await I_PolyToken.balanceOf(_investor.address);
                let final_InvestorDAIBal = await I_DaiToken.balanceOf(_investor.address);
                let final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
                let final_STOETHBal = await ethers.provider.getBalance(I_USDTieredSTO_Array[stoId].target);
                let final_STOPOLYBal = await I_PolyToken.balanceOf(I_USDTieredSTO_Array[stoId].target);
                let final_STODAIBal = await I_DaiToken.balanceOf(I_USDTieredSTO_Array[stoId].target);
                let final_RaisedUSD = await I_USDTieredSTO_Array[stoId].fundsRaisedUSD();
                let final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(0);
                let final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(1);
                let final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(2);
                let final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
                let final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);
                let final_WalletDAIBal = await I_DaiToken.balanceOf(WALLET.address);

                const assertIsNear = (valA: bigint, valB: bigint, message: string) => {
                    const diff = valA > valB ? valA - valB : valB - valA;
                    expect(diff).to.be.lessThan(4n, message);
                }

                if (isPoly) {
                    assertIsNear(final_TokenSupply, init_TokenSupply + investment_Token, "Token Supply not changed as expected" );
                    assertIsNear(final_InvestorTokenBal, init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected" );
                    assertIsNear(final_InvestorETHBal, init_InvestorETHBal - gasCost, "Investor ETH Balance not changed as expected" );
                    assertIsNear(final_InvestorPOLYBal, init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected" );
                    assertIsNear(final_STOTokenSold, init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected" );
                    assertIsNear(final_STOETHBal, init_STOETHBal, "STO ETH Balance not changed as expected" );
                    assertIsNear(final_STOPOLYBal, init_STOPOLYBal, "STO POLY Balance not changed as expected" );
                    assertIsNear(final_RaisedUSD, init_RaisedUSD + investment_USD, "Raised USD not changed as expected" );
                    assertIsNear(final_RaisedETH, init_RaisedETH, "Raised ETH not changed as expected");
                    assertIsNear(final_RaisedPOLY, init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected" );
                    assertIsNear(final_WalletETHBal, init_WalletETHBal, "Wallet ETH Balance not changed as expected" );
                    assertIsNear(final_WalletPOLYBal, init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected" );
                } else if (isDai) {
                    assertIsNear(final_TokenSupply, init_TokenSupply + investment_Token, "Token Supply not changed as expected" );
                    assertIsNear(final_InvestorTokenBal, init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected" );
                    assertIsNear(final_InvestorETHBal, init_InvestorETHBal - gasCost, "Investor ETH Balance not changed as expected" );
                    assertIsNear(final_InvestorDAIBal, init_InvestorDAIBal - investment_DAI, "Investor DAI Balance not changed as expected" );
                    assertIsNear(final_STOTokenSold, init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected" );
                    assertIsNear(final_STOETHBal, init_STOETHBal, "STO ETH Balance not changed as expected" );
                    assertIsNear(final_STODAIBal, init_STODAIBal, "STO DAI Balance not changed as expected" );
                    assertIsNear(final_RaisedUSD, init_RaisedUSD + investment_USD, "Raised USD not changed as expected" );
                    assertIsNear(final_RaisedETH, init_RaisedETH, "Raised ETH not changed as expected");
                    assertIsNear(final_RaisedDAI, init_RaisedDAI + investment_DAI, "Raised DAI not changed as expected" );
                    assertIsNear(final_WalletETHBal, init_WalletETHBal, "Wallet ETH Balance not changed as expected" );
                    assertIsNear(final_WalletDAIBal, init_WalletDAIBal + investment_DAI, "Wallet DAI Balance not changed as expected" );
                } else {
                    assertIsNear(final_TokenSupply, init_TokenSupply + investment_Token, "Token Supply not changed as expected" );
                    assertIsNear(final_InvestorTokenBal, init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected" );
                    assertIsNear(final_InvestorETHBal, init_InvestorETHBal - gasCost - investment_ETH , "Investor ETH Balance not changed as expected" );
                    assertIsNear(final_InvestorPOLYBal, init_InvestorPOLYBal, "Investor POLY Balance not changed as expected" );
                    assertIsNear(final_STOTokenSold, init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected" );
                    assertIsNear(final_STOETHBal, init_STOETHBal, "STO ETH Balance not changed as expected" );
                    assertIsNear(final_STOPOLYBal, init_STOPOLYBal, "STO POLY Balance not changed as expected" );
                    assertIsNear(final_RaisedUSD, init_RaisedUSD + investment_USD, "Raised USD not changed as expected" );
                    assertIsNear(final_RaisedETH, init_RaisedETH + investment_ETH, "Raised ETH not changed as expected" );
                    assertIsNear(final_RaisedPOLY, init_RaisedPOLY, "Raised POLY not changed as expected" );
                    assertIsNear(final_WalletETHBal, init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected" );
                    assertIsNear(final_WalletPOLYBal, init_WalletPOLYBal, "Wallet POLY Balance not changed as expected" );
                }
            }
        });
    });
});

// function assertIsNear(a, b, reason) {
//     a = new BN(a);
//     b = new BN(b);
//     if (a.gt(b)) {
//         assert.isBelow(a.sub(b).toNumber(), 4, reason);
//     } else {
//         assert.isBelow(b.sub(a).toNumber(), 4, reason);
//     }
// }
