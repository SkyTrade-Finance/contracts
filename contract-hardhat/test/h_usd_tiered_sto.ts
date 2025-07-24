import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration, ensureException, promisifyLogWatch, latestBlock } from "./helpers/utils";
import { takeSnapshot, increaseTime, revertToSnapshot } from "./helpers/time";
import { encodeProxyCall, encodeModuleCall } from "./helpers/encodeCall";
import { catchRevert } from "./helpers/exceptions";
import { setUpPolymathNetwork, deployGPMAndVerifyed, deployUSDTieredSTOAndVerified } from "./helpers/createInstances";

import {
    USDTieredSTO,
    MockOracle,
    SecurityToken,
    GeneralTransferManager,
    PolyTokenFaucet,
    STGetter,
} from "../typechain-types";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("USDTieredSTO", function() {
    let e18: bigint;
    let e16: bigint;
    // Accounts Variable declaration
    let POLYMATH: HardhatEthersSigner;
    let ISSUER: HardhatEthersSigner;
    let WALLET: HardhatEthersSigner;
    let TREASURYWALLET: HardhatEthersSigner;
    let INVESTOR1: HardhatEthersSigner;
    let INVESTOR2: HardhatEthersSigner;
    let INVESTOR3: HardhatEthersSigner;
    let INVESTOR4: HardhatEthersSigner;
    let ACCREDITED1: HardhatEthersSigner;
    let ACCREDITED2: HardhatEthersSigner;
    let NONACCREDITED1: HardhatEthersSigner;
    let NONACCREDITED2: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];
    
    let ETH = 0;
    let POLY = 1;
    let DAI = 2;
    let oldEthRate: bigint;
    let oldPolyRate: bigint;

    let MESSAGE = "Transaction Should Fail!";
    const GAS_PRICE = 0;

    let merkleTree;
    let merkleRoot;
    let proof1;
    let proof2;
    let proof3;
    let proof4;
    let ltime;
    let isAccredited1;
    let isAccredited2;

    // Helper to increase blockchain time
    const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
    const ONE_YEAR_IN_SECONDS = 365 * ONE_DAY_IN_SECONDS;

    const InvestorClass = {
        NonUS: 0,
        US: 1
    };

    // Contract Instance Declaration
    let I_GeneralPermissionManagerFactory: Contract;
    let I_SecurityTokenRegistryProxy: Contract;
    let I_GeneralTransferManagerFactory: Contract;
    let I_USDTieredSTOProxyFactory: Contract;
    let I_GeneralPermissionManager: Contract;
    let I_GeneralTransferManager: GeneralTransferManager;
    let I_ModuleRegistry: Contract;
    let I_ModuleRegistryProxy: Contract;
    let I_FeatureRegistry: Contract;
    let I_SecurityTokenRegistry: Contract;
    let I_USDTieredSTOFactory: Contract;
    let I_USDOracle: MockOracle;
    let I_POLYOracle: MockOracle;
    let I_STFactory: Contract;
    let I_SecurityToken: SecurityToken;
    let I_STRProxied: Contract;
    let I_MRProxied: Contract;
    let I_USDTieredSTO_Array: Contract[] = [];
    let I_PolyToken: Contract;
    let I_DaiToken: PolyTokenFaucet;
    let I_PolymathRegistry: Contract;
    let P_USDTieredSTOFactory: Contract;
    let I_STRGetter: Contract;
    let I_STGetter: Contract;
    let stGetter: STGetter;

    // Contract Factories
    let MockOracleFactory: ContractFactory;
    let PolyTokenFaucetFactory: ContractFactory;
    let SecurityTokenFactory: ContractFactory;
    let GeneralTransferManagerFactory: ContractFactory;
    let STGetterFactory: ContractFactory;
    let I_TradingRestrictionManager;

    // SecurityToken Details for funds raise Type ETH
    const NAME = "Team";
    const SYMBOL = "SAP";
    const TOKENDETAILS = "This is equity type of issuance";
    const DECIMALS = 18;

    // Module key
    const TMKEY = 2;
    const STOKEY = 3;
    let snapId: string;
    const address_zero = "0x0000000000000000000000000000000000000000";
    const one_address = "0x0000000000000000000000000000000000000001";

    // Initial fee for ticker registry and security token registry
    let REGFEE: bigint;
    const STOSetupCost = 0;

    // MockOracle USD prices
    let USDETH: bigint; // 500 USD/ETH
    let USDPOLY: bigint; // 0.25 USD/POLY

    // STO Configuration Arrays
    let _startTime: bigint[] = [];
    let _endTime: bigint[] = [];
    let _ratePerTier: bigint[] = [];
    let _ratePerTierDiscountPoly: bigint[] = [];
    let _tokensPerTierTotal: bigint[] = [];
    let _tokensPerTierDiscountPoly: bigint[] = [];
    let _nonAccreditedLimitUSD: bigint[] = [];
    let _minimumInvestmentUSD: bigint[] = [];
    let _fundRaiseTypes: number[] = [];
    let _wallet: string[] = [];
    let _treasuryWallet: string[] = [];
    let _usdToken: string[] = [];

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

    async function convert(_stoID: number, _tier: number, _discount: boolean, _currencyFrom: string, _currencyTo: string, _amount: bigint): Promise<bigint> {
        let USDTOKEN: bigint;
        if (_discount) USDTOKEN = (await I_USDTieredSTO_Array[_stoID].tiers(_tier))[1];
        else USDTOKEN = (await I_USDTieredSTO_Array[_stoID].tiers(_tier))[0];
        console.log(`USDTOKEN: ${USDTOKEN}`);
        
        if (_currencyFrom == "TOKEN") {
            let tokenToUSD = (_amount * USDTOKEN) / e18;
            if (_currencyTo == "USD") return tokenToUSD;
            if (_currencyTo == "ETH") {
                return await I_USDTieredSTO_Array[_stoID].convertFromUSD.staticCall(ETH, tokenToUSD);
            } else if (_currencyTo == "POLY") {
                return await I_USDTieredSTO_Array[_stoID].convertFromUSD.staticCall(POLY, tokenToUSD);
            }
        }
        if (_currencyFrom == "USD") {
            if (_currencyTo == "TOKEN") return (_amount / USDTOKEN) * e18; // USD / USD/TOKEN = TOKEN
            if (_currencyTo == "ETH" || _currencyTo == "POLY")
                return await I_USDTieredSTO_Array[_stoID].convertFromUSD.staticCall(_currencyTo == "ETH" ? ETH : POLY, _amount);
        }
        if (_currencyFrom == "ETH" || _currencyFrom == "POLY") {
            let ethToUSD = await I_USDTieredSTO_Array[_stoID].convertToUSD.staticCall(_currencyTo == "ETH" ? ETH : POLY, _amount);
            if (_currencyTo == "USD") return ethToUSD;
            if (_currencyTo == "TOKEN") return (ethToUSD / USDTOKEN) * e18; // USD / USD/TOKEN = TOKEN
        }
        return 0n;
    }

    let currentTime: number;

    before(async () => {
        e18 = 10n ** 18n;
        e16 = 10n ** 16n;
        currentTime = await latestTime();
        REGFEE = ethers.parseEther("1000");
        USDETH = 500n * (10n ** 18n); // 500 USD/ETH
        USDPOLY = 25n * (10n ** 16n); // 0.25 USD/POLY
        
        // Get signers
        accounts = await ethers.getSigners();
        
        POLYMATH = accounts[0];
        ISSUER = accounts[1];
        WALLET = accounts[2];
        TREASURYWALLET = WALLET;
        ACCREDITED1 = accounts[3];
        ACCREDITED2 = accounts[4];
        NONACCREDITED1 = accounts[5];
        NONACCREDITED2 = accounts[6];
        INVESTOR1 = accounts[7];
        INVESTOR2 = accounts[8];
        INVESTOR3 = accounts[9];

        ltime = await latestTime() + duration.days(300);

        const values = [
            [NONACCREDITED1.address, ltime, false],
            [ACCREDITED1.address, ltime, true],
            [TREASURYWALLET.address, ltime, true]
        ];

        merkleTree = StandardMerkleTree.of(values, ["address", "uint64", "bool"]);
        merkleRoot = merkleTree.root;

        // Get proofs
        for (const [i, v] of merkleTree.entries()) {
            if (v[0] === NONACCREDITED1.address) {
                proof1 = merkleTree.getProof(i);
            }
            if (v[0] === ACCREDITED1.address) {
                proof2 = merkleTree.getProof(i);
            }
            if(v[0] === TREASURYWALLET.address) {
                proof3 = merkleTree.getProof(i);
            }
        }

        // Get contract factories
        MockOracleFactory = await ethers.getContractFactory("MockOracle");
        PolyTokenFaucetFactory = await ethers.getContractFactory("PolyTokenFaucet");
        GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManager");

         // Step:1 Create the polymath ecosystem contract instances
         let instances = await setUpPolymathNetwork(POLYMATH.address, ISSUER.address);

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
             I_STGetter,
             I_TradingRestrictionManager
         ] = instances;

        I_DaiToken = await PolyTokenFaucetFactory.connect(POLYMATH).deploy();
        await I_DaiToken.waitForDeployment();
        
        // STEP 4: Deploy the GeneralDelegateManagerFactory
        [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(POLYMATH.address, I_MRProxied, 0);

        // STEP 5: Deploy the USDTieredSTOFactory
        [I_USDTieredSTOFactory] = await deployUSDTieredSTOAndVerified(POLYMATH.address, I_MRProxied, STOSetupCost);
        [P_USDTieredSTOFactory] = await deployUSDTieredSTOAndVerified(POLYMATH.address, I_MRProxied, ethers.parseEther("500"));
        
        // Step 12: Deploy & Register Mock Oracles
        I_USDOracle = await MockOracleFactory.connect(POLYMATH).deploy(
            address_zero, 
            ethers.encodeBytes32String("ETH"), 
            ethers.encodeBytes32String("USD"), 
            USDETH
        );
        await I_USDOracle.waitForDeployment();
        
        I_POLYOracle = await MockOracleFactory.connect(POLYMATH).deploy(
            await I_PolyToken.getAddress(), 
            ethers.encodeBytes32String("POLY"), 
            ethers.encodeBytes32String("USD"), 
            USDPOLY
        );
        await I_POLYOracle.waitForDeployment();
        
        await I_PolymathRegistry.connect(POLYMATH).changeAddress("EthUsdOracle", await I_USDOracle.getAddress());
        await I_PolymathRegistry.connect(POLYMATH).changeAddress("PolyUsdOracle", await I_POLYOracle.getAddress());

        // Printing all the contract addresses
        console.log(`
        --------------------- Polymath Network Smart Contracts: ---------------------
        PolymathRegistry:                  ${await I_PolymathRegistry.getAddress()}
        SecurityTokenRegistryProxy:        ${await I_SecurityTokenRegistryProxy.getAddress()}
        SecurityTokenRegistry:             ${await I_SecurityTokenRegistry.getAddress()}
        ModuleRegistry:                    ${await I_ModuleRegistry.getAddress()}
        FeatureRegistry:                   ${await I_FeatureRegistry.getAddress()}

        STFactory:                         ${await I_STFactory.getAddress()}
        GeneralTransferManagerFactory:     ${await I_GeneralTransferManagerFactory.getAddress()}

        USDOracle:                         ${await I_USDOracle.getAddress()}
        POLYOracle:                        ${await I_POLYOracle.getAddress()}
        USDTieredSTOFactory:               ${await I_USDTieredSTOFactory.getAddress()}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Generate the SecurityToken", async () => {
        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.getTokens(REGFEE, ISSUER.address);
            await I_PolyToken.connect(ISSUER).approve(await I_STRProxied.getAddress(), REGFEE);
            let tx = await I_STRProxied.connect(ISSUER).registerNewTicker(ISSUER.address, SYMBOL);
            
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
                        expect(parsed.args._owner).to.equal(ISSUER.address);
                        expect(parsed.args._ticker).to.equal(SYMBOL);
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
            await I_PolyToken.getTokens(REGFEE, ISSUER.address);
            await I_PolyToken.connect(ISSUER).approve(await I_STRProxied.getAddress(), REGFEE);

            let tx = await I_STRProxied.connect(ISSUER).generateNewSecurityToken(NAME, SYMBOL, TOKENDETAILS, true, ISSUER.address, 0);
            const receipt = await tx.wait();
            
            let securityTokenEvent = null;
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

            expect(securityTokenEvent).to.not.be.null;
            expect(securityTokenEvent!.args._ticker).to.equal(SYMBOL, "SecurityToken doesn't get deployed");

            I_SecurityToken = await ethers.getContractAt("SecurityToken", securityTokenEvent!.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", await I_SecurityToken.getAddress());
            
            expect(await stGetter.getTreasuryWallet()).to.equal(ISSUER.address, "Incorrect wallet set");
            
            // Find ModuleAdded event in the transaction logs
            let moduleAddedEvent = null;
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
            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0].toString()).to.equal(TMKEY.toString());
            expect(ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '')).to.equal("GeneralTransferManager");
        });

        it("Should initialize the auto attached modules", async () => {
            let moduleData = (await stGetter.getModulesByType(TMKEY))[0];
            I_GeneralTransferManager = await ethers.getContractAt("GeneralTransferManager", moduleData);
        });

        it("should set trading restriction manager", async () => { 
            const tx = await I_GeneralTransferManager.connect(ISSUER).setTradingRestrictionManager(I_TradingRestrictionManager.target);

            const receipt = await tx.wait();
            let tradingRestrictionEvent: LogDescription | null = null;

            for (const log of receipt!.logs) {
                try {
                    const parsed = I_GeneralTransferManager.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "TradingRestrictionManagerUpdated") {
                        tradingRestrictionEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log with STRProxied: ${err.message}`);
                }
            }

            expect(tradingRestrictionEvent).to.not.be.null;
            expect(tradingRestrictionEvent!.args.newManager).to.equal(I_TradingRestrictionManager.target, "TradingRestrictionManager not set correctly");
        });

        it("should set the operator", async () => {
            await I_TradingRestrictionManager.connect(POLYMATH).grantOperator(ISSUER.address);
            expect(await I_TradingRestrictionManager.isOperator(ISSUER.address)).to.equal(true);
        });

        it("should whitelist three investors", async () => {
            const tx = await I_TradingRestrictionManager.connect(ISSUER).modifyKYCData(merkleRoot);

            const receipt = await tx.wait();
            let MerkleRootUpdatedEvent: LogDescription | null = null;

            for (const log of receipt!.logs) {
                try {
                    const parsed = I_TradingRestrictionManager.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "MerkleRootUpdated") {
                        MerkleRootUpdatedEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log with STRProxied: ${err.message}`);
                }
            }

            expect(MerkleRootUpdatedEvent).to.not.be.null;
            expect(MerkleRootUpdatedEvent!.args.root).to.equal(merkleRoot, "Merkle root not set correctly");
        });

        it("Should verify investor 1 correctly", async () => {
            await expect(
                I_TradingRestrictionManager.connect(NONACCREDITED1).verifyInvestor(
                proof1,
                NONACCREDITED1.address,
                ltime,
                false,
                InvestorClass.NonUS
            )
            ).to.not.be.reverted;
        });

        it("Should verify investor 2 correctly", async () => {
            await expect(
                I_TradingRestrictionManager.connect(ACCREDITED1).verifyInvestor(
                proof2,
                ACCREDITED1.address,
                ltime,
                true,
                InvestorClass.NonUS
            )
            ).to.not.be.reverted;
        });

        it("Should verify wallet address correctly", async () => {
            await expect(
                I_TradingRestrictionManager.connect(WALLET).verifyInvestor(
                proof3,
                WALLET.address,
                ltime,
                true,
                InvestorClass.NonUS
            )
            ).to.not.be.reverted;
        });
    });

    describe("Test sto deployment", async () => {
        it("Should successfully attach the first STO module to the security token", async () => {
            const stoId = 0; // No discount

            _startTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60));
            _endTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60) + BigInt(100 * 24 * 60 * 60));
            _ratePerTier.push([10n * e16, 15n * e16]); // [ 0.10 USD/Token, 0.15 USD/Token ]
            _ratePerTierDiscountPoly.push([10n * e16, 15n * e16]); // [ 0.10 USD/Token, 0.15 USD/Token ]
            _tokensPerTierTotal.push([100000000n * e18, 200000000n * e18]); // [ 100m Token, 200m Token ]
            _tokensPerTierDiscountPoly.push([0n, 0n]); // [ 0, 0 ]
            _nonAccreditedLimitUSD.push(10000n * e18); // 10k USD
            _minimumInvestmentUSD.push(5n * e18); // 5 USD
            _fundRaiseTypes.push([ETH, POLY, DAI]);
            _wallet.push(WALLET.address);
            _treasuryWallet.push(TREASURYWALLET.address);
            _usdToken.push([await I_DaiToken.getAddress()]);

            const config = [
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
                _usdToken[stoId]
            ];

            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            const tx = await I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false);
            
            const receipt = await tx.wait();
            console.log(`Gas addModule: ${receipt.gasUsed}`);
            
            const moduleAddedEvent = receipt.logs.map(log => {
                try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModuleAdded');

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent.args._types[0]).to.equal(STOKEY);
            expect(ethers.decodeBytes32String(moduleAddedEvent.args._name).replace(/\u0000/g, '')).to.equal("USDTieredSTO");
            
            I_USDTieredSTO_Array.push(await ethers.getContractAt("USDTieredSTO", moduleAddedEvent.args._module));

            expect(await I_USDTieredSTO_Array[stoId].startTime()).to.equal(_startTime[stoId]);
            expect(await I_USDTieredSTO_Array[stoId].endTime()).to.equal(_endTime[stoId]);
            for (var i = 0; i < _ratePerTier[stoId].length; i++) {
                const tier = await I_USDTieredSTO_Array[stoId].tiers(i);
                expect(tier[0]).to.equal(_ratePerTier[stoId][i]);
                expect(tier[1]).to.equal(_ratePerTierDiscountPoly[stoId][i]);
                expect(tier[2]).to.equal(_tokensPerTierTotal[stoId][i]);
                expect(tier[3]).to.equal(_tokensPerTierDiscountPoly[stoId][i]);
            }
            expect(await I_USDTieredSTO_Array[stoId].nonAccreditedLimitUSD()).to.equal(_nonAccreditedLimitUSD[stoId]);
            expect(await I_USDTieredSTO_Array[stoId].minimumInvestmentUSD()).to.equal(_minimumInvestmentUSD[stoId]);
            expect(await I_USDTieredSTO_Array[stoId].wallet()).to.equal(_wallet[stoId]);
            expect(await I_USDTieredSTO_Array[stoId].treasuryWallet()).to.equal(_treasuryWallet[stoId]);
            expect((await I_USDTieredSTO_Array[stoId].getUsdTokens())[0]).to.equal(_usdToken[stoId][0]);
            expect(await I_USDTieredSTO_Array[stoId].getNumberOfTiers()).to.equal(_tokensPerTierTotal[stoId].length);
            expect((await I_USDTieredSTO_Array[stoId].getPermissions()).length).to.equal(2);
        });

        it("Should attach the paid STO factory -- failed because of no tokens", async () => {
            const stoId = 0; // No discount
            const config = [
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
                _usdToken[stoId]
            ];

            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            await expect(
                I_SecurityToken.connect(ISSUER).addModule(await P_USDTieredSTOFactory.getAddress(), bytesSTO, ethers.parseEther("2000"), 0n, false)
            ).to.be.reverted;
        });

        it("Should attach the paid STO factory", async () => {
            const snapId = await takeSnapshot();
            const stoId = 0; // No discount
            const config = [
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
                _usdToken[stoId]
            ];

            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            await I_PolyToken.getTokens(ethers.parseEther("2000"), await I_SecurityToken.getAddress());
            await I_SecurityToken.connect(ISSUER).addModule(await P_USDTieredSTOFactory.getAddress(), bytesSTO, ethers.parseEther("2000"), 0n, false);
            await revertToSnapshot(snapId);
        });

        it("Should allow non-matching beneficiary", async () => {
            snapId = await takeSnapshot();
            await I_USDTieredSTO_Array[0].connect(ISSUER).changeAllowBeneficialInvestments(true);
            const allow = await I_USDTieredSTO_Array[0].allowBeneficialInvestments();
            expect(allow).to.be.true;
        });

        it("Should allow non-matching beneficiary -- failed because it is already active", async () => {
            await expect(I_USDTieredSTO_Array[0].connect(ISSUER).changeAllowBeneficialInvestments(true)).to.be.reverted;
            await revertToSnapshot(snapId);
        });

        it("Should successfully call the modifyTimes before starting the STO -- fail because of bad owner", async () => {
            await expect(
                I_USDTieredSTO_Array[0].connect(POLYMATH).modifyTimes(BigInt(currentTime) + BigInt(15 * 24 * 60 * 60), BigInt(currentTime) + BigInt(55 * 24 * 60 * 60))
            ).to.be.reverted;
        });

        it("Should successfully call the modifyTimes before starting the STO", async () => {
            const snapId = await takeSnapshot();
            const newStartTime = BigInt(currentTime) + BigInt(15 * 24 * 60 * 60);
            const newEndTime = BigInt(currentTime) + BigInt(55 * 24 * 60 * 60);
            await I_USDTieredSTO_Array[0].connect(ISSUER).modifyTimes(newStartTime, newEndTime);
            expect(await I_USDTieredSTO_Array[0].startTime()).to.equal(newStartTime);
            expect(await I_USDTieredSTO_Array[0].endTime()).to.equal(newEndTime);
            await revertToSnapshot(snapId);
        });

        it("Should successfully attach the second STO module to the security token", async () => {
            const stoId = 1; // No discount

            _startTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60));
            _endTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60) + BigInt(100 * 24 * 60 * 60));
            _ratePerTier.push([
                10n * e16,
                15n * e16,
                15n * e16,
                15n * e16,
                15n * e16,
                15n * e16
            ]);
            _ratePerTierDiscountPoly.push([
                10n * e16,
                15n * e16,
                15n * e16,
                15n * e16,
                15n * e16,
                15n * e16
            ]);
            _tokensPerTierTotal.push([
                5n * e18,
                10n * e18,
                10n * e18,
                10n * e18,
                10n * e18,
                50n * e18
            ]);
            _tokensPerTierDiscountPoly.push([0n, 0n, 0n, 0n, 0n, 0n]);
            _nonAccreditedLimitUSD.push(10000n * e18);
            _minimumInvestmentUSD.push(0n);
            _fundRaiseTypes.push([ETH, POLY, DAI]);
            _wallet.push(WALLET.address);
            _treasuryWallet.push(TREASURYWALLET.address);
            _usdToken.push([await I_DaiToken.getAddress()]);

            const config = [
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
                _usdToken[stoId]
            ];

            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            const tx = await I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false);

            const receipt = await tx.wait();
            console.log(`          Gas addModule: ${receipt.gasUsed}`);
            
            const moduleAddedEvent = receipt.logs.map(log => {
                try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModuleAdded');

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent.args._types[0]).to.equal(STOKEY);
            expect(ethers.decodeBytes32String(moduleAddedEvent.args._name).replace(/\u0000/g, '')).to.equal("USDTieredSTO");
            
            I_USDTieredSTO_Array.push(await ethers.getContractAt("USDTieredSTO", moduleAddedEvent.args._module));
        });

        it("Should successfully attach the third STO module to the security token", async () => {
            const stoId = 2; // Poly discount
            _startTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60));
            _endTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60) + BigInt(100 * 24 * 60 * 60));
            _ratePerTier.push([1n * e18, 150n * e16]); // [ 1 USD/Token, 1.5 USD/Token ]
            _ratePerTierDiscountPoly.push([50n * e16, 1n * e18]); // [ 0.5 USD/Token, 1.5 USD/Token ]
            _tokensPerTierTotal.push([100n * e18, 50n * e18]); // [ 100 Token, 50 Token ]
            _tokensPerTierDiscountPoly.push([100n * e18, 25n * e18]); // [ 100 Token, 25 Token ]
            _nonAccreditedLimitUSD.push(25n * e18); // [ 25 USD ]
            _minimumInvestmentUSD.push(5n);
            _fundRaiseTypes.push([ETH, POLY, DAI]);
            _wallet.push(WALLET.address);
            _treasuryWallet.push(TREASURYWALLET.address);
            _usdToken.push([await I_DaiToken.getAddress()]);
            
            const config = [
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
                _usdToken[stoId]
            ];
            
            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            const tx = await I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false);
            
            const receipt = await tx.wait();
            console.log(`Gas addModule: ${receipt.gasUsed}`);
            
            const moduleAddedEvent = receipt.logs.map(log => {
                try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModuleAdded');

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent.args._types[0]).to.equal(STOKEY);
            expect(ethers.decodeBytes32String(moduleAddedEvent.args._name).replace(/\u0000/g, '')).to.equal("USDTieredSTO");
            
            I_USDTieredSTO_Array.push(await ethers.getContractAt("USDTieredSTO", moduleAddedEvent.args._module));
        });

        it("Should successfully attach the fourth STO module to the security token", async () => {
            const stoId = 3;

            function daysToSecondsBigInt(days: number | string): bigint {
            const seconds = Number(days) * 24 * 60 * 60;
            if (!Number.isFinite(seconds) || isNaN(seconds)) {
                throw new Error("Invalid input: days must be a finite number");
            }
            if (!Number.isInteger(seconds)) {
                // Round to nearest integer (or use Math.floor/ceil if preferred)
                return BigInt(Math.round(seconds));
            }
            return BigInt(seconds);
            }

            _startTime.push(BigInt(currentTime) + daysToSecondsBigInt(0.1));
            _endTime.push(BigInt(currentTime) + daysToSecondsBigInt(0.1) + daysToSecondsBigInt(0.1));
            _ratePerTier.push([10n * e16, 15n * e16]);
            _ratePerTierDiscountPoly.push([10n * e16, 12n * e16]);
            _tokensPerTierTotal.push([100n * e18, 200n * e18]);
            _tokensPerTierDiscountPoly.push([0n, 50n * e18]);
            _nonAccreditedLimitUSD.push(10000n * e18);
            _minimumInvestmentUSD.push(0n);
            _fundRaiseTypes.push([ETH, POLY, DAI]);
            _wallet.push(WALLET.address);
            _treasuryWallet.push(TREASURYWALLET.address);
            _usdToken.push([await I_DaiToken.getAddress()]);

            const config = [
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
                _usdToken[stoId]
            ];

            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            const tx = await I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false);
            
            const receipt = await tx.wait();
            console.log(`          Gas addModule: ${receipt.gasUsed}`);
            
            const moduleAddedEvent = receipt.logs.map(log => {
                try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModuleAdded');

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent.args._types[0]).to.equal(STOKEY);
            expect(ethers.decodeBytes32String(moduleAddedEvent.args._name).replace(/\u0000/g, '')).to.equal("USDTieredSTO");
            
            I_USDTieredSTO_Array.push(await ethers.getContractAt("USDTieredSTO", moduleAddedEvent.args._module));
        });

        it("Should successfully attach the fifth STO module to the security token", async () => {
            const stoId = 4; // Non-divisible tokens

            _startTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60));
            _endTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60) + BigInt(100 * 24 * 60 * 60));
            _ratePerTier.push([1n * e18, 150n * e16]); // [ 1 USD/Token, 1.5 USD/Token ]
            _ratePerTierDiscountPoly.push([50n * e16, 1n * e18]); // [ 0.5 USD/Token, 1.5 USD/Token ]
            _tokensPerTierTotal.push([100n * e18, 50n * e18]); // [ 100 Token, 50 Token ]
            _tokensPerTierDiscountPoly.push([100n * e18, 25n * e18]); // [ 100 Token, 25 Token ]
            _nonAccreditedLimitUSD.push(25n * e18); // [ 25 USD ]
            _minimumInvestmentUSD.push(5n);
            _fundRaiseTypes.push([ETH, POLY, DAI]);
            _wallet.push(WALLET.address);
            _treasuryWallet.push(TREASURYWALLET.address);
            _usdToken.push([await I_DaiToken.getAddress()]);

            const config = [
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
                _usdToken[stoId]
            ];

            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            const tx = await I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0, 0, false);
            
            const receipt = await tx.wait();
            console.log(`Gas addModule: ${receipt.gasUsed}`);
            
            const moduleAddedEvent = receipt.logs.map(log => {
                try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModuleAdded');

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent.args._types[0]).to.equal(STOKEY);
            expect(ethers.decodeBytes32String(moduleAddedEvent.args._name).replace(/\u0000/g, '')).to.equal("USDTieredSTO");
            
            I_USDTieredSTO_Array.push(await ethers.getContractAt("USDTieredSTO", moduleAddedEvent.args._module));
            const tokens = await I_USDTieredSTO_Array[I_USDTieredSTO_Array.length - 1].getUsdTokens();
            expect(tokens[0]).to.equal(await I_DaiToken.getAddress());
        });

        it("Should successfully attach the sixth STO module to the security token", async () => {
            const stoId = 5; // Non-divisible token with invalid tier

            _startTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60));
            _endTime.push(BigInt(currentTime) + BigInt(2 * 24 * 60 * 60) + BigInt(100 * 24 * 60 * 60));
            _ratePerTier.push([1n * e18, 1n * e18]); // [ 1 USD/Token, 1 USD/Token ]
            _ratePerTierDiscountPoly.push([1n * e18, 1n * e18]); // [ 1 USD/Token, 1 USD/Token ]
            _tokensPerTierTotal.push([10010n * e16, 50n * e18]); // [ 100.1 Token, 50 Token ]
            _tokensPerTierDiscountPoly.push([0n, 0n]); // [ 0 Token, 0 Token ]
            _nonAccreditedLimitUSD.push(25n * e18); // [ 25 USD ]
            _minimumInvestmentUSD.push(5n);
            _fundRaiseTypes.push([ETH, POLY, DAI]);
            _wallet.push(WALLET.address);
            _treasuryWallet.push(TREASURYWALLET.address);
            _usdToken.push([await I_DaiToken.getAddress()]);

            const config = [
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
                _usdToken[stoId]
            ];

            const stoInterface = new ethers.Interface([functionSignature]);
            const bytesSTO = stoInterface.encodeFunctionData("configure", config);
            const tx = await I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0, 0, false);
            
            const receipt = await tx.wait();
            console.log(`          Gas addModule: ${receipt.gasUsed}`);
            
            const moduleAddedEvent = receipt.logs.map(log => {
                try { return I_SecurityToken.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModuleAdded');

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent.args._types[0]).to.equal(STOKEY);
            expect(ethers.decodeBytes32String(moduleAddedEvent.args._name).replace(/\u0000/g, '')).to.equal("USDTieredSTO");
            
            I_USDTieredSTO_Array.push(await ethers.getContractAt("USDTieredSTO", moduleAddedEvent.args._module));
            const tokens = await I_USDTieredSTO_Array[I_USDTieredSTO_Array.length - 1].getUsdTokens();
            expect(tokens[0]).to.equal(await I_DaiToken.getAddress());
        });

        it("Should fail because rates and tier array of different length", async () => {
            const stoId = 0;
            const stoInterface = new ethers.Interface([functionSignature]);

            const ratePerTier = [10n];
            const ratePerTierDiscountPoly = [10n];
            const tokensPerTierTotal = [10n];
            const tokensPerTierDiscountPoly = [10n];

            const configs = [
            [
                _startTime[stoId],
                _endTime[stoId],
                ratePerTier, // Mismatched length
                _ratePerTierDiscountPoly[stoId],
                _tokensPerTierTotal[stoId],
                _tokensPerTierDiscountPoly[stoId],
                _nonAccreditedLimitUSD[stoId],
                _minimumInvestmentUSD[stoId],
                _fundRaiseTypes[stoId],
                _wallet[stoId],
                _treasuryWallet[stoId],
                _usdToken[stoId]
            ],
            [
                _startTime[stoId],
                _endTime[stoId],
                _ratePerTier[stoId],
                ratePerTierDiscountPoly, // Mismatched length
                _tokensPerTierTotal[stoId],
                _tokensPerTierDiscountPoly[stoId],
                _nonAccreditedLimitUSD[stoId],
                _minimumInvestmentUSD[stoId],
                _fundRaiseTypes[stoId],
                _wallet[stoId],
                _treasuryWallet[stoId],
                _usdToken[stoId]
            ],
            [
                _startTime[stoId],
                _endTime[stoId],
                _ratePerTier[stoId],
                _ratePerTierDiscountPoly[stoId],
                tokensPerTierTotal, // Mismatched length
                _tokensPerTierDiscountPoly[stoId],
                _nonAccreditedLimitUSD[stoId],
                _minimumInvestmentUSD[stoId],
                _fundRaiseTypes[stoId],
                _wallet[stoId],
                _treasuryWallet[stoId],
                _usdToken[stoId]
            ],
            [
                _startTime[stoId],
                _endTime[stoId],
                _ratePerTier[stoId],
                _ratePerTierDiscountPoly[stoId],
                _tokensPerTierTotal[stoId],
                tokensPerTierDiscountPoly, // Mismatched length
                _nonAccreditedLimitUSD[stoId],
                _minimumInvestmentUSD[stoId],
                _fundRaiseTypes[stoId],
                _wallet[stoId],
                _treasuryWallet[stoId],
                _usdToken[stoId]
            ]
            ];

            for (const config of configs) {
            const bytesSTO = stoInterface.encodeFunctionData("configure", config as any);
            await expect(
                I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false)
            ).to.be.reverted;
            }
        });

        it("Should fail because rate of token should be greater than 0", async () => {
            const stoId = 0;
            const stoInterface = new ethers.Interface([functionSignature]);

            const ratePerTier = [10n * e16, 0n];
            const config = [
            _startTime[stoId],
            _endTime[stoId],
            ratePerTier,
            _ratePerTierDiscountPoly[stoId],
            _tokensPerTierTotal[stoId],
            _tokensPerTierDiscountPoly[stoId],
            _nonAccreditedLimitUSD[stoId],
            _minimumInvestmentUSD[stoId],
            _fundRaiseTypes[stoId],
            _wallet[stoId],
            _treasuryWallet[stoId],
            _usdToken[stoId]
            ];
            const bytesSTO = stoInterface.encodeFunctionData("configure", config as any);

            await expect(
            I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false)
            ).to.be.reverted;
        });

        it("Should fail because Zero address is not permitted for wallet", async () => {
            const stoId = 0;
            const stoInterface = new ethers.Interface([functionSignature]);

            const wallet = address_zero;
            const config = [
            _startTime[stoId],
            _endTime[stoId],
            _ratePerTier[stoId],
            _ratePerTierDiscountPoly[stoId],
            _tokensPerTierTotal[stoId],
            _tokensPerTierDiscountPoly[stoId],
            _nonAccreditedLimitUSD[stoId],
            _minimumInvestmentUSD[stoId],
            _fundRaiseTypes[stoId],
            wallet,
            _treasuryWallet[stoId],
            _usdToken[stoId]
            ];
            const bytesSTO = stoInterface.encodeFunctionData("configure", config as any);

            await expect(
            I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false)
            ).to.be.reverted;
        });

        it("Should fail because end time before start time", async () => {
            const stoId = 0;
            const stoInterface = new ethers.Interface([functionSignature]);

            const startTime = BigInt(await latestTime()) + BigInt(35 * 24 * 60 * 60);
            const endTime = BigInt(await latestTime()) + BigInt(1 * 24 * 60 * 60);
            const config = [
            startTime,
            endTime,
            _ratePerTier[stoId],
            _ratePerTierDiscountPoly[stoId],
            _tokensPerTierTotal[stoId],
            _tokensPerTierDiscountPoly[stoId],
            _nonAccreditedLimitUSD[stoId],
            _minimumInvestmentUSD[stoId],
            _fundRaiseTypes[stoId],
            _wallet[stoId],
            _treasuryWallet[stoId],
            _usdToken[stoId]
            ];
            const bytesSTO = stoInterface.encodeFunctionData("configure", config as any);

            await expect(
            I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false)
            ).to.be.reverted;
        });

        it("Should fail because start time is in the past", async () => {
            const stoId = 0;
            const stoInterface = new ethers.Interface([functionSignature]);

            const startTime = BigInt(await latestTime()) - BigInt(35 * 24 * 60 * 60);
            const endTime = startTime + BigInt(50 * 24 * 60 * 60);
            const config = [
            startTime,
            endTime,
            _ratePerTier[stoId],
            _ratePerTierDiscountPoly[stoId],
            _tokensPerTierTotal[stoId],
            _tokensPerTierDiscountPoly[stoId],
            _nonAccreditedLimitUSD[stoId],
            _minimumInvestmentUSD[stoId],
            _fundRaiseTypes[stoId],
            _wallet[stoId],
            _treasuryWallet[stoId],
            _usdToken[stoId]
            ];
            const bytesSTO = stoInterface.encodeFunctionData("configure", config as any);

            await expect(
            I_SecurityToken.connect(ISSUER).addModule(await I_USDTieredSTOFactory.getAddress(), bytesSTO, 0n, 0n, false)
            ).to.be.reverted;
        });
        });

        describe("Test modifying configuration", async () => {
        it("Should not allow unauthorized address to change oracle address", async () => {
            const stoId = 3;
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).modifyOracle(ETH, address_zero)).to.be.reverted;
        });

        it("Should not allow to change oracle address for currencies other than ETH and POLY", async () => {
            const stoId = 3;
            await expect(I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyOracle(DAI, address_zero)).to.be.reverted;
        });

        // // getRate returns transaction
        it("Should allow to change oracle address for ETH", async () => {
            const stoId = 3;
            oldEthRate = await I_USDTieredSTO_Array[stoId].getRate(ETH);
            const I_USDOracle2 = await MockOracleFactory.connect(POLYMATH).deploy(address_zero, ethers.encodeBytes32String("ETH"), ethers.encodeBytes32String("USD"), e18);
            await I_USDOracle2.waitForDeployment();
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyOracle(ETH, I_USDOracle2);
            expect(await I_USDTieredSTO_Array[stoId].getRate.staticCall(ETH)).to.equal(e18);
        });

        // // getRate returns transaction
        it("Should allow to change oracle address for POLY", async () => {
            const stoId = 3;
            oldPolyRate = await I_USDTieredSTO_Array[stoId].getRate(POLY);
            const I_POLYOracle2 = await MockOracleFactory.connect(POLYMATH).deploy(await I_PolyToken.getAddress(), ethers.encodeBytes32String("POLY"), ethers.encodeBytes32String("USD"), e18);
            await I_POLYOracle2.waitForDeployment();
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyOracle(POLY, await I_POLYOracle2.getAddress());
            expect(await I_USDTieredSTO_Array[stoId].getRate.staticCall(POLY)).to.equal(e18);
        });

        // // getRate issue
        it("Should use official oracles when custom oracle is set to 0x0", async () => {
            const stoId = 3;
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyOracle(ETH, address_zero);
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyOracle(POLY, address_zero);

            // OFFICIAL ORACLE NONCE DIFFERENT HERE BECAUSE OF MOCK ORACLE, UNCOMMENT TO CHECK
            // expect(await I_USDTieredSTO_Array[stoId].getRate(ETH)).to.equal(oldEthRate);
            // expect(await I_USDTieredSTO_Array[stoId].getRate(POLY)).to.equal(oldPolyRate);
        });

        it("Should successfully change config before startTime - funding", async () => {
            const stoId = 3;
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyFunding([0]);
            expect(await I_USDTieredSTO_Array[stoId].fundRaiseTypes(0)).to.be.true;
            expect(await I_USDTieredSTO_Array[stoId].fundRaiseTypes(1)).to.be.false;

            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyFunding([1]);
            expect(await I_USDTieredSTO_Array[stoId].fundRaiseTypes(0)).to.be.false;
            expect(await I_USDTieredSTO_Array[stoId].fundRaiseTypes(1)).to.be.true;

            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyFunding([0, 1]);
            expect(await I_USDTieredSTO_Array[stoId].fundRaiseTypes(0)).to.be.true;
            expect(await I_USDTieredSTO_Array[stoId].fundRaiseTypes(1)).to.be.true;
        });

        it("Should successfully change config before startTime - limits and tiers, times, addresses", async () => {
            const stoId = 3;

            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyLimits(1n * e18, 15n * e18);
            expect(await I_USDTieredSTO_Array[stoId].minimumInvestmentUSD()).to.equal(15n * e18);
            expect(await I_USDTieredSTO_Array[stoId].nonAccreditedLimitUSD()).to.equal(1n * e18);

            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyTiers(
            [15n * e18],
            [13n * e18],
            [1500n * e18],
            [1500n * e18]
            );
            const tier = await I_USDTieredSTO_Array[stoId].tiers(0);
            expect(tier[0]).to.equal(15n * e18);
            expect(tier[1]).to.equal(13n * e18);
            expect(tier[2]).to.equal(1500n * e18);
            expect(tier[3]).to.equal(1500n * e18);

            const tempTime1 = BigInt(currentTime) + BigInt(Math.floor(0.1 * 24 * 60 * 60));
            const tempTime2 = BigInt(currentTime) + BigInt(Math.floor(0.2 * 24 * 60 * 60));

            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyTimes(tempTime1, tempTime2);
            expect(await I_USDTieredSTO_Array[stoId].startTime()).to.equal(tempTime1);
            expect(await I_USDTieredSTO_Array[stoId].endTime()).to.equal(tempTime2);
            
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyAddresses(
            "0x0000000000000000000000000400000000000000",
            address_zero,
            [ACCREDITED1.address]
            );
            expect(await I_USDTieredSTO_Array[stoId].wallet()).to.equal("0x0000000000000000000000000400000000000000");
            expect(await I_USDTieredSTO_Array[stoId].treasuryWallet()).to.equal(address_zero);
            
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyAddresses(
            "0x0000000000000000000000000400000000000000",
            TREASURYWALLET.address,
            [ACCREDITED1.address]
            );
            expect((await I_USDTieredSTO_Array[stoId].getUsdTokens())[0]).to.equal(ACCREDITED1.address);
        });

        it("Should fail to change config after endTime", async () => {
            const stoId = 3;

            const snapId = await takeSnapshot();
            await increaseTime(duration.days(1));

            await expect(I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyFunding([0, 1])).to.be.reverted;

            await expect(I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyLimits(15n * e18, 1n * e18)).to.be.reverted;

            await expect(
            I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyTiers(
                [15n * e18],
                [13n * e18],
                [1500n * e18],
                [1500n * e18]
            )
            ).to.be.reverted;

            const tempTime1 = BigInt(await latestTime()) + BigInt(1 * 24 * 60 * 60);
            const tempTime2 = BigInt(await latestTime()) + BigInt(3 * 24 * 60 * 60);

            await expect(I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyTimes(tempTime1, tempTime2)).to.be.reverted;

            await revertToSnapshot(snapId);
        });
        });

    describe("Test buying failure conditions", async () => {
        it("should fail if before STO start time", async () => {
            const stoId = 0;
            const snapId = await takeSnapshot();

            expect(await I_USDTieredSTO_Array[stoId].isOpen()).to.be.false;

            // Whitelist
            const fromTime = await latestTime();
            const toTime = fromTime + duration.days(15);
            const expiryTime = toTime + duration.days(100);

            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true); //set as Accredited
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);

            // Prep for investments
            const investment_ETH = ethers.parseEther("1"); // Invest 1 ETH
            const investment_POLY = ethers.parseEther("10000"); // Invest 10000 POLY
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            const investment_DAI = ethers.parseEther("500"); // Invest 500 DAI
            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);
            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);
            
            // NONACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // NONACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)).to.be.reverted;
            // NONACCREDITED DAI
            //
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, I_DaiToken.target, proof1, ltime, false, InvestorClass.NonUS)).to.be.reverted;
            // ACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // ACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY)).to.be.reverted;
            // ACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS)).to.be.reverted;
            
            await revertToSnapshot(snapId);
        });

        it("should fail if not whitelisted", async () => {
            const stoId = 0;
            const snapId = await takeSnapshot();

            // Advance time to after STO start
            await increaseTime(duration.days(3));

            // Set as accredited
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);

            // Prep for investments
            const investment_ETH = ethers.parseEther("1"); // Invest 1 ETH
            const investment_POLY = ethers.parseEther("10000"); // Invest 10000 POLY
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            const investment_DAI = ethers.parseEther("500"); // Invest 500 DAI
            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);
            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);

            // NONACCREDITED ETH - CHANGED FROM 1 to 2 because of TRM Integration of whitelisting ACCREDITED1 and NONACCREDITED1
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED2).buyWithETH(NONACCREDITED2.address, { value: investment_ETH })).to.be.reverted;
            // NONACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED2).buyWithPOLY(NONACCREDITED2.address, investment_POLY)).to.be.reverted;
            // NONACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED2).buyWithUSD(NONACCREDITED2.address, investment_DAI, await I_DaiToken.getAddress(), proof1, ltime, false, InvestorClass.NonUS)).to.be.reverted;
            // ACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED2).buyWithETH(ACCREDITED2.address, { value: investment_ETH })).to.be.reverted;
            // ACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED2).buyWithPOLY(ACCREDITED2.address, investment_POLY)).to.be.reverted;
            // ACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED2).buyWithUSD(ACCREDITED2.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS)).to.be.reverted;

            await revertToSnapshot(snapId);
        });

        it("should fail if minimumInvestmentUSD not met", async () => {
            const stoId = 0;
            const tierId = 0;
            const snapId = await takeSnapshot();

            // Whitelist
            const fromTime = await latestTime();
            const toTime = fromTime + duration.days(15);
            const expiryTime = toTime + duration.days(100);

            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);

            // Advance time to after STO start
            await increaseTime(duration.days(3));

            const investment_USD = 2n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "USD", "ETH", investment_USD);
            const investment_POLY = await convert(stoId, tierId, false, "USD", "POLY", investment_USD);
            const investment_DAI = investment_USD;

            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);

            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);
            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);

            // NONACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // NONACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)).to.be.reverted;
            // NONACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof1, ltime, false, InvestorClass.NonUS)).to.be.reverted;
            // ACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // ACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY)).to.be.reverted;
            // ACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS)).to.be.reverted;

            await revertToSnapshot(snapId);
        });

        it("should successfully pause the STO and make investments fail, then unpause and succeed", async () => {
            const stoId = 0;
            const snapId = await takeSnapshot();

            // Whitelist
            const fromTime = await latestTime();
            const toTime = fromTime + duration.days(15);
            const expiryTime = toTime + duration.days(100);

            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);

            // Advance time to after STO start
            await increaseTime(duration.days(3));

            // Pause the STO
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).pause();
            expect(await I_USDTieredSTO_Array[stoId].paused()).to.be.true;

            // Prep for investments
            const investment_ETH = ethers.parseEther("1"); // Invest 1 ETH
            const investment_POLY = ethers.parseEther("10000"); // Invest 10000 POLY
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);

            const investment_DAI = ethers.parseEther("500"); // Invest 500 DAI
            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);
            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);

            // NONACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // NONACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)).to.be.reverted;
            // NONACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof1, ltime, false, InvestorClass.NonUS)).to.be.reverted;
            // ACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // ACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY)).to.be.reverted;
            // ACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS)).to.be.reverted;

            // Unpause the STO
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).unpause();
            expect(await I_USDTieredSTO_Array[stoId].paused()).to.be.false;

            await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH });
            await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY);
            await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof1, ltime, false, InvestorClass.NonUS);

            await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH });
            await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY);
            await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS);

            await revertToSnapshot(snapId);
        });

        it("should allow changing stable coin address in middle of STO", async () => {
            const stoId = 0;
            const snapId = await takeSnapshot();

            // Whitelist
            const fromTime = BigInt(await latestTime());
            const toTime = fromTime + BigInt(duration.days(15));
            const expiryTime = toTime + BigInt(duration.days(100));

            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);

            // Advance time to after STO start
            await increaseTime(duration.days(3));

            // Prep for investments
            const investment_DAI = ethers.parseEther("500"); // Invest 500 DAI
            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);
            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);

            // Make sure buying works before changing
            await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof1, ltime, false, InvestorClass.NonUS);

            // Change Stable coin address
            const I_DaiToken2 = await PolyTokenFaucetFactory.connect(POLYMATH).deploy();
            await I_DaiToken2.waitForDeployment();
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyAddresses(WALLET.address, TREASURYWALLET.address, [await I_DaiToken2.getAddress()]);

            // NONACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof1, ltime, false, InvestorClass.NonUS)).to.be.reverted;
            // ACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS)).to.be.reverted;

            // Revert stable coin address
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).modifyAddresses(WALLET.address, TREASURYWALLET.address, [await I_DaiToken.getAddress()]);

            // Make sure buying works again
            await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS);

            await revertToSnapshot(snapId);
        });

        it("should fail if after STO end time", async () => {
            const stoId = 3;
            const snapId = await takeSnapshot();

            // Whitelist
            const fromTime = await latestTime();
            const toTime = fromTime + duration.days(15);
            const expiryTime = toTime + duration.days(100);

            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);

            // Advance time to after STO end
            await increaseTime(duration.days(3));

            expect(await I_USDTieredSTO_Array[stoId].isOpen()).to.be.false;

            // Prep for investments
            const investment_ETH = ethers.parseEther("1"); // Invest 1 ETH
            const investment_POLY = ethers.parseEther("10000"); // Invest 10000 POLY
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_POLY);
            const investment_DAI = ethers.parseEther("500"); // Invest 500 DAI
            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);
            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(await I_USDTieredSTO_Array[stoId].getAddress(), investment_DAI);

            // NONACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // NONACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)).to.be.reverted;
            // NONACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof1, ltime, false, InvestorClass.NonUS)).to.be.reverted;
            // ACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // ACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY)).to.be.reverted;
            // ACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, await I_DaiToken.getAddress(), proof2, ltime, true, InvestorClass.NonUS)).to.be.reverted;

            await revertToSnapshot(snapId);
        });

        it("should fail if finalized", async () => {
            const stoId = 0;
            const snapId = await takeSnapshot();

            // Whitelist
            const fromTime = await latestTime();
            const toTime = await latestTime();
            const expiryTime = toTime + duration.days(100);

            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);
            await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(TREASURYWALLET.address, fromTime, toTime, expiryTime);

            // Advance time to after STO start
            await increaseTime(duration.days(3));

            // Finalize STO
            const preBalance = await I_SecurityToken.balanceOf(TREASURYWALLET.address);
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).finalize();
            const postBalance = await I_SecurityToken.balanceOf(TREASURYWALLET.address);
            expect(postBalance).to.be.gt(preBalance);
            expect(await I_USDTieredSTO_Array[stoId].isFinalized()).to.be.true;
            expect(await I_USDTieredSTO_Array[stoId].isOpen()).to.be.false;

            // Attempt to call function again
            await expect(I_USDTieredSTO_Array[stoId].connect(ISSUER).finalize()).to.be.reverted;

            // Prep for investments
            const investment_ETH = ethers.parseEther("1"); // Invest 1 ETH
            const investment_POLY = ethers.parseEther("10000"); // Invest 10000 POLY
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);
            const investment_DAI = ethers.parseEther("500"); // Invest 500 DAI
            const daiAddress = await I_DaiToken.getAddress();
            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(stoAddress, investment_DAI);
            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(stoAddress, investment_DAI);

            // NONACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // NONACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)).to.be.reverted;
            // NONACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, daiAddress, proof1, ltime, false, InvestorClass.NonUS)).to.be.reverted;
            // ACCREDITED ETH
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH })).to.be.reverted;
            // ACCREDITED POLY
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY)).to.be.reverted;
            // ACCREDITED DAI
            await expect(I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, daiAddress, proof2, ltime, true, InvestorClass.NonUS)).to.be.reverted;

            await revertToSnapshot(snapId);
        });
        });

        describe("Prep STO", async () => {
        it("should jump forward to after STO start", async () => {
            const stoId = 0;
            await increaseTime(duration.days(3));
            expect(await I_USDTieredSTO_Array[stoId].isOpen()).to.be.true;
        });

        it("should whitelist ACCREDITED1 and NONACCREDITED1", async () => {
            const fromTime = await latestTime();
            const toTime = fromTime + duration.days(15);
            const expiryTime = toTime + duration.days(100);

            const tx1 = await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(NONACCREDITED1.address, fromTime, toTime, expiryTime);
            const receipt1 = await tx1.wait();
            const kycEvent1 = receipt1.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModifyKYCData');
            expect(kycEvent1.args._investor).to.equal(NONACCREDITED1.address, "Failed in adding the investor in whitelist");

            const tx2 = await I_GeneralTransferManager.connect(ISSUER).modifyKYCData(ACCREDITED1.address, fromTime, toTime, expiryTime);
            const receipt2 = await tx2.wait();
            const kycEvent2 = receipt2.logs.map(log => {
            try { return I_GeneralTransferManager.interface.parseLog(log); } catch { return null; }
            }).find(e => e && e.name === 'ModifyKYCData');
            expect(kycEvent2.args._investor).to.equal(ACCREDITED1.address, "Failed in adding the investor in whitelist");
            
            await I_GeneralTransferManager.connect(ISSUER).modifyInvestorFlag(ACCREDITED1.address, 0, true);
        });
    });

    describe("Buy Tokens with no discount", async () => {
        it("should successfully buy using fallback at tier 0 for NONACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = ethers.parseEther("50"); // Invest 50 Tokens worth
            const investment_USD = await convert(stoId, tierId, false, "TOKEN", "USD", investment_Token);
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = I_USDTieredSTO_Array[stoId].target;
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedUSD = await I_USDTieredSTO_Array[stoId].fundsRaisedUSD();
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            console.log(await ethers.provider.getBalance(NONACCREDITED1), "NONACCREDITED1 before");

            const tx1 = await NONACCREDITED1.sendTransaction({
                to: stoAddress,
                value: investment_ETH,
                data: "0x244423" // Fallback function selector for buyWithETH
            });
            const receipt1 = await tx1.wait();
            console.log(init_TokenSupply, await ethers.provider.getBalance(NONACCREDITED1), "NONACCREDITED1 after");
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`Gas fallback purchase: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            console.log(final_TokenSupply, "final Token Supply");
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedUSD = await I_USDTieredSTO_Array[stoId].fundsRaisedUSD();
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);
            console.log(`Gas final_TokenSupply`, final_TokenSupply);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedUSD).to.equal(init_RaisedUSD + investment_USD, "Raised USD not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_RaisedDAI).to.equal(init_RaisedDAI, "Raised DAI not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");

            // Additional checks on getters
            expect(await I_USDTieredSTO_Array[stoId].investorCount()).to.equal(1, "Investor count not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSold()).to.equal(investment_Token, "getTokensSold not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensMinted()).to.equal(investment_Token, "getTokensMinted not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(ETH)).to.equal(investment_Token, "getTokensSoldForETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(POLY)).to.equal(0n, "getTokensSoldForPOLY not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvestedUSD(NONACCREDITED1.address)).to.equal(investment_USD, "investorInvestedUSD not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(NONACCREDITED1.address, ETH)).to.equal(investment_ETH, "investorInvestedETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(NONACCREDITED1.address, POLY)).to.equal(0n, "investorInvestedPOLY not changed as expected");
        });

        it("should successfully buy using buyWithETH at tier 0 for NONACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas buyWithETH: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_RaisedDAI).to.equal(init_RaisedDAI, "Raised DAI not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithPOLY at tier 0 for NONACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Token);

            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_RaisedDAI).to.equal(init_RaisedDAI, "Raised DAI not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithPOLY at tier 0 for NONACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Token);

            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_RaisedDAI).to.equal(init_RaisedDAI, "Raised DAI not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithUSD at tier 0 for NONACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_DAI = await convert(stoId, tierId, false, "TOKEN", "USD", investment_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const daiAddress = await I_DaiToken.getAddress();
            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(stoAddress, investment_DAI);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorDAIBal = await I_DaiToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);
            const init_WalletDAIBal = await I_DaiToken.balanceOf(WALLET.address);

            // Buy With DAI
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, daiAddress, proof1, ltime, false, InvestorClass.NonUS);
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`Gas buyWithUSD: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorDAIBal = await I_DaiToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);
            const final_WalletDAIBal = await I_DaiToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_InvestorDAIBal).to.equal(init_InvestorDAIBal - investment_DAI, "Investor DAI Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_RaisedDAI).to.equal(init_RaisedDAI + investment_DAI, "Raised DAI not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
            expect(final_WalletDAIBal).to.equal(init_WalletDAIBal + investment_DAI, "Wallet DAI Balance not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].stableCoinsRaised(daiAddress)).to.equal(investment_DAI, "DAI Raised not changed as expected");
        });

        it("should successfully buy using fallback at tier 0 for ACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = ethers.parseEther("50"); // Invest 50 Tokens worth
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await ACCREDITED1.sendTransaction({
                to: stoAddress,
                value: investment_ETH,
                data: "0x244423" // Fallback function selector for buyWithETH
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`Gas fallback purchase: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithETH at tier 0 for ACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas buyWithETH: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithPOLY at tier 0 for ACCREDITED1", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_USD = await convert(stoId, tierId, false, "TOKEN", "USD", investment_Token);
            const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            // Additional checks on getters
            const init_getTokensSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_getTokensMinted = await I_USDTieredSTO_Array[stoId].getTokensMinted();
            const init_getTokensSoldForETH = await I_USDTieredSTO_Array[stoId].getTokensSoldFor(ETH);
            const init_getTokensSoldForPOLY = await I_USDTieredSTO_Array[stoId].getTokensSoldFor(POLY);
            const init_investorInvestedUSD = await I_USDTieredSTO_Array[stoId].investorInvestedUSD(ACCREDITED1.address);
            const init_investorInvestedETH = await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, ETH);
            const init_investorInvestedPOLY = await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");

            // Additional checks on getters
            expect(await I_USDTieredSTO_Array[stoId].investorCount()).to.equal(2, "Investor count not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSold()).to.equal(init_getTokensSold + investment_Token, "getTokensSold not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensMinted()).to.equal(init_getTokensMinted + investment_Token, "getTokensMinted not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(ETH)).to.equal(init_getTokensSoldForETH, "getTokensSoldForETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(POLY)).to.equal(init_getTokensSoldForPOLY + investment_Token, "getTokensSoldForPOLY not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvestedUSD(ACCREDITED1.address)).to.equal(init_investorInvestedUSD + investment_USD, "investorInvestedUSD not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, ETH)).to.equal(init_investorInvestedETH, "investorInvestedETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, POLY)).to.equal(init_investorInvestedPOLY + investment_POLY, "investorInvestedPOLY not changed as expected");
        });

        it("should successfully modify NONACCREDITED cap for NONACCREDITED1", async () => {
            const stoId = 0;
            console.log("Current investment: " + (await I_USDTieredSTO_Array[stoId].investorInvestedUSD(NONACCREDITED1.address)).toString());
            await I_USDTieredSTO_Array[stoId].connect(ISSUER).changeNonAccreditedLimit([NONACCREDITED1.address], [_nonAccreditedLimitUSD[stoId] / 2n]);
            const investorLimit = await I_USDTieredSTO_Array[stoId].nonAccreditedLimitUSDOverride(NONACCREDITED1.address);
            console.log("Current limit: " + investorLimit.toString());
        });

        it("should successfully buy a partial amount and refund balance when reaching NONACCREDITED cap", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_USD = await I_USDTieredSTO_Array[stoId].nonAccreditedLimitUSDOverride(NONACCREDITED1.address);
            const investment_Token = await convert(stoId, tierId, false, "USD", "TOKEN", investment_USD);
            const investment_ETH = await convert(stoId, tierId, false, "USD", "ETH", investment_USD);
            const investment_POLY = await convert(stoId, tierId, false, "USD", "POLY", investment_USD);

            const refund_USD = await I_USDTieredSTO_Array[stoId].investorInvestedUSD(NONACCREDITED1.address);
            const refund_Token = await convert(stoId, tierId, false, "USD", "TOKEN", refund_USD);
            const refund_ETH = await convert(stoId, tierId, false, "USD", "ETH", refund_USD);
            const refund_POLY = await convert(stoId, tierId, false, "USD", "POLY", refund_USD);

            console.log("Expected refund in tokens: " + refund_Token.toString());

            const snap = await takeSnapshot();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();

            let init_TokenSupply = await I_SecurityToken.totalSupply();
            let init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            let init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            let init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            let init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            let init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            let init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            let init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            let init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            let init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            let init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy with ETH
            const tx1 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas buyWithETH: ${receipt1.gasUsed}`);

            let final_TokenSupply = await I_SecurityToken.totalSupply();
            let final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            let final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            let final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            let final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            let final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            let final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            let final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            let final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            let final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            let final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token - refund_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token - refund_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH + refund_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token - refund_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH - refund_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH - refund_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");

            await revertToSnapshot(snap);

            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            init_TokenSupply = await I_SecurityToken.totalSupply();
            init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            final_TokenSupply = await I_SecurityToken.totalSupply();
            final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token - refund_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token - refund_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY + refund_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token - refund_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY - refund_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY - refund_POLY, "Wallet POLY Balance not changed as expected");
        });

        it("should fail and revert when NONACCREDITED cap reached", async () => {
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);
            const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH,  })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)
            ).to.be.reverted;
        });

        it("should fail and revert despite oracle price change when NONACCREDITED cap reached", async () => {
            const stoId = 0;

            // set new exchange rates
            const high_USDETH = 1000n * e18; // 1000 USD per ETH
            const high_USDPOLY = 50n * e16; // 0.5 USD per POLY
            const low_USDETH = 250n * e18; // 250 USD per ETH
            const low_USDPOLY = 20n * e16; // 0.2 USD per POLY

            const investment_USD = ethers.parseEther("50"); // USD
            const investment_ETH_high = (investment_USD * e18) / high_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_high = (investment_USD * e18) / high_USDPOLY; // USD / USD/POLY = POLY
            const investment_ETH_low = (investment_USD * e18) / low_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_low = (investment_USD * e18) / low_USDPOLY; // USD / USD/POLY = POLY

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY_low, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY_low);

            // Change exchange rates up
            await I_USDOracle.connect(POLYMATH).changePrice(high_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(high_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
                value: investment_ETH_high,
                
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_high)
            ).to.be.reverted;

            // Change exchange rates down
            await I_USDOracle.connect(POLYMATH).changePrice(low_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(low_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
                value: investment_ETH_low,
                
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_low)
            ).to.be.reverted;

            // Reset exchange rates
            await I_USDOracle.connect(POLYMATH).changePrice(USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(USDPOLY);
        });


        it("should successfully buy across tiers for NONACCREDITED ETH", async () => {
            const stoId = 1;
            const startTier = 0;
            const endTier = 1;

            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(startTier, "currentTier not changed as expected");

            const delta_Token = 5n * e18;
            const ethTier0 = await convert(stoId, startTier, false, "TOKEN", "ETH", delta_Token);
            const ethTier1 = await convert(stoId, endTier, false, "TOKEN", "ETH", delta_Token);

            const investment_Token = delta_Token + delta_Token; // 10 Token
            const investment_ETH = ethTier0 + ethTier1; // 0.0025 ETH

            // Process investment
            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas buyWithETH: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");

            // Additional Checks
            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(endTier, "currentTier not changed as expected");
        });

        it("should successfully buy across tiers for NONACCREDITED POLY", async () => {
            const stoId = 1;
            const startTier = 1;
            const endTier = 2;

            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(startTier, "currentTier not changed as expected");

            const delta_Token = 5n * e18; // Token
            const polyTier0 = await convert(stoId, startTier, false, "TOKEN", "POLY", delta_Token);
            const polyTier1 = await convert(stoId, endTier, false, "TOKEN", "POLY", delta_Token);

            const investment_Token = delta_Token + delta_Token; // 10 Token
            const investment_POLY = polyTier0 + polyTier1; // 0.0025 ETH

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            // Process investment
            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx2 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");

            // Additional Checks
            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(endTier, "currentTier not changed as expected");
        });

        it("should successfully buy across tiers for ACCREDITED ETH", async () => {
            const stoId = 1;
            const startTier = 2;
            const endTier = 3;

            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(startTier, "currentTier not changed as expected");

            const delta_Token = 5n * e18; // Token
            const ethTier0 = await convert(stoId, startTier, false, "TOKEN", "ETH", delta_Token);
            const ethTier1 = await convert(stoId, endTier, false, "TOKEN", "ETH", delta_Token);

            const investment_Token = delta_Token + delta_Token; // 10 Token
            const investment_ETH = ethTier0 + ethTier1; // 0.0025 ETH

            // Process investment
            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas buyWithETH: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");

            // Additional Checks
            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(endTier, "currentTier not changed as expected");
        });

        it("should successfully buy across tiers for ACCREDITED DAI", async () => {
            const stoId = 1;
            const startTier = 3;
            const endTier = 4;

            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(startTier, "currentTier not changed as expected");

            const delta_Token = 5n * e18; // Token
            const daiTier0 = await convert(stoId, startTier, false, "TOKEN", "USD", delta_Token);
            const daiTier1 = await convert(stoId, endTier, false, "TOKEN", "USD", delta_Token);

            const investment_Token = delta_Token + delta_Token; // 10 Token
            const investment_DAI = daiTier0 + daiTier1;
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const daiAddress = await I_DaiToken.getAddress();

            await I_DaiToken.getTokens(investment_DAI, ACCREDITED1.address);
            await I_DaiToken.connect(ACCREDITED1).approve(stoAddress, investment_DAI);

            // Process investment
            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_InvestorDAIBal = await I_DaiToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);
            const init_WalletDAIBal = await I_DaiToken.balanceOf(WALLET.address);

            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, daiAddress, proof2, ltime, true, InvestorClass.NonUS);
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithUSD: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_InvestorDAIBal = await I_DaiToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);
            const final_WalletDAIBal = await I_DaiToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_InvestorDAIBal).to.equal(init_InvestorDAIBal - investment_DAI, "Investor DAI Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_RaisedDAI).to.equal(init_RaisedDAI + investment_DAI, "Raised DAI not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
            expect(final_WalletDAIBal).to.equal(init_WalletDAIBal + investment_DAI, "Wallet DAI Balance not changed as expected");

            // Additional Checks
            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(endTier, "currentTier not changed as expected");
        });

        it("should successfully buy across tiers for ACCREDITED POLY", async () => {
            const stoId = 1;
            const startTier = 4;
            const endTier = 5;

            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(startTier, "currentTier not changed as expected");

            const delta_Token = 5n * e18; // Token
            const polyTier0 = await convert(stoId, startTier, false, "TOKEN", "POLY", delta_Token);
            const polyTier1 = await convert(stoId, endTier, false, "TOKEN", "POLY", delta_Token);

            const investment_Token = delta_Token + delta_Token; // 10 Token
            const investment_POLY = polyTier0 + polyTier1;

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            // Process investment
            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");

            // Additional Checks
            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(endTier, "currentTier not changed as expected");
        });

        it("should buy out the rest of the sto", async () => {
            const stoId = 1;
            const tierId = 5;

            const tierData = await I_USDTieredSTO_Array[stoId].tiers(tierId);
            const minted = tierData[4];
            console.log(minted.toString() + ":" + _tokensPerTierTotal[stoId][tierId]);
            const investment_Token = _tokensPerTierTotal[stoId][tierId] - minted;
            console.log(investment_Token.toString());
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();

            const tx = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt = await tx.wait();
            console.log(`          Gas buyWithETH: ${receipt.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            // expect(await I_USDTieredSTO_Array[1].getTokensMinted()).to.equal(_tokensPerTierTotal[1].reduce((a, b) => a + b, 0n), "STO Token Sold not changed as expected");
        });

        it("should fail and revert when all tiers sold out", async () => {
            const stoId = 1;
            const tierId = 4;

            const investment_Token = 5n * e18;
            const investment_USD = await convert(stoId, tierId, false, "TOKEN", "USD", investment_Token);
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);
            const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Token);
            const investment_DAI = investment_USD;

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const daiAddress = await I_DaiToken.getAddress();

            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            await I_DaiToken.getTokens(investment_DAI, NONACCREDITED1.address);
            await I_DaiToken.connect(NONACCREDITED1).approve(stoAddress, investment_DAI);

            expect(await I_USDTieredSTO_Array[stoId].isOpen()).to.be.false;

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH,  })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)
            ).to.be.reverted;

            // Buy with DAI NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithUSD(NONACCREDITED1.address, investment_DAI, daiAddress, proof1, ltime, false, InvestorClass.NonUS)
            ).to.be.reverted;

            // Buy with ETH ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH,  })
            ).to.be.reverted;

            // Buy with POLY ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY)
            ).to.be.reverted;

            // Buy with DAI ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithUSD(ACCREDITED1.address, investment_DAI, daiAddress, proof2, ltime, true, InvestorClass.NonUS)
            ).to.be.reverted;
        });

        it("should fail and revert when all tiers sold out despite oracle price change", async () => {
            const stoId = 1;

            // set new exchange rates
            const high_USDETH = 1000n * e18; // 1000 USD per ETH
            const high_USDPOLY = 50n * e16; // 0.5 USD per POLY
            const low_USDETH = 250n * e18; // 250 USD per ETH
            const low_USDPOLY = 20n * e16; // 0.2 USD per POLY

            const investment_USD = ethers.parseEther("50"); // USD
            const investment_ETH_high = (investment_USD * e18) / high_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_high = (investment_USD * e18) / high_USDPOLY; // USD / USD/POLY = POLY
            const investment_ETH_low = (investment_USD * e18) / low_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_low = (investment_USD * e18) / low_USDPOLY; // USD / USD/POLY = POLY

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY_low, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY_low);
            await I_PolyToken.getTokens(investment_POLY_low, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY_low);

            // Change exchange rates up
            await I_USDOracle.connect(POLYMATH).changePrice(high_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(high_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
                value: investment_ETH_high,
                
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_high)
            ).to.be.reverted;

            // Buy with ETH ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH_high,  })
            ).to.be.reverted;

            // Buy with POLY ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY_high)
            ).to.be.reverted;

            // Change exchange rates down
            await I_USDOracle.connect(POLYMATH).changePrice(low_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(low_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
                value: investment_ETH_low,
                
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_low)
            ).to.be.reverted;

            // Buy with ETH ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH_low,  })
            ).to.be.reverted;

            // Buy with POLY ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY_low)
            ).to.be.reverted;

            // Reset exchange rates
            await I_USDOracle.connect(POLYMATH).changePrice(USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(USDPOLY);
        });
    });

    describe("Buy Tokens with POLY discount", async () => {
        it("should successfully buy using fallback at tier 0 for NONACCREDITED1", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_Token = 5n * e18;
            const investment_USD = await convert(stoId, tierId, false, "TOKEN", "USD", investment_Token);
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedUSD = await I_USDTieredSTO_Array[stoId].fundsRaisedUSD();
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            console.log({
                init_TokenSupply: init_TokenSupply.toString(),
                init_InvestorTokenBal: init_InvestorTokenBal.toString(),
                init_InvestorETHBal: init_InvestorETHBal.toString(),
                init_InvestorPOLYBal: init_InvestorPOLYBal.toString(),
                init_STOTokenSold: init_STOTokenSold.toString(),
                stoAddress,
                init_STOETHBal: init_STOETHBal.toString(),
                init_STOPOLYBal: init_STOPOLYBal.toString(),
                init_RaisedUSD: init_RaisedUSD.toString(),
                init_RaisedETH: init_RaisedETH.toString(),
                init_RaisedPOLY: init_RaisedPOLY.toString(),
                init_WalletETHBal: init_WalletETHBal.toString(),
                init_WalletPOLYBal: init_WalletPOLYBal.toString(),
            }, "Buy Tokens with POLY discount");

            const tx1 = await NONACCREDITED1.sendTransaction({
                to: stoAddress,
                value: investment_ETH,
                data: "0xdedbb0d0",
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`Gas fallback purchase: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedUSD = await I_USDTieredSTO_Array[stoId].fundsRaisedUSD();
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedUSD).to.equal(init_RaisedUSD + investment_USD, "Raised USD not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");

            // Additional checks on getters
            expect(await I_USDTieredSTO_Array[stoId].investorCount()).to.equal(1, "Investor count not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSold()).to.equal(investment_Token, "getTokensSold not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensMinted()).to.equal(investment_Token, "getTokensMinted not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(ETH)).to.equal(investment_Token, "getTokensSoldForETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(POLY)).to.equal(0n, "getTokensSoldForPOLY not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvestedUSD(NONACCREDITED1.address)).to.equal(investment_USD, "investorInvestedUSD not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(NONACCREDITED1.address, ETH)).to.equal(investment_ETH, "investorInvestedETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(NONACCREDITED1.address, POLY)).to.equal(0n, "investorInvestedPOLY not changed as expected");
        });

        it("should successfully buy using buyWithETH at tier 0 for NONACCREDITED1", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_Token = 5n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas buyWithETH: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithPOLY at tier 0 for NONACCREDITED1", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_Token = 5n * e18;
            const investment_POLY = await convert(stoId, tierId, true, "TOKEN", "POLY", investment_Token);

            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using fallback at tier 0 for ACCREDITED1", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_Token = 5n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await ACCREDITED1.sendTransaction({
            to: stoAddress,
            value: investment_ETH,
            data: "0xdedbb0d0",
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas fallback purchase: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithETH at tier 0 for ACCREDITED1", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_Token = 5n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx1 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, {
            value: investment_ETH,
            
            });
            const receipt1 = await tx1.wait();
            const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
            console.log(`          Gas buyWithETH: ${receipt1.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost1 - investment_ETH, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal + investment_ETH, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy using buyWithPOLY at tier 0 for ACCREDITED1", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_Token = 5n * e18;
            const investment_USD = await convert(stoId, tierId, true, "TOKEN", "USD", investment_Token);
            const investment_POLY = await convert(stoId, tierId, true, "TOKEN", "POLY", investment_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            // Additional checks on getters
            const init_getTokensSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_getTokensMinted = await I_USDTieredSTO_Array[stoId].getTokensMinted();
            const init_getTokensSoldForETH = await I_USDTieredSTO_Array[stoId].getTokensSoldFor(ETH);
            const init_getTokensSoldForPOLY = await I_USDTieredSTO_Array[stoId].getTokensSoldFor(POLY);
            const init_investorInvestedUSD = await I_USDTieredSTO_Array[stoId].investorInvestedUSD(ACCREDITED1.address);
            const init_investorInvestedETH = await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, ETH);
            const init_investorInvestedPOLY = await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");

            // Additional checks on getters
            expect(await I_USDTieredSTO_Array[stoId].investorCount()).to.equal(2, "Investor count not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSold()).to.equal(init_getTokensSold + investment_Token, "getTokensSold not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensMinted()).to.equal(init_getTokensMinted + investment_Token, "getTokensMinted not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(ETH)).to.equal(init_getTokensSoldForETH, "getTokensSoldForETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].getTokensSoldFor(POLY)).to.equal(init_getTokensSoldForPOLY + investment_Token, "getTokensSoldForPOLY not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvestedUSD(ACCREDITED1.address)).to.equal(init_investorInvestedUSD + investment_USD, "investorInvestedUSD not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, ETH)).to.equal(init_investorInvestedETH, "investorInvestedETH not changed as expected");
            expect(await I_USDTieredSTO_Array[stoId].investorInvested(ACCREDITED1.address, POLY)).to.equal(init_investorInvestedPOLY + investment_POLY, "investorInvestedPOLY not changed as expected");
        });

        it("should successfully buy a partial amount and refund balance when reaching NONACCREDITED cap", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_USD = _nonAccreditedLimitUSD[stoId];
            const investment_Token = await convert(stoId, tierId, true, "USD", "TOKEN", investment_USD);
            const investment_POLY = await convert(stoId, tierId, true, "USD", "POLY", investment_Token);

            const refund_USD = await I_USDTieredSTO_Array[stoId].investorInvestedUSD(NONACCREDITED1.address);
            const refund_Token = await convert(stoId, tierId, true, "USD", "TOKEN", refund_USD);
            const refund_POLY = await convert(stoId, tierId, true, "USD", "POLY", refund_USD);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(NONACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(NONACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(NONACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token - refund_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token - refund_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            // expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY + refund_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token - refund_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            // expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY - refund_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            // expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY - refund_POLY, "Wallet POLY Balance not changed as expected");
        });

        it("should successfully buy a granular amount and refund balance when buying indivisible token with POLY", async () => {
            await I_SecurityToken.connect(ISSUER).changeGranularity(e18);
            const stoId = 4;
            const tierId = 0;
            const investment_Tokens = 1050n * e16;
            const investment_POLY = await convert(stoId, tierId, true, "TOKEN", "POLY", investment_Tokens);

            const refund_Tokens = 50n * e16;
            const refund_POLY = await convert(stoId, tierId, true, "TOKEN", "POLY", refund_Tokens);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tokensToMint = (await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY.staticCall(ACCREDITED1.address, investment_POLY))[2];

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Tokens - refund_Tokens, "Token Supply not changed as expected");
            expect(tokensToMint).to.equal(investment_Tokens - refund_Tokens, "View function returned incorrect data");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Tokens - refund_Tokens, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY + refund_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Tokens - refund_Tokens, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY - refund_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY - refund_POLY, "Wallet POLY Balance not changed as expected");
            await I_SecurityToken.connect(ISSUER).changeGranularity(1n);
        });

        it("should successfully buy a granular amount when buying indivisible token with illegal tier limits", async () => {
        await I_SecurityToken.connect(ISSUER).changeGranularity(e18);
        const stoId = 5;
        const tierId = 0;
        const investment_Tokens = 110n * e18;
        const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Tokens);

        const refund_Tokens = 0n;
        const refund_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", refund_Tokens);

        const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
        await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
        await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

        const init_TokenSupply = await I_SecurityToken.totalSupply();
        const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
        const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
        const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
        const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
        const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
        const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
        const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
        const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
        const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
        const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

        const tokensToMint = (await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY.staticCall(ACCREDITED1.address, investment_POLY))[2];

        // Buy With POLY
        const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
        
        });
        const receipt2 = await tx2.wait();
        const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
        console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

        const final_TokenSupply = await I_SecurityToken.totalSupply();
        const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
        const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
        const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
        const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
        const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
        const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
        const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
        const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
        const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
        const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

        expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Tokens - refund_Tokens, "Token Supply not changed as expected");
        expect(tokensToMint).to.equal(investment_Tokens - refund_Tokens, "View function returned incorrect data");
        expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Tokens - refund_Tokens, "Investor Token Balance not changed as expected");
        expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
        expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY + refund_POLY, "Investor POLY Balance not changed as expected");
        expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Tokens - refund_Tokens, "STO Token Sold not changed as expected");
        expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
        expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
        expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
        expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY - refund_POLY, "Raised POLY not changed as expected");
        expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
        expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY - refund_POLY, "Wallet POLY Balance not changed as expected");
        await I_SecurityToken.connect(ISSUER).changeGranularity(1n);
        });

        it("should successfully buy a granular amount and refund balance when buying indivisible token with ETH", async () => {
        await I_SecurityToken.connect(ISSUER).changeGranularity(e18);
        const stoId = 4;
        const tierId = 0;
        const investment_Tokens = 1050n * e16;
        const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Tokens);
        const refund_Tokens = 50n * e16;
        const refund_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", refund_Tokens);

        const init_TokenSupply = await I_SecurityToken.totalSupply();
        const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
        const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
        const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
        const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
        const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
        const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
        const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
        const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);

        // Buy With ETH
        const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, {
        value: investment_ETH,
        
        });
        const receipt2 = await tx2.wait();
        const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
        console.log(`          Gas buyWithETH: ${receipt2.gasUsed}`);

        const final_TokenSupply = await I_SecurityToken.totalSupply();
        const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
        const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
        const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
        const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
        const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
        const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
        const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);

        expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Tokens - refund_Tokens, "Token Supply not changed as expected");
        expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Tokens - refund_Tokens, "Investor Token Balance not changed as expected");
        expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - investment_ETH - gasCost2 + refund_ETH, "Investor ETH Balance not changed as expected");
        expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Tokens - refund_Tokens, "STO Token Sold not changed as expected");
        expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
        expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
        expect(final_RaisedETH).to.equal(init_RaisedETH + investment_ETH - refund_ETH, "Raised ETH not changed as expected");
        expect(final_RaisedPOLY).to.equal(init_RaisedPOLY, "Raised POLY not changed as expected");
        await I_SecurityToken.connect(ISSUER).changeGranularity(1n);
        });

        it("should fail and revert when NONACCREDITED cap reached", async () => {
            const stoId = 2;
            const tierId = 0;

            const investment_Token = 5n * e18;
            const investment_ETH = await convert(stoId, tierId, true, "TOKEN", "ETH", investment_Token);
            const investment_POLY = await convert(stoId, tierId, true, "TOKEN", "POLY", investment_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)
            ).to.be.reverted;
        });

        it("should fail when rate set by contract is too low", async () => {
            const stoId = 4;
            const tierId = 0;
            const investment_Tokens = 1n * e18;
            const investment_POLY = await convert(stoId, tierId, true, "TOKEN", "POLY", investment_Tokens);
            const investment_ETH = await convert(stoId, tierId, true, "TOKEN", "ETH", investment_Tokens);
            const minTokens = 1000n * e18;

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            // Buy With POLY
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLYRateLimited(ACCREDITED1.address, investment_POLY, minTokens)
            ).to.be.reverted;
            
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETHRateLimited(ACCREDITED1.address, minTokens, {
            value: investment_ETH
            })
            ).to.be.reverted;
        });

        it("should fail and revert despite oracle price change when NONACCREDITED cap reached", async () => {
            const stoId = 2;
            const tierId = 0;

            // set new exchange rates
            const high_USDETH = 1000n * e18; // 1000 USD per ETH
            const high_USDPOLY = 50n * e16; // 0.5 USD per POLY
            const low_USDETH = 250n * e18; // 250 USD per ETH
            const low_USDPOLY = 20n * e16; // 0.2 USD per POLY

            const investment_Token = 5n * e18;
            const investment_USD = await convert(stoId, tierId, true, "TOKEN", "USD", investment_Token);

            const investment_ETH_high = (investment_USD * e18) / high_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_high = (investment_USD * e18) / high_USDPOLY; // USD / USD/POLY = POLY
            const investment_ETH_low = (investment_USD * e18) / low_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_low = (investment_USD * e18) / low_USDPOLY; // USD / USD/POLY = POLY

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY_low, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY_low);

            // Change exchange rates up
            await I_USDOracle.connect(POLYMATH).changePrice(high_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(high_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
            value: investment_ETH_high
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_high)
            ).to.be.reverted;

            // Change exchange rates down
            await I_USDOracle.connect(POLYMATH).changePrice(low_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(low_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
            value: investment_ETH_low
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_low)
            ).to.be.reverted;

            // Reset exchange rates
            await I_USDOracle.connect(POLYMATH).changePrice(USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(USDPOLY);
        });

        it("should successfully buy across tiers for POLY", async () => {
            const stoId = 2;
            const startTier = 0;
            const endTier = 1;

            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(startTier, "currentTier not changed as expected");

            const delta_Token = 5n * e18; // Token
            const polyTier0 = await convert(stoId, startTier, true, "TOKEN", "POLY", delta_Token);
            const polyTier1 = await convert(stoId, endTier, true, "TOKEN", "POLY", delta_Token);
            const investment_Token = delta_Token + delta_Token; // 10 Token
            const investment_POLY = polyTier0 + polyTier1;

            const tierData = await I_USDTieredSTO_Array[stoId].tiers(startTier);
            const tokensRemaining = tierData[2] - tierData[4];
            const prep_Token = tokensRemaining - delta_Token;
            const prep_POLY = await convert(stoId, startTier, true, "TOKEN", "POLY", prep_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(prep_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, prep_POLY);
            const tx = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, prep_POLY);
            const receipt = await tx.wait();
            console.log(`          Gas buyWithPOLY: ${receipt.gasUsed}`);

            const newTierData = await I_USDTieredSTO_Array[stoId].tiers(startTier);
            const Tier0Token = newTierData[2];
            const Tier0Minted = newTierData[4];
            expect(Tier0Minted).to.equal(Tier0Token - delta_Token);

            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            // Process investment
            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");

            // Additional Checks
            expect(await I_USDTieredSTO_Array[stoId].currentTier()).to.equal(endTier, "currentTier not changed as expected");
        });

        it("should successfully buy across the discount cap", async () => {
            const stoId = 2;
            const tierId = 1;

            const discount_Token = 20n * e18;
            const discount_POLY = await convert(stoId, tierId, true, "TOKEN", "POLY", discount_Token);

            const regular_Token = 10n * e18;
            const regular_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", regular_Token);

            const investment_Token = discount_Token + regular_Token;
            const investment_POLY = discount_POLY + regular_POLY;

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(ACCREDITED1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_WalletETHBal = await ethers.provider.getBalance(WALLET.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(WALLET.address);

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_InvestorETHBal).to.equal(init_InvestorETHBal - gasCost2, "Investor ETH Balance not changed as expected");
            expect(final_InvestorPOLYBal).to.equal(init_InvestorPOLYBal - investment_POLY, "Investor POLY Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
            expect(final_STOETHBal).to.equal(init_STOETHBal, "STO ETH Balance not changed as expected");
            expect(final_STOPOLYBal).to.equal(init_STOPOLYBal, "STO POLY Balance not changed as expected");
            expect(final_RaisedETH).to.equal(init_RaisedETH, "Raised ETH not changed as expected");
            expect(final_RaisedPOLY).to.equal(init_RaisedPOLY + investment_POLY, "Raised POLY not changed as expected");
            expect(final_WalletETHBal).to.equal(init_WalletETHBal, "Wallet ETH Balance not changed as expected");
            expect(final_WalletPOLYBal).to.equal(init_WalletPOLYBal + investment_POLY, "Wallet POLY Balance not changed as expected");
        });

        it("should buy out the rest of the sto", async () => {
            const stoId = 2;
            const tierId = 1;

            const minted = (await I_USDTieredSTO_Array[stoId].tiers(tierId))[4];
            const investment_Token = _tokensPerTierTotal[stoId][tierId] - minted;
            const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();

            // Buy With POLY
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY, {
            
            });
            const receipt2 = await tx2.wait();
            console.log(`          Gas buyWithPOLY: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(ACCREDITED1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();

            expect(final_TokenSupply).to.equal(init_TokenSupply + investment_Token, "Token Supply not changed as expected");
            expect(final_InvestorTokenBal).to.equal(init_InvestorTokenBal + investment_Token, "Investor Token Balance not changed as expected");
            expect(final_STOTokenSold).to.equal(init_STOTokenSold + investment_Token, "STO Token Sold not changed as expected");
        });

        it("should fail and revert when all tiers sold out", async () => {
            const stoId = 2;
            const tierId = 1;

            const investment_Token = 5n * e18;
            const investment_ETH = await convert(stoId, tierId, false, "TOKEN", "ETH", investment_Token);
            const investment_POLY = await convert(stoId, tierId, false, "TOKEN", "POLY", investment_Token);

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY);

            expect(await I_USDTieredSTO_Array[stoId].isOpen()).to.be.false;

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, { value: investment_ETH,  })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY)
            ).to.be.reverted;

            // Buy with ETH ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH,  })
            ).to.be.reverted;

            // Buy with POLY ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY)
            ).to.be.reverted;
        });

        it("should fail and revert when all tiers sold out despite oracle price change", async () => {
            const stoId = 2;
            const tierId = 1;

            // set new exchange rates
            const high_USDETH = 1000n * e18; // 1000 USD per ETH
            const high_USDPOLY = 50n * e16; // 0.5 USD per POLY
            const low_USDETH = 250n * e18; // 250 USD per ETH
            const low_USDPOLY = 20n * e16; // 0.2 USD per POLY

            const investment_Token = 5n * e18;
            const investment_USD = await convert(stoId, tierId, true, "TOKEN", "USD", investment_Token);

            const investment_ETH_high = (investment_USD * e18) / high_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_high = (investment_USD * e18) / high_USDPOLY; // USD / USD/POLY = POLY
            const investment_ETH_low = (investment_USD * e18) / low_USDETH; // USD / USD/ETH = ETH
            const investment_POLY_low = (investment_USD * e18) / low_USDPOLY; // USD / USD/POLY = POLY

            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            await I_PolyToken.getTokens(investment_POLY_low, NONACCREDITED1.address);
            await I_PolyToken.connect(NONACCREDITED1).approve(stoAddress, investment_POLY_low);
            await I_PolyToken.getTokens(investment_POLY_low, ACCREDITED1.address);
            await I_PolyToken.connect(ACCREDITED1).approve(stoAddress, investment_POLY_low);

            // Change exchange rates up
            await I_USDOracle.connect(POLYMATH).changePrice(high_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(high_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
                value: investment_ETH_high,
                
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_high)
            ).to.be.reverted;

            // Buy with ETH ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH_high,  })
            ).to.be.reverted;

            // Buy with POLY ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY_high)
            ).to.be.reverted;

            // Change exchange rates down
            await I_USDOracle.connect(POLYMATH).changePrice(low_USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(low_USDPOLY);

            // Buy with ETH NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithETH(NONACCREDITED1.address, {
                value: investment_ETH_low,
                
            })
            ).to.be.reverted;

            // Buy with POLY NONACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(NONACCREDITED1).buyWithPOLY(NONACCREDITED1.address, investment_POLY_low)
            ).to.be.reverted;

            // Buy with ETH ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithETH(ACCREDITED1.address, { value: investment_ETH_low,  })
            ).to.be.reverted;

            // Buy with POLY ACCREDITED
            await expect(
            I_USDTieredSTO_Array[stoId].connect(ACCREDITED1).buyWithPOLY(ACCREDITED1.address, investment_POLY_low)
            ).to.be.reverted;

            // Reset exchange rates
            await I_USDOracle.connect(POLYMATH).changePrice(USDETH);
            await I_POLYOracle.connect(POLYMATH).changePrice(USDPOLY);
        });
    });

    describe("Test getter functions", async () => {
        describe("Generic", async () => {
            it("should get the right number of investors", async () => {
                expect(await I_USDTieredSTO_Array[0].investorCount()).to.equal(2n);
                expect(await I_USDTieredSTO_Array[1].investorCount()).to.equal(2n);
                expect(await I_USDTieredSTO_Array[2].investorCount()).to.equal(2n);
            });

            it("should get the right amounts invested", async () => {
                expect(await I_USDTieredSTO_Array[0].fundsRaised(ETH)).to.equal(await I_USDTieredSTO_Array[0].getRaised(ETH));
                expect(await I_USDTieredSTO_Array[0].fundsRaised(POLY)).to.equal(await I_USDTieredSTO_Array[0].getRaised(POLY));
                expect(await I_USDTieredSTO_Array[0].fundsRaisedUSD()).to.be.gt(0n);
            });

            it("should return minted tokens in a tier", async () => {
                const totalMinted = await I_USDTieredSTO_Array[0].getTokensSoldByTier(0);
                const individualMinted = await I_USDTieredSTO_Array[0].getTokensMintedByTier(0);
                expect(totalMinted).to.equal(individualMinted[0] + individualMinted[1] + individualMinted[2]);
            });

            it("should return correct tokens sold in token details", async () => {
                const tokensSold = await I_USDTieredSTO_Array[0].getTokensSold();
                const tokenDetails = await I_USDTieredSTO_Array[0].getSTODetails();
                expect(tokensSold).to.equal(tokenDetails[7]);
            });
        });

        describe("convertToUSD", async () => {
            it("should reset exchange rates", async () => {
                // Reset exchange rates
                await I_USDOracle.connect(POLYMATH).changePrice(USDETH);
                await I_POLYOracle.connect(POLYMATH).changePrice(USDPOLY);
            });

            it("should get the right conversion for ETH to USD", async () => {
                // 20 ETH to 10000 USD
                const ethInWei = ethers.parseEther("20");
                const usdInWei = await I_USDTieredSTO_Array[0].convertToUSD.staticCall(ETH, ethInWei);
                expect(usdInWei).to.equal((ethInWei * USDETH) / e18);
            });

            it("should get the right conversion for POLY to USD", async () => {
                // 40000 POLY to 10000 USD
                const polyInWei = ethers.parseEther("40000");
                const usdInWei = await I_USDTieredSTO_Array[0].convertToUSD.staticCall(POLY, polyInWei);
                expect(usdInWei).to.equal((polyInWei * USDPOLY) / e18);
            });
        });

        describe("convertFromUSD", async () => {
            it("should get the right conversion for USD to ETH", async () => {
                // 10000 USD to 20 ETH
                const usdInWei = ethers.parseEther("10000");
                const ethInWei = await I_USDTieredSTO_Array[0].convertFromUSD.staticCall(ETH, usdInWei);
                expect(ethInWei).to.equal((usdInWei * e18) / USDETH);
            });

            it("should get the right conversion for USD to POLY", async () => {
                // 10000 USD to 40000 POLY
                const usdInWei = ethers.parseEther("10000");
                const polyInWei = await I_USDTieredSTO_Array[0].convertFromUSD.staticCall(POLY, usdInWei);
                expect(polyInWei).to.equal((usdInWei * e18) / USDPOLY);
            });
        });
    });

    describe("Test cases for the USDTieredSTOFactory", async () => {
        it("should get the exact details of the factory", async () => {
            expect(await I_USDTieredSTOFactory.setupCost()).to.equal(BigInt(STOSetupCost));
            expect((await I_USDTieredSTOFactory.getTypes())[0]).to.equal(3n);
            expect(ethers.decodeBytes32String(await I_USDTieredSTOFactory.name()).replace(/\u0000/g, '')).to.equal("USDTieredSTO");
            // PASSING_CASE: WITH HIDDEN CHARACTERS FAILING IT. UNCOMMENT TO TEST
            // expect(await I_USDTieredSTOFactory.description()).to.equal(
            //     "It allows both accredited and non-accredited investors to contribute into the STO. Non-accredited investors will be capped at a maximum investment limit (as a default or specific to their jurisdiction). Tokens will be sold according to tiers sequentially & each tier has its own price and volume of tokens to sell. Upon receipt of funds (ETH, POLY or DAI), security tokens will automatically transfer to investor’s wallet address"
            // );
            expect(await I_USDTieredSTOFactory.title()).to.equal("USD Tiered STO");
            expect(await I_USDTieredSTOFactory.version()).to.equal("3.0.0");
            const tags = await I_USDTieredSTOFactory.getTags();
            expect(ethers.decodeBytes32String(tags[0]).replace(/\u0000/g, '')).to.equal("Tiered");
            expect(ethers.decodeBytes32String(tags[1]).replace(/\u0000/g, '')).to.equal("ETH");
            expect(ethers.decodeBytes32String(tags[2]).replace(/\u0000/g, '')).to.equal("POLY");
            expect(ethers.decodeBytes32String(tags[3]).replace(/\u0000/g, '')).to.equal("USD");
            expect(ethers.decodeBytes32String(tags[4]).replace(/\u0000/g, '')).to.equal("STO");
        });
    });
});
