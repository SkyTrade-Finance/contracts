import { expect } from "chai";
import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { setUpPolymathNetwork, deployERC20DividendAndVerifyed, deployUSDTieredSTOAndVerified } from "./helpers/createInstances";
import { encodeModuleCall, generateMerkleRootSignature } from "./helpers/encodeCall";
import { TOKEN_CONFIG, MODULE_KEYS, FEE_CONSTANTS, COMMON_ADDRESSES, InvestorClass } from "./helpers/testConstants";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

// NOTE: This test is designed to stress dividend math at scale without exceeding block gas limits.
// It supports very large holder counts by batching KYC / issuance and by using batched dividend push.
// Default holder count is kept modest for local runs but can be increased via env var MASS_HOLDERS.

describe("Mass dividend stress test (ERC20)", function () {
    let account_polymath: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let wallet: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    let I_PolymathRegistry: any;
    let I_PolyToken: any;
    let I_MRProxied: any;
    let I_STRProxied: any;
    let I_STGetter: any;
    let I_SecurityToken: any;
    let I_ERC20DividendCheckpoint: any;
    let I_ERC20DividendCheckpointFactory: any;
    let I_USDTieredSTOFactory: any;
    let I_USDTieredSTO: any;
    let I_DaiToken: any;
    let I_TradingRestrictionManager: any;

    const name = TOKEN_CONFIG.name;
    const symbol = TOKEN_CONFIG.symbol;
    const tokenDetails = TOKEN_CONFIG.tokenDetails;
    // Using MODULE_KEYS directly where needed
    const initRegFee = FEE_CONSTANTS.INIT_REG_FEE;
    const address_zero = COMMON_ADDRESSES.ZERO;

    const DividendParameters = ["address"]; // wallet address
    const STOFunctionSignature = {
        name: "configure",
        type: "function",
        inputs: [
            { type: "uint256", name: "_startTime" },
            { type: "uint256", name: "_endTime" },
            { type: "uint256[]", name: "_ratePerTier" },
            { type: "uint256[]", name: "_ratePerTierDiscountPoly" },
            { type: "uint256[]", name: "_tokensPerTier" },
            { type: "uint256[]", name: "_tokensPerTierDiscountPoly" },
            { type: "uint256", name: "_nonAccreditedLimitUSD" },
            { type: "uint256", name: "_minimumInvestmentUSD" },
            { type: "uint8[]", name: "_fundRaiseTypes" },
            { type: "address", name: "_wallet" },
            { type: "address", name: "_treasuryWallet" },
            { type: "address[]", name: "_usdTokens" }
        ]
    };

    // Configurable scale
    const DEFAULT_HOLDERS = 2000; // safe default for local runs; increase via env MASS_HOLDERS
    const MASS_HOLDERS = process.env.MASS_HOLDERS ? parseInt(process.env.MASS_HOLDERS) : DEFAULT_HOLDERS;
    const HOLDERS = Math.max(10, MASS_HOLDERS);

    // Token distribution skew: mix of small and large holders
    // We'll give a repeating pattern of amounts to simulate varied sizes.
    const HOLDER_PATTERN = [
        ethers.parseEther("1"),
        ethers.parseEther("2"),
        ethers.parseEther("5"),
        ethers.parseEther("10"),
        ethers.parseEther("20")
    ];

    before(async () => {
        accounts = await ethers.getSigners();
        account_polymath = accounts[0];
        token_owner = accounts[1];
        wallet = accounts[3];

        const instances = await setUpPolymathNetwork(account_polymath.address, token_owner.address);
        [
            I_PolymathRegistry,
            I_PolyToken,
            ,
            ,
            ,
            I_MRProxied,
            ,
            ,
            ,
            ,
            I_STRProxied,
            ,
            I_STGetter,
            I_TradingRestrictionManager
        ] = instances;

        // Register ticker and generate ST
        await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFee);
        await (await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbol)).wait();
        const genTx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(
            name,
            symbol,
            tokenDetails,
            false,
            token_owner.address,
            0
        );
        const genRcpt = await genTx.wait();
        let stAddress = address_zero;
        for (const log of genRcpt!.logs) {
            try {
                const parsed = I_STRProxied.interface.parseLog(log);
                if (parsed && parsed.name === "NewSecurityToken") {
                    stAddress = parsed.args._securityTokenAddress;
                    break;
                }
            } catch {}
        }
        expect(stAddress).to.not.equal(address_zero);
        I_SecurityToken = await ethers.getContractAt("SecurityToken", stAddress);
        I_STGetter = await ethers.getContractAt("STGetter", stAddress);

        // Locate GTM auto module (deferred to where it's actually needed)

        // Attach ERC20DividendCheckpoint
        const [ERC20DivFactory] = await deployERC20DividendAndVerifyed(account_polymath.address, I_MRProxied, 0n);
        I_ERC20DividendCheckpointFactory = ERC20DivFactory;
        const bytesDividend = encodeModuleCall(DividendParameters, [address_zero]);
        const addTx = await I_SecurityToken.connect(token_owner).addModule(
            I_ERC20DividendCheckpointFactory.target,
            bytesDividend,
            0n,
            0n,
            false
        );
        const addRcpt = await addTx.wait();
        let divModule = address_zero;
        for (const log of addRcpt!.logs) {
            try {
                const parsed = I_SecurityToken.interface.parseLog(log);
                if (parsed && parsed.name === "ModuleAdded") {
                    const moduleName = ethers.decodeBytes32String(parsed.args._name).replace(/\u0000/g, "");
                    if (moduleName === "ERC20DividendCheckpoint") {
                        divModule = parsed.args._module;
                        break;
                    }
                }
            } catch {}
        }
        expect(divModule).to.not.equal(address_zero);
        I_ERC20DividendCheckpoint = await ethers.getContractAt("ERC20DividendCheckpoint", divModule);

        // Deploy a mock USD token (DAI-like) and attach USDTieredSTO
        const PolyTokenFaucetFactory = await ethers.getContractFactory("PolyTokenFaucet");
        I_DaiToken = await PolyTokenFaucetFactory.deploy();
        await I_DaiToken.waitForDeployment();

        const [USDTieredFactory] = await deployUSDTieredSTOAndVerified(account_polymath.address, I_MRProxied, 0n);
        I_USDTieredSTOFactory = USDTieredFactory;

        const nowTs = await latestTime();
        const startTime = BigInt(nowTs + duration.days(1));
        const endTime = BigInt(nowTs + duration.days(30));
        const e18 = 10n ** 18n;
        const tierPriceUSD = 1n * e18; // 1 USD per token
        const totalTokensForSale = BigInt(HOLDERS) * 25n * e18; // ample supply
        const ratePerTier = [tierPriceUSD];
        const ratePerTierDiscountPoly = [tierPriceUSD];
        const tokensPerTier = [totalTokensForSale];
        const tokensPerTierDiscountPoly = [0n];
        const nonAccreditedLimitUSD = 10_000n * e18;
        const minimumInvestmentUSD = 1n * e18;
        const fundRaiseTypes = [2]; // SC only
        const walletAddr = token_owner.address;
        const treasuryAddr = token_owner.address;
        const usdTokens = [await I_DaiToken.getAddress()];

        const stoInterface = new ethers.Interface([STOFunctionSignature]);
        const bytesSTO = stoInterface.encodeFunctionData("configure", [
            startTime,
            endTime,
            ratePerTier,
            ratePerTierDiscountPoly,
            tokensPerTier,
            tokensPerTierDiscountPoly,
            nonAccreditedLimitUSD,
            minimumInvestmentUSD,
            fundRaiseTypes,
            walletAddr,
            treasuryAddr,
            usdTokens
        ]);

        const addStoTx = await I_SecurityToken.connect(token_owner).addModule(
            I_USDTieredSTOFactory.target,
            bytesSTO,
            0n,
            0n,
            false
        );
        const addStoRcpt = await addStoTx.wait();
        let stoModule = address_zero;
        for (const log of addStoRcpt!.logs) {
            try {
                const parsed = I_SecurityToken.interface.parseLog(log);
                if (parsed && parsed.name === "ModuleAdded") {
                    const moduleName = ethers.decodeBytes32String(parsed.args._name).replace(/\u0000/g, "");
                    if (moduleName === "USDTieredSTO") {
                        stoModule = parsed.args._module;
                        break;
                    }
                }
            } catch {}
        }
        expect(stoModule).to.not.equal(address_zero);
        I_USDTieredSTO = await ethers.getContractAt("USDTieredSTO", stoModule);

        // Register TradingRestrictionManager so buyWithUSD can verify and whitelist investors automatically
        await I_PolymathRegistry.changeAddress("TradingRestrictionManager", I_TradingRestrictionManager.target);
        // Grant operator permissions to issuer for signing merkle-root updates used by buyWithUSD
        await I_TradingRestrictionManager.connect(account_polymath).grantOperator(token_owner.address);
    });

    it("Buy via STO (USD) for many holders (STO handles whitelisting)", async () => {
        // Build synthetic investor list (EOAs). Use deterministic dummy addresses beyond available signers.
        const investorAddresses: string[] = [];
        const amounts: bigint[] = [];
        const now = BigInt(await latestTime());

        const signersPool = accounts.slice(10); // leave early signers for control
        const signerCount = signersPool.length;

        for (let i = 0; i < HOLDERS; i++) {
            if (i < signerCount) {
                investorAddresses.push(signersPool[i].address);
            } else {
                // Create deterministic pseudo addresses for storage-only tracking; KYC + issuance require non-zero address
                investorAddresses.push(ethers.getAddress(`0x${(i + 1000).toString(16).padStart(40, '0')}`));
            }
            amounts.push(HOLDER_PATTERN[i % HOLDER_PATTERN.length]);
        }

        // No separate KYC: rely on STO buyWithUSD to whitelist beneficiaries

        // Build Merkle tree for TRM verification (address, ltime, isAccredited, investorClass)
        const ltime = Number(now) + duration.days(300);
        const values: any[] = investorAddresses.map(addr => [addr, ltime, false, InvestorClass.NonUS]);
        const tree = StandardMerkleTree.of(values, ["address", "uint64", "bool", "uint64"]);
        const root = tree.root;
        const expiry = Number(now) + duration.days(30);
        const signa = await generateMerkleRootSignature(token_owner, root, expiry);
        const proofMap = new Map<string, string[]>();
        for (const [i, v] of tree.entries()) {
            proofMap.set(v[0], tree.getProof(i));
        }

        // Move to STO start time and allow beneficial investments (issuer buys on behalf of beneficiaries)
        await network.provider.send("evm_increaseTime", [duration.days(1) + 10]);
        await network.provider.send("evm_mine");
        await (await I_USDTieredSTO.connect(token_owner).changeAllowBeneficialInvestments(true)).wait();

        // Pre-fund issuer with enough DAI and approve STO once
        const totalUSDNeeded = amounts.reduce((a, b) => a + b, 0n); // 1 USD per token
        await I_DaiToken.getTokens(totalUSDNeeded, token_owner.address);
        await I_DaiToken.connect(token_owner).approve(await I_USDTieredSTO.getAddress(), totalUSDNeeded);

        // Buy tokens for each investor using USD stable coin (TRM path via buyWithUSD)
        for (let i = 0; i < HOLDERS; i++) {
            const beneficiary = investorAddresses[i];
            const investUSD = amounts[i];
            await (await I_USDTieredSTO.connect(token_owner).buyWithUSD(
                beneficiary,
                investUSD,
                await I_DaiToken.getAddress(),
                proofMap.get(beneficiary) || [],
                ltime,
                false,
                InvestorClass.NonUS,
                root,
                expiry,
                signa,
                0,
                0,
                "0x"
            )).wait();
        }

        // Quick sanity: total supply equals sum(amounts)
        const expectedTotal = amounts.reduce((a, b) => a + b, 0n);
        const totalSupply = await I_SecurityToken.totalSupply();
        expect(totalSupply).to.equal(expectedTotal);
    });

    it("First dividend over checkpoint, validate proportionality", async () => {
        const maturity = (await latestTime()) + duration.hours(1);
        const expiry = (await latestTime()) + duration.days(7);

        // Fund dividend with POLY and approve
        const dividendAmount = ethers.parseEther("1000000"); // 1M POLY
        await I_PolyToken.connect(token_owner).getTokens(dividendAmount, token_owner.address);
        await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, dividendAmount);

        const tx = await I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
            maturity,
            expiry,
            I_PolyToken.target,
            dividendAmount,
            ethers.encodeBytes32String("DIV1")
        );
        await tx.wait();

        // Advance time to maturity
        await network.provider.send("evm_increaseTime", [duration.hours(2)]);
        await network.provider.send("evm_mine");

        // Push in batches using indexes of the investor array in the datastore
        // We don't know investor array length directly; approximate using HOLDERS
        // Use smaller batches to avoid block gas limit at higher holder counts
        const stride = 100;
        for (let start = 0; start < HOLDERS + 1; start += stride) {
            const end = Math.min(start + stride - 1, HOLDERS + 1);
            await (await I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(0, BigInt(start), BigInt(end))).wait();
        }

        // Validate per-holder sample only for smaller runs to avoid heavy view calls
        if (HOLDERS <= 300) {
            const sample = accounts.slice(10, Math.min(20 + 10, accounts.length));
            const [investors, , , , amountsClaimed] = await I_ERC20DividendCheckpoint.getDividendProgress(0);
            const claimedMap = new Map<string, bigint>();
            for (let i = 0; i < investors.length; i++) {
                claimedMap.set(investors[i].toLowerCase(), amountsClaimed[i]);
            }
            const totalSupply = await I_STGetter.totalSupplyAt(1);
            for (const s of sample) {
                const bal = await I_STGetter.balanceOfAt(s.address, 1);
                const expected = bal * dividendAmount / totalSupply;
                const got = claimedMap.get(s.address.toLowerCase()) || 0n;
                expect(got).to.equal(expected);
            }
        } else {
            const div0 = await I_ERC20DividendCheckpoint.dividends(0);
            expect(div0.claimedAmount).to.be.at.most(dividendAmount);
            const dust0 = dividendAmount - div0.claimedAmount;
            expect(dust0).to.be.at.most(BigInt(HOLDERS));
        }
    });

    it("Transfers between holders, second dividend with withholding and exclusions", async () => {
        // Perform a wave of transfers among the first N signers to change the distribution
        const movers = accounts.slice(10, Math.min(110, accounts.length));
        const granularity: bigint = await I_SecurityToken.granularity();
        // Relax TRM for test: disable whitelist-only trading and set zero lock periods
        await I_TradingRestrictionManager.connect(account_polymath).setWhitelistOnlyTrading(await I_SecurityToken.getAddress(), false);
        await I_TradingRestrictionManager.connect(account_polymath).setTradingRestrictionPeriod(await I_SecurityToken.getAddress(), 0, 0, 0);
        // Whitelist movers with future expiry to satisfy GTM checks, then transfer among them
        const nowTs = await latestTime();
        const expiryTs = BigInt(nowTs + duration.days(365));
        const sendAfter = BigInt(0);
        const recvAfter = BigInt(0);
        const gtmModuleData = await I_STGetter.getModulesByType(MODULE_KEYS.TRANSFER_MANAGER);
        const I_GTM = await ethers.getContractAt("GeneralTransferManager", gtmModuleData[0]);
        // Temporarily disable KYC and lock checks for general transfers to allow stress transfer wave
        await (await I_GTM.connect(token_owner).modifyTransferRequirements(0, false, false, false, false)).wait();
        await (await I_GTM.connect(token_owner).modifyKYCDataMulti(
            movers.map(m => m.address),
            new Array(movers.length).fill(sendAfter),
            new Array(movers.length).fill(recvAfter),
            new Array(movers.length).fill(expiryTs)
        )).wait();

        for (let i = 0; i + 1 < movers.length; i += 2) {
            const from = movers[i];
            const to = movers[i + 1];
            const bal = await I_SecurityToken.balanceOf(from.address);
            if (bal > 0n) {
                let send = bal / 2n;
                if (granularity > 1n) send = send - (send % granularity);
                if (send > 0n) await (await I_SecurityToken.connect(from).transfer(to.address, send)).wait();
            }
        }

        // Set some withholding for a subset and exclude a few accounts
        const wAddrs = movers.slice(0, Math.min(5, movers.length)).map(s => s.address);
        const wRates = new Array(wAddrs.length).fill(BigInt(20 * 10 ** 16)); // 20%
        await (await I_ERC20DividendCheckpoint.connect(token_owner).setWithholding(wAddrs, wRates)).wait();
        const excluded = movers.slice(5, Math.min(8, movers.length)).map(s => s.address);
        await (await I_ERC20DividendCheckpoint.connect(token_owner).setDefaultExcluded(excluded)).wait();

        // Create second dividend at new checkpoint
        const maturity = await latestTime();
        const expiry = (await latestTime()) + duration.days(7);
        const amount2 = ethers.parseEther("500000");
        await I_PolyToken.connect(token_owner).getTokens(amount2, token_owner.address);
        await I_PolyToken.connect(token_owner).approve(I_ERC20DividendCheckpoint.target, amount2);
        const tx2 = await I_ERC20DividendCheckpoint.connect(token_owner).createDividend(
            maturity,
            expiry,
            I_PolyToken.target,
            amount2,
            ethers.encodeBytes32String("DIV2")
        );
        const rcpt2 = await tx2.wait();
        // Determine checkpoint id for DIV2 from event
        let cpId = 0n;
        for (const log of rcpt2!.logs) {
            try {
                const parsed = I_ERC20DividendCheckpoint.interface.parseLog(log);
                if (parsed && parsed.name === "ERC20DividendDeposited") {
                    cpId = parsed.args._checkpointId;
                    break;
                }
            } catch {}
        }

        // Push in batches for dividend index 1
        const stride = 100;
        for (let start = 0; start < HOLDERS + 1; start += stride) {
            const end = Math.min(start + stride - 1, HOLDERS + 1);
            await (await I_ERC20DividendCheckpoint.connect(token_owner).pushDividendPayment(1, BigInt(start), BigInt(end))).wait();
        }

        if (HOLDERS <= 300) {
            const [investors2, claimed2, excluded2, withheld2, amountPaid2, balances2] = await I_ERC20DividendCheckpoint.getDividendProgress(1);
            let recomputedGrossClaimed = 0n;
            let recomputedWithheld = 0n;
            const totalSupplyAt = await I_STGetter.totalSupplyAt(cpId);
            let excludedSupply = 0n;
            for (let i = 0; i < investors2.length; i++) {
                if (excluded2[i]) excludedSupply += balances2[i];
            }
            const effectiveSupply = totalSupplyAt - excludedSupply;
            for (let i = 0; i < investors2.length; i++) {
                if (excluded2[i]) {
                    expect(amountPaid2[i]).to.equal(0n);
                    continue;
                }
                const expectedGross = balances2[i] * amount2 / effectiveSupply;
                const expectedWithheld = withheld2[i];
                const expectedNet = expectedGross - expectedWithheld;
                expect(amountPaid2[i]).to.equal(expectedNet);
                recomputedGrossClaimed += expectedGross;
                recomputedWithheld += expectedWithheld;
            }
            const div = await I_ERC20DividendCheckpoint.dividends(1);
            expect(div.claimedAmount).to.equal(recomputedGrossClaimed);
            expect(div.totalWithheld).to.equal(recomputedWithheld);
            expect(recomputedGrossClaimed).to.be.at.most(amount2);
        } else {
            const div = await I_ERC20DividendCheckpoint.dividends(1);
            expect(div.claimedAmount).to.be.at.most(amount2);
            expect(div.totalWithheld).to.be.at.most(div.claimedAmount);
        }
    });

    it("Final sweep: claim remainders, reclaim withholding, and assert conservation", async () => {
        // Route withheld to known wallet then withdraw
        await (await I_ERC20DividendCheckpoint.connect(token_owner).changeWallet(wallet.address)).wait();
        const before = await I_PolyToken.balanceOf(wallet.address);
        await (await I_ERC20DividendCheckpoint.connect(token_owner).withdrawWithholding(1)).wait();
        const after = await I_PolyToken.balanceOf(wallet.address);
        const div = await I_ERC20DividendCheckpoint.dividends(1);
        expect(after - before).to.equal(div.totalWithheld);

        // After expiry, reclaim unclaimed dividend remainder
        await network.provider.send("evm_increaseTime", [duration.days(8)]);
        await network.provider.send("evm_mine");
        const beforeReclaim = await I_PolyToken.balanceOf(wallet.address);
        await (await I_ERC20DividendCheckpoint.connect(token_owner).reclaimDividend(1)).wait();
        const afterReclaim = await I_PolyToken.balanceOf(wallet.address);
        // Ensure reclaimed equals amount - claimedAmount
        const divAfter = await I_ERC20DividendCheckpoint.dividends(1);
        expect(divAfter.reclaimed).to.equal(true);
        expect(afterReclaim - beforeReclaim).to.equal(div.amount - div.claimedAmount);
    });
});


