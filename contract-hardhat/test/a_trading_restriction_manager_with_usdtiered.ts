import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory, LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { deployERC20DividendAndVerifyed, deployGPMAndVerifyed, deployUSDTieredSTOAndVerified, setUpPolymathNetwork } from "./helpers/createInstances";
import { initializeContracts } from "../scripts/polymath-deploy";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { time } from "@nomicfoundation/hardhat-network-helpers";

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
import { encodeModuleCall } from "./helpers/encodeCall";

describe("Trading restriction Manager", function() {
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
    const dividendName = "0x546573744469766964656e640000000000000000000000000000000000000000";

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
    let I_TradingRestrictionManager: any;
    let I_DaiToken: any;
    let PolyTokenFaucetFactory: any;
    let I_USDTieredSTOFactory: any;
    let P_USDTieredSTOFactory: any;
    let I_ERC20DividendCheckpointFactory: any;
    let I_ERC20DividendCheckpoint: any;

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
    let I_USDTieredSTO_Array: Contract[] = [];

    let ETH = 0;
    let POLY = 1;
    let DAI = 2;

    // Module key
    const TMKEY = 2;
    const STOKEY = 3;
    let snapId: string;
    const address_zero = "0x0000000000000000000000000000000000000000";
    const one_address = "0x0000000000000000000000000000000000000001";

    // Initial fee for ticker registry and security token registry
    let REGFEE: bigint;
    const STOSetupCost = 0;

    let e18: bigint;
    let e16: bigint;

    // MockOracle USD prices
    let USDETH: bigint; // 500 USD/ETH
    let USDPOLY: bigint; // 0.25 USD/POLY

    const DividendParameters = ["address"];
    const checkpointKey = 4;

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

    before(async () => {

        await initializeContracts();
        // Get signers
        accounts = await ethers.getSigners();
                
        // Accounts setup
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        token_owner = account_issuer;
        account_controller = accounts[3];
        account_investor1 = accounts[6];
        account_investor2 = accounts[7];
        account_investor3 = accounts[8];
        account_investor4 = accounts[9];

        e18 = 10n ** 18n;
        e16 = 10n ** 16n;
        
        fromTime = await latestTime();
        toTime = await latestTime();
        expiryTime = toTime + duration.days(15);

        ltime = await latestTime() + duration.days(300);
        isAccredited1 = false;
        isAccredited2 = true;

        const values = [
            [account_investor1.address, ltime, false],
            [account_investor2.address, ltime, true],
            [account_investor3.address, ltime, true],
            [account_investor4.address, ltime, false]
        ];

        merkleTree = StandardMerkleTree.of(values, ["address", "uint64", "bool"]);
        merkleRoot = merkleTree.root;

        // Get proofs
        for (const [i, v] of merkleTree.entries()) {
            if (v[0] === account_investor1.address) {
                proof1 = merkleTree.getProof(i);
            }
            if (v[0] === account_investor2.address) {
                proof2 = merkleTree.getProof(i);
            }
            if (v[0] === account_investor3.address) {
                proof3 = merkleTree.getProof(i);
            }
            if (v[0] === account_investor4.address) {
                proof4 = merkleTree.getProof(i);
            }
        }

        GeneralTransferManager = await ethers.getContractFactory("GeneralTransferManager");
        PolyTokenFaucetFactory = await ethers.getContractFactory("PolyTokenFaucet");


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
            I_STGetter,
            I_TradingRestrictionManager,
        ] = instances;

        I_DaiToken = await PolyTokenFaucetFactory.connect(account_polymath).deploy();
        await I_DaiToken.waitForDeployment();
        
        // STEP 4: Deploy the GeneralDelegateManagerFactory
        [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(account_polymath.address, I_MRProxied, 0);

        // STEP 5: Deploy the USDTieredSTOFactory
        [I_USDTieredSTOFactory] = await deployUSDTieredSTOAndVerified(account_polymath.address, I_MRProxied, STOSetupCost);
        [P_USDTieredSTOFactory] = await deployUSDTieredSTOAndVerified(account_polymath.address, I_MRProxied, ethers.parseEther("500"));

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
        ModuleRegistryProxy:               ${I_ModuleRegistryProxy.target}
        ModuleRegistry:                    ${I_ModuleRegistry.target}
        FeatureRegistry:                   ${I_FeatureRegistry.target}

        STFactory:                         ${I_STFactory.target}
        GeneralTransferManagerFactory:     ${I_GeneralTransferManagerFactory.target}
        TradingRestrictionManager:         ${I_TradingRestrictionManager.target}
        USDTieredSTOFactory:               ${I_USDTieredSTOFactory.target}
        ERC20DividendCheckpointFactory:    ${I_ERC20DividendCheckpointFactory.target}
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

            I_GeneralTransferManager = GeneralTransferManager.attach(moduleData[0]);
        });

        it("Should successfully attach the first STO module to the security token", async () => {
            const stoId = 0; // No discount

            _startTime.push(BigInt(await latestTime() + duration.days(1)));
            _endTime.push(BigInt(ltime) + BigInt(duration.days(30)));
            _ratePerTier.push([10n * e16, 15n * e16]); // [ 0.10 USD/Token, 0.15 USD/Token ]
            _ratePerTierDiscountPoly.push([10n * e16, 15n * e16]); // [ 0.10 USD/Token, 0.15 USD/Token ]
            _tokensPerTierTotal.push([100000000n * e18, 200000000n * e18]); // [ 100m Token, 200m Token ]
            _tokensPerTierDiscountPoly.push([0n, 0n]); // [ 0, 0 ]
            _nonAccreditedLimitUSD.push(10000n * e18); // 10k USD
            _minimumInvestmentUSD.push(5n * e18); // 5 USD
            _fundRaiseTypes.push([ETH, POLY, DAI]);
            _wallet.push(account_issuer.address);
            _treasuryWallet.push(account_issuer.address);
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
            const tx = await I_SecurityToken.connect(token_owner).addModule(I_USDTieredSTOFactory.target, bytesSTO, 0n, 0n, false);
            
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

        it("should set trading restriction manager", async () => { 
            const tx = await I_GeneralTransferManager.connect(token_owner).setTradingRestrictionManager(I_TradingRestrictionManager.target);

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
            await I_TradingRestrictionManager.connect(account_polymath).grantOperator(token_owner.address);
            expect(await I_TradingRestrictionManager.isOperator(token_owner.address)).to.equal(true);
        });

        it("should whitelist three investors", async () => {
            const tx = await I_TradingRestrictionManager.connect(token_owner).modifyKYCData(merkleRoot);

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
                I_TradingRestrictionManager.connect(account_investor1).verifyInvestor(
                proof1,
                account_investor1.address,
                ltime,
                isAccredited1,
                InvestorClass.NonUS
            )
            ).to.not.be.reverted;
        });

        it("Should verify investor 2 correctly", async () => {
            await expect(
                I_TradingRestrictionManager.connect(account_investor2).verifyInvestor(
                proof2,
                account_investor2.address,
                ltime,
                isAccredited2,
                InvestorClass.NonUS
            )
            ).to.not.be.reverted;
        });

        it("Should verify investor 3 correctly", async () => {
            await expect(
                I_TradingRestrictionManager.connect(account_investor3).verifyInvestor(
                proof3,
                account_investor3.address,
                ltime,
                isAccredited2,
                InvestorClass.US
            )
            ).to.not.be.reverted;
        });

        it("Should verify investor 4 correctly", async () => {
            await expect(
                I_TradingRestrictionManager.connect(account_investor4).verifyInvestor(
                proof4,
                account_investor4.address,
                ltime,
                false,
                InvestorClass.US
            )
            ).to.not.be.reverted;
        });

        it("should successfully buy using buyWithUSD at tier 0 for NONACCREDITED account_investor1", async () => {
            await ethers.provider.send("evm_increaseTime", [duration.days(1)]);
            const stoId = 0;
            const tierId = 0;

            const investment_Token = 50n * e18;
            const investment_DAI = await convert(stoId, tierId, false, "TOKEN", "USD", investment_Token);
            
            const stoAddress = await I_USDTieredSTO_Array[stoId].getAddress();
            const daiAddress = await I_DaiToken.getAddress();
            await I_DaiToken.getTokens(investment_DAI, account_investor1.address);
            await I_DaiToken.connect(account_investor1).approve(stoAddress, investment_DAI);

            const init_TokenSupply = await I_SecurityToken.totalSupply();
            const init_InvestorTokenBal = await I_SecurityToken.balanceOf(account_investor1.address);
            const init_InvestorETHBal = await ethers.provider.getBalance(account_investor1.address);
            const init_InvestorPOLYBal = await I_PolyToken.balanceOf(account_investor1.address);
            const init_InvestorDAIBal = await I_DaiToken.balanceOf(account_investor1.address);
            const init_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const init_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const init_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const init_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const init_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const init_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const init_WalletETHBal = await ethers.provider.getBalance(account_issuer.address);
            const init_WalletPOLYBal = await I_PolyToken.balanceOf(account_issuer.address);
            const init_WalletDAIBal = await I_DaiToken.balanceOf(account_issuer.address);

            // Buy With DAI
            const tx2 = await I_USDTieredSTO_Array[stoId].connect(account_investor1).buyWithUSD(account_investor1.address, investment_DAI, daiAddress, proof1, ltime, isAccredited1, InvestorClass.NonUS);
            const receipt2 = await tx2.wait();
            const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
            console.log(`Gas buyWithUSD: ${receipt2.gasUsed}`);

            const final_TokenSupply = await I_SecurityToken.totalSupply();
            const final_InvestorTokenBal = await I_SecurityToken.balanceOf(account_investor1.address);
            const final_InvestorETHBal = await ethers.provider.getBalance(account_investor1.address);
            const final_InvestorPOLYBal = await I_PolyToken.balanceOf(account_investor1.address);
            const final_InvestorDAIBal = await I_DaiToken.balanceOf(account_investor1.address);
            const final_STOTokenSold = await I_USDTieredSTO_Array[stoId].getTokensSold();
            const final_STOETHBal = await ethers.provider.getBalance(stoAddress);
            const final_STOPOLYBal = await I_PolyToken.balanceOf(stoAddress);
            const final_RaisedETH = await I_USDTieredSTO_Array[stoId].fundsRaised(ETH);
            const final_RaisedPOLY = await I_USDTieredSTO_Array[stoId].fundsRaised(POLY);
            const final_RaisedDAI = await I_USDTieredSTO_Array[stoId].fundsRaised(DAI);
            const final_WalletETHBal = await ethers.provider.getBalance(account_issuer.address);
            const final_WalletPOLYBal = await I_PolyToken.balanceOf(account_issuer.address);
            const final_WalletDAIBal = await I_DaiToken.balanceOf(account_issuer.address);

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

        it("Create new dividend", async () => {
            const maturity = (await latestTime());
            const expiry = (await latestTime()) + duration.days(10);
            await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, ethers.parseEther("1.5"));
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
            expect(dividendDepositedEvent!.args._checkpointId).to.equal(1n);
        });

        // it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint", async () => {
        //     const investor1Balance = await I_PolyToken.balanceOf(account_investor1.address);
        //     await I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(0, 0n, 10);
        //     const investor1BalanceAfter = await I_PolyToken.balanceOf(account_investor1.address);
        //     expect(investor1BalanceAfter - investor1Balance).to.equal(ethers.parseEther("1.5"));

        //     const dividendData = await I_ERC20DividendCheckpoint.dividends(0);
        //     expect(dividendData.claimedAmount).to.equal(ethers.parseEther("1.5"));
        // });

        it("distribute initial tokens to investors", async () => {
            const amount = ethers.parseEther("100");
            await I_SecurityToken.connect(token_owner).issue(account_investor1.address, amount, "0x");
            await I_SecurityToken.connect(token_owner).issue(account_investor2.address, amount, "0x");
            await I_SecurityToken.connect(token_owner).issue(account_investor3.address, amount, "0x");
            
            console.log(amount, " tokens issued to investors", await I_SecurityToken.balanceOf(account_investor1.address));
            
            expect(await I_SecurityToken.balanceOf(account_investor1.address)).to.equal(amount + ethers.parseEther("50")); // 50 from buyWithUSD
            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(amount);
            expect(await I_SecurityToken.balanceOf(account_investor3.address)).to.equal(amount);

            console.log("Investor 1 balance: ", await I_SecurityToken.balanceOf(account_investor1.address));
            console.log("Investor 2 balance: ", await I_SecurityToken.balanceOf(account_investor2.address));
            console.log("Investor 3 balance: ", await I_SecurityToken.balanceOf(account_investor3.address));

            expect(await I_TradingRestrictionManager.connect(account_polymath).setWhitelistOnlyTrading(I_SecurityToken.target, true)).to.emit(
                I_TradingRestrictionManager,
                "WhitelistOnlyTradingUpdated"
            ).withArgs(I_SecurityToken.target, true);
        });

        /**
         * Test Case 3:
         * If non US tokens are no longer restricted the owners can trade them within non-US investors pool.
         * They cannot be sent to US investors unless US trading restrictions period also expired for these tokens.
        */
        it("Test Case 3: Should allow trading between non-US investors after non-US restriction expires, but not to US investors", async function () {
            const nonUSPeriod = 90 * ONE_DAY_IN_SECONDS; // 90 days
            const usPeriod = 180 * ONE_DAY_IN_SECONDS; // 180 days
            const lockStartTime = await time.latest();

            // --- Set Trading Restrictions (unified start time for all investors - part of Test Case 4) ---
            await I_TradingRestrictionManager.connect(account_polymath).setTradingRestrictionPeriod(await I_SecurityToken.getAddress(), nonUSPeriod, usPeriod, lockStartTime);
            await I_TradingRestrictionManager.connect(account_polymath).setWhitelistOnlyTrading(await I_SecurityToken.getAddress(), true);

            // --- Fast-forward time to be after non-US period, but before US period ---
            await time.increaseTo(lockStartTime + nonUSPeriod + ONE_DAY_IN_SECONDS);

            // --- Verify non-US to non-US transfer is successful ---
            const amount = ethers.parseEther("10");
            await expect(I_SecurityToken.connect(account_investor1).transfer(account_investor2.address, amount))
                .to.emit(I_SecurityToken, "Transfer")
                .withArgs(account_investor1.address, account_investor2.address, amount);
            
            expect(await I_SecurityToken.balanceOf(account_investor2.address)).to.equal(amount + ethers.parseEther("100"));

            // --- Verify non-US to US transfer fails ---
            await expect(I_SecurityToken.connect(account_investor1).transfer(account_investor3.address, amount))
                .to.be.reverted;
        });
        
        /**
         * Test Case 4 & 5:
         * 4. Trading restriction period starts from the moment when the issuance/sale concluded for all investors.
         * 5. After both US and non US token restrictions expire, tokens can be traded freely between US and non-US investors,
         * but still cannot be sent to an unwhitelisted wallet address.
         */
        it("Test Cases 4 & 5: Should enforce a unified lock start time and allow free trade between whitelisted investors post-restriction, but block unwhitelisted transfers", async function () {
            const nonUSPeriod = 90 * ONE_DAY_IN_SECONDS;
            const usPeriod = 180 * ONE_DAY_IN_SECONDS;
            const lockStartTime = await time.latest();

            // --- Set Trading Restrictions (Test Case 4: Unified Start Time) ---
            // The lockStartTime is a single timestamp for the token, demonstrating the rule.
            await I_TradingRestrictionManager.connect(account_polymath).setTradingRestrictionPeriod(await I_SecurityToken.getAddress(), nonUSPeriod, usPeriod, lockStartTime);
            await I_TradingRestrictionManager.connect(account_polymath).setWhitelistOnlyTrading(await I_SecurityToken.getAddress(), true); // Enforce whitelist (Test Case 5)

            // --- Fast-forward time past ALL restriction periods ---
            await time.increaseTo(lockStartTime + usPeriod + ONE_DAY_IN_SECONDS);
            
            const amount = ethers.parseEther("10");

            // --- Verify non-US to US transfer is NOW successful ---
            await expect(I_SecurityToken.connect(account_investor1).transfer(account_investor3.address, amount))
                .to.emit(I_SecurityToken, "Transfer");

            // --- Verify US to non-US transfer is ALSO successful ---
            await expect(I_SecurityToken.connect(account_investor3).transfer(account_investor1.address, amount))
                .to.emit(I_SecurityToken, "Transfer");

            // --- Verify transfer TO an unwhitelisted address fails (Test Case 5) ---
            await expect(I_SecurityToken.connect(account_investor1).transfer(token_owner.address, amount))
                .to.be.reverted;
                
            // --- Verify transfer FROM an unwhitelisted address fails ---
            await expect(I_SecurityToken.connect(token_owner).transfer(account_investor1.address, amount))
                 .to.be.reverted;
        });
    });
});