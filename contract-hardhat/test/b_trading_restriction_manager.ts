import { LogDescription } from "ethers";
import { setUpPolymathNetwork } from "./helpers/createInstances";
import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { network } from "hardhat";

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

describe("TradingRestrictionManager", function () {
  let contract, owner, operator, nonOperator, investor1, investor2, investor3, token1, token2, account_controller;
  let merkleTree, merkleRoot, proof1, proof2, expiry, isAccredited1, isAccredited2;

  let GeneralTransferManager;

  let I_GeneralPermissionManagerFactory;
    let I_SecurityTokenRegistryProxy;
    let I_GeneralTransferManagerFactory;
    let I_GeneralPermissionManager;
    let I_GeneralTransferManager;
    let I_ExchangeTransferManager;
    let I_STRProxied: any;
    let I_MRProxied;
    let I_ModuleRegistry;
    let I_ModuleRegistryProxy;
    let I_FeatureRegistry;
    let I_SecurityTokenRegistry;
    let I_STFactory;
    let I_SecurityToken;
    let I_PolyToken;
    let I_PolymathRegistry;
    let I_STRGetter;
    let I_STGetter;
    let stGetter;
    let ltime;

    // Module key
    const delegateManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

  const InvestorClass = {
    NonUS: 0,
    US: 1
  };

  const name = "Team";
  const symbol = "SAP";
  const tokenDetails = "This is equity type of issuance";
  const decimals = 18;
  const contact = "team@polymath.network";

  before(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
    [owner, operator, nonOperator, investor1, investor2, investor3, token1, token2, account_controller] = await ethers.getSigners();

      GeneralTransferManager = await ethers.getContractFactory("GeneralTransferManager");

      // Step 1: Deploy the general PM ecosystem
      const instances = await setUpPolymathNetwork(owner.address, operator.address);

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

  beforeEach(async function () {
    // Deploy contract
    const TradingRestrictionManager = await ethers.getContractFactory("TradingRestrictionManager");
    contract = await TradingRestrictionManager.deploy();

    // Grant operator role
    await contract.connect(owner).grantOperator(operator.address);

    // Prepare Merkle tree data
    ltime = await latestTime();
    expiry = await latestTime() + duration.days(100); // 100 days from now
    isAccredited1 = false;
    isAccredited2 = true;

    const values = [
      [investor1.address, expiry, isAccredited1],
      [investor2.address, expiry, isAccredited2],
      [investor3.address, expiry, true]
    ];

    merkleTree = StandardMerkleTree.of(values, ["address", "uint64", "bool"]);
    merkleRoot = merkleTree.root;

    // Get proofs
    for (const [i, v] of merkleTree.entries()) {
      if (v[0] === investor1.address) {
        proof1 = merkleTree.getProof(i);
      }
      if (v[0] === investor2.address) {
        proof2 = merkleTree.getProof(i);
      }
    }
  });

  describe("Merkle Root Management", function () {
    it("should allow operator to set merkle root", async function () {
      await contract.connect(operator).modifyKYCData(merkleRoot);
      // Verify by checking that a valid proof works
      await expect(
        contract.connect(investor1).verifyInvestor(
          proof1,
          investor1.address,
          expiry,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.not.be.reverted;
    });

    it("should emit MerkleRootUpdated event", async function () {
      await expect(contract.connect(operator).modifyKYCData(merkleRoot))
        .to.emit(contract, "MerkleRootUpdated")
        .withArgs(merkleRoot);
    });

    it("should reject non-operator trying to set merkle root", async function () {
      await expect(
        contract.connect(nonOperator).modifyKYCData(merkleRoot)
      ).to.be.revertedWith("Operator only");
    });

    it("should allow updating merkle root multiple times", async function () {
      await contract.connect(operator).modifyKYCData(merkleRoot);

      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new root"));
      await expect(contract.connect(operator).modifyKYCData(newRoot))
        .to.emit(contract, "MerkleRootUpdated")
        .withArgs(newRoot);
    });
  });

  describe("Investor Verification", function () {
    beforeEach(async function () {
      await contract.connect(operator).modifyKYCData(merkleRoot);
    });

    it("should verify investor with valid proof", async function () {
      const tx = await contract.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      await expect(tx)
        .to.emit(contract, "InvestorKYCDataUpdated")
        .withArgs(investor1.address, proof1, expiry, isAccredited1, InvestorClass.NonUS);

      expect(await contract.isExistingInvestor(investor1.address)).to.equal(true);
    });

    it("should verify US investor", async function () {
      await expect(
        contract.connect(investor2).verifyInvestor(
          proof2,
          investor2.address,
          expiry,
          isAccredited2,
          InvestorClass.US
        )
      ).to.emit(contract, "InvestorKYCDataUpdated")
        .withArgs(investor2.address, proof2, expiry, isAccredited2, InvestorClass.US);
    });

    it("should reject expired proof", async function () {
      const expiredExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      await expect(
        contract.connect(investor1).verifyInvestor(
          proof1,
          investor1.address,
          expiredExpiry,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.be.revertedWith("Investor proof has expired");
    });

    it("should reject invalid proof", async function () {
      const invalidProof = ["0x0000000000000000000000000000000000000000000000000000000000000000"];
      await expect(
        contract.connect(investor1).verifyInvestor(
          invalidProof,
          investor1.address,
          expiry,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.be.revertedWith("Invalid proof");
    });

    it("should reject proof with wrong investor address", async function () {
      await expect(
        contract.connect(investor3).verifyInvestor(
          proof1, // proof1 is for investor1, not investor3
          investor3.address,
          expiry,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.be.revertedWith("Invalid proof");
    });

    it("should reject proof with wrong parameters", async function () {
      await expect(
        contract.connect(investor1).verifyInvestor(
          proof1,
          investor1.address,
          expiry,
          !isAccredited1, // Wrong accredited status
          InvestorClass.NonUS
        )
      ).to.be.revertedWith("Invalid proof");
    });

    it("should allow re-verification of existing investor", async function () {
      // First verification
      await contract.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      // Second verification should work
      await expect(
        contract.connect(investor1).verifyInvestor(
          proof1,
          investor1.address,
          expiry,
          isAccredited1,
          InvestorClass.US // Different class
        )
      ).to.not.be.reverted;
    });

    it("should return true on successful verification", async function () {
      const result = await contract.connect(investor1).verifyInvestor.staticCall(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );
      expect(result).to.equal(true);
    });
  });

  describe("Generate the SecurityToken", async () => {
        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.connect(operator).approve(I_STRProxied.target, initRegFee);
            const tx = await I_STRProxied.connect(operator).registerNewTicker(operator.address, symbol);

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
                        expect(parsed.args._owner).to.equal(operator.address);
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
            await I_PolyToken.connect(operator).approve(I_STRProxied.target, initRegFee);

            const tx = await I_STRProxied.connect(operator).generateNewSecurityToken(
                name,
                symbol,
                tokenDetails,
                false,
                operator.address,
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
            await I_SecurityToken.connect(operator).setController(account_controller.address);
        });

        it("Should initialize the auto attached modules", async () => {
            const moduleData: string[] = await stGetter.getModulesByType(transferManagerKey);

            I_GeneralTransferManager = GeneralTransferManager.attach(moduleData[0]);
        });

        it("should set trading restriction manager", async () => { 
            const tx = await I_GeneralTransferManager.connect(operator).setTradingRestrictionManager(contract.target);

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
            expect(tradingRestrictionEvent!.args.newManager).to.equal(contract.target, "TradingRestrictionManager not set correctly");
        });

        it("should whitelist three investors", async () => {
            const tx = await contract.connect(operator).modifyKYCData(merkleRoot);

            const receipt = await tx.wait();
            let MerkleRootUpdatedEvent: LogDescription | null = null;

            for (const log of receipt!.logs) {
                try {
                    const parsed = contract.interface.parseLog(log);
                    
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
    });

  describe("Ownership", function () {
    it("should set deployer as owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("should allow owner to transfer ownership", async function () {
      await contract.connect(owner).transferOwnership(operator.address);
      expect(await contract.owner()).to.equal(operator.address);
    });

    it("should reject non-owner trying to transfer ownership", async function () {
      await expect(
        contract.connect(nonOperator).transferOwnership(operator.address)
      ).to.be.reverted;
    });

    it("should reject transfer to zero address", async function () {
      await expect(
        contract.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.reverted;
    });

    it("should emit OwnershipTransferred event", async function () {
      await expect(contract.connect(owner).transferOwnership(operator.address))
        .to.emit(contract, "OwnershipTransferred")
        .withArgs(owner.address, operator.address);
    });
  });

  describe("Operator Management", function () {
    it("should grant operator role", async function () {
      expect(await contract.isOperator(operator.address)).to.equal(true);
    });

    it("should allow owner to grant operator role", async function () {
      await contract.connect(owner).grantOperator(nonOperator.address);
      expect(await contract.isOperator(nonOperator.address)).to.equal(true);
    });

    it("should emit OperatorRoleGranted event", async function () {
      await expect(contract.connect(owner).grantOperator(nonOperator.address))
        .to.emit(contract, "OperatorRoleGranted")
        .withArgs(nonOperator.address);
    });

    it("should reject granting operator role to existing operator", async function () {
      await expect(
        contract.connect(owner).grantOperator(operator.address)
      ).to.be.revertedWith("Already operator");
    });

    it("should reject non-owner trying to grant operator role", async function () {
      await expect(
        contract.connect(nonOperator).grantOperator(investor1.address)
      ).to.be.reverted;
    });

    it("should allow owner to revoke operator role", async function () {
      await contract.connect(owner).revokeOperator(operator.address);
      expect(await contract.isOperator(operator.address)).to.equal(false);
    });

    it("should emit OperatorRoleRevoked event", async function () {
      await expect(contract.connect(owner).revokeOperator(operator.address))
        .to.emit(contract, "OperatorRoleRevoked")
        .withArgs(operator.address);
    });

    it("should reject revoking non-operator", async function () {
      await expect(
        contract.connect(owner).revokeOperator(nonOperator.address)
      ).to.be.revertedWith("Not an operator");
    });

    it("should reject non-owner trying to revoke operator role", async function () {
      await expect(
        contract.connect(nonOperator).revokeOperator(operator.address)
      ).to.be.reverted;
    });
  });

  describe("Trading Restriction Management", function () {
    it("should set trading restriction periods", async function () {
      const nonUSPeriod = 30 * 24 * 3600; // 30 days
      const usPeriod = 365 * 24 * 3600; // 365 days
      const lockStart = Math.floor(Date.now() / 1000);

      await contract.connect(owner).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        usPeriod,
        lockStart
      );

      expect(await contract.nonUSTradingRestrictionPeriod(token1.address)).to.equal(nonUSPeriod);
      expect(await contract.usTradingRestrictionPeriod(token1.address)).to.equal(usPeriod);
      expect(await contract.tokenLockStartTime(token1.address)).to.equal(lockStart);
    });

    it("should emit TradingRestrictionSet event", async function () {
      const nonUSPeriod = 30 * 24 * 3600;
      const usPeriod = 365 * 24 * 3600;
      const lockStart = Math.floor(Date.now() / 1000);

      await expect(
        contract.connect(owner).setTradingRestrictionPeriod(
          token1.address,
          nonUSPeriod,
          usPeriod,
          lockStart
        )
      ).to.emit(contract, "TradingRestrictionSet")
        .withArgs(token1.address, nonUSPeriod, usPeriod, lockStart);
    });

    it("should reject non-owner setting trading restrictions", async function () {
      await expect(
        contract.connect(nonOperator).setTradingRestrictionPeriod(
          token1.address,
          30 * 24 * 3600,
          365 * 24 * 3600,
          Math.floor(Date.now() / 1000)
        )
      ).to.be.reverted;
    });

    it("should set whitelist-only trading", async function () {
      await contract.connect(owner).setWhitelistOnlyTrading(token1.address, true);
      expect(await contract.whitelistOnlyTrading(token1.address)).to.equal(true);
    });

    it("should emit WhitelistOnlyTradingUpdated event", async function () {
      await expect(
        contract.connect(owner).setWhitelistOnlyTrading(token1.address, true)
      ).to.emit(contract, "WhitelistOnlyTradingUpdated")
        .withArgs(token1.address, true);
    });

    it("should reject non-owner setting whitelist-only trading", async function () {
      await expect(
        contract.connect(nonOperator).setWhitelistOnlyTrading(token1.address, true)
      ).to.be.reverted;
    });
  });

  describe("KYC Data Retrieval", function () {
    beforeEach(async function () {
      await contract.connect(operator).modifyKYCData(merkleRoot);
    });

    it("should return future times for non-existing investor with whitelist enforcement", async function () {
      await contract.connect(owner).setWhitelistOnlyTrading(token1.address, true);

      const result = await contract.getInvestorKYCData(investor1.address, token1.address);

      const now = Math.floor(Date.now() / 1000);
      expect(result.canSendAfter).to.be.gt(now);
      expect(result.canReceiveAfter).to.be.gt(now);
      expect(result.expiryTime).to.be.lt(expiry);
      expect(result.added).to.equal(0);
    });

    it("should return future times for existing investor without lock start time", async function () {
      await contract.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      const result = await contract.getInvestorKYCData(investor1.address, token1.address);

      const now = Math.floor(Date.now() / 1000);
      expect(result.canSendAfter).to.be.gt(now);
      expect(result.canReceiveAfter).to.be.gt(now);
      expect(result.expiryTime).to.equal(expiry);
      expect(result.added).to.equal(1);
    });

    it("should calculate correct unlock time for Non-US investor", async function () {
      await contract.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      const nonUSPeriod = 30 * 24 * 3600; // 30 days
      const usPeriod = 365 * 24 * 3600; // 365 days
      const lockStart = Math.floor(Date.now() / 1000) - 10 * 24 * 3600; // 10 days ago

      await contract.connect(owner).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        usPeriod,
        lockStart
      );

      const result = await contract.getInvestorKYCData(investor1.address, token1.address);

      const expectedUnlockTime = lockStart + nonUSPeriod;
      const now = Math.floor(Date.now() / 1000);

      if (now >= expectedUnlockTime) {
        expect(result.canSendAfter).to.be.lt(now);
      } else {
        expect(result.canSendAfter).to.equal(expectedUnlockTime);
      }

      expect(result.canReceiveAfter).to.equal(expectedUnlockTime);
      expect(result.expiryTime).to.equal(expiry);
      expect(result.added).to.equal(1);
    });

    it("should calculate correct unlock time for US investor", async function () {
      await contract.connect(investor2).verifyInvestor(
        proof2,
        investor2.address,
        expiry,
        isAccredited2,
        InvestorClass.US
      );

      const nonUSPeriod = 30 * 24 * 3600; // 30 days
      const usPeriod = 365 * 24 * 3600; // 365 days
      const lockStart = Math.floor(Date.now() / 1000);

      await contract.connect(owner).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        usPeriod,
        lockStart
      );

      const result = await contract.getInvestorKYCData(investor2.address, token1.address);

      const expectedUnlockTime = lockStart + usPeriod;
      expect(result.canSendAfter).to.equal(expectedUnlockTime);
      expect(result.expiryTime).to.equal(expiry);
      expect(result.added).to.equal(1);
    });

    it("should return past time for canSendAfter when restriction period has passed", async function () {
      await contract.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      const nonUSPeriod = 1; // 1 second
      const lockStart = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago

      await contract.connect(owner).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        365 * 24 * 3600,
        lockStart
      );

      // Wait a moment to ensure time has passed
      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await contract.getInvestorKYCData(investor1.address, token1.address);
      const now = Math.floor(Date.now() / 1000);

      expect(result.canSendAfter).to.be.lt(now);
    });

    it("should handle multiple tokens with different restrictions", async function () {
      await contract.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      const lockStart = Math.floor(Date.now() / 1000);

      // Set different restrictions for different tokens
      await contract.connect(owner).setTradingRestrictionPeriod(
        token1.address,
        30 * 24 * 3600, // 30 days
        365 * 24 * 3600, // 365 days
        lockStart
      );

      await contract.connect(owner).setTradingRestrictionPeriod(
        token2.address,
        60 * 24 * 3600, // 60 days
        730 * 24 * 3600, // 730 days
        lockStart
      );

      const result1 = await contract.getInvestorKYCData(investor1.address, token1.address);
      const result2 = await contract.getInvestorKYCData(investor1.address, token2.address);

      expect(result1.canSendAfter).to.equal(lockStart + 30 * 24 * 3600);
      expect(result2.canSendAfter).to.equal(lockStart + 60 * 24 * 3600);
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("should handle zero addresses appropriately", async function () {
      expect(await contract.isExistingInvestor(ethers.ZeroAddress)).to.equal(false);

      const result = await contract.getInvestorKYCData(ethers.ZeroAddress, token1.address);
      expect(result.added).to.equal(1); // Should return 1
    });

    it("should handle uninitialized token data", async function () {
      const result = await contract.getInvestorKYCData(investor3.address, token1.address);
      expect(result.added).to.equal(1); // Should return 1
    });

    it("should handle very large timestamps", async function () {
      const futureExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600 * 100; // 100 years

      // This should not cause overflow issues
      const values = [[investor1.address, futureExpiry, false]];
      const futureTree = StandardMerkleTree.of(values, ["address", "uint64", "bool"]);
      const futureRoot = futureTree.root;
      const futureProof = futureTree.getProof(0);

      await contract.connect(operator).modifyKYCData(futureRoot);

      await expect(
        contract.connect(investor1).verifyInvestor(
          futureProof,
          investor1.address,
          futureExpiry,
          false,
          InvestorClass.NonUS
        )
      ).to.not.be.reverted;
    });

    it("should handle zero restriction periods", async function () {
      await contract.connect(operator).modifyKYCData(merkleRoot);
      await contract.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      await contract.connect(owner).setTradingRestrictionPeriod(
        token1.address,
        0, // Zero restriction period
        0,
        Math.floor(Date.now() / 1000)
      );

      const result = await contract.getInvestorKYCData(investor1.address, token1.address);
      const now = Math.floor(Date.now() / 1000);

      // With zero restriction, should be unlocked immediately
      expect(result.canSendAfter).to.be.equal(now);
    });
  });
});
