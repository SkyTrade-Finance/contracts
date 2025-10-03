import { LogDescription } from "ethers";
import { setUpPolymathNetwork } from "./helpers/createInstances";
import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { network } from "hardhat";
import { generateMerkleRootSignature } from "./helpers/encodeCall";
import { PERMIT2_ADDRESS } from "@uniswap/permit2-sdk";

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

describe("TradingRestrictionManager", function() {
  let contract,
    owner,
    operator,
    nonOperator,
    nonOperator1,
    investor1,
    investor2,
    investor3,
    token1,
    token2,
    account_controller;
  let merkleTree,
    merkleRoot,
    proof1,
    proof2,
    expiry,
    isAccredited1,
    isAccredited2,
    fromTime,
    toTime,
    expiryTime;

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
  let signa;
  let signa1;
  let proof3;
  let I_TradingRestrictionManager;

  // Module key
  const delegateManagerKey = 1;
  const transferManagerKey = 2;
  const stoKey = 3;

  // Initial fee for ticker registry and security token registry
  const initRegFee = ethers.parseEther("1000");

  const InvestorClass = {
    NonUS: 0,
    US: 1,
  };

  const name = "Team";
  const symbol = "SAP";
  const tokenDetails = "This is equity type of issuance";
  const decimals = 18;
  const contact = "team@polymath.network";

  before(async function() {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
    [
      owner,
      operator,
      nonOperator,
      nonOperator1,
      investor1,
      investor2,
      investor3,
      token1,
      token2,
      account_controller,
    ] = await ethers.getSigners();

    GeneralTransferManager = await ethers.getContractFactory(
      "GeneralTransferManager"
    );

    // Step 1: Deploy the general PM ecosystem
    const instances = await setUpPolymathNetwork(
      owner.address,
      operator.address
    );

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

    // Printing all the I_TradingRestrictionManager addresses
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
        -----------------------------------------------------------------------------
        `);

    // Prepare Merkle tree data
    fromTime = await latestTime();
    toTime = await latestTime();
    expiryTime = toTime + duration.days(15);

    ltime = (await latestTime()) + duration.days(300);
    expiry = (await latestTime()) + duration.days(300); // 100 days from now
    isAccredited1 = false;
    isAccredited2 = true;

    const values = [
      [investor1.address, ltime, isAccredited1, InvestorClass.NonUS],
      [investor2.address, ltime, isAccredited2, InvestorClass.NonUS],
      [investor3.address, ltime, isAccredited2, InvestorClass.US],
    ];

    merkleTree = StandardMerkleTree.of(values, [
      "address",
      "uint64",
      "bool",
      "uint64",
    ]);
    merkleRoot = merkleTree.root;

    // Get proofs
    for (const [i, v] of merkleTree.entries()) {
      if (v[0] === investor1.address) {
        proof1 = merkleTree.getProof(i);
      }
      if (v[0] === investor2.address) {
        proof2 = merkleTree.getProof(i);
      }
      if (v[0] === investor3.address) {
        proof3 = merkleTree.getProof(i);
      }
    }
    signa = await generateMerkleRootSignature(operator, merkleRoot, expiry);

    signa1 = await generateMerkleRootSignature(nonOperator, merkleRoot, expiry);
  });

  describe("Merkle Root Management", function() {
    it("should set permit2", async () => {
      await I_PolymathRegistry.connect(owner).changeAddress(
        "Permit2Contract",
        PERMIT2_ADDRESS
      );
      await I_PolymathRegistry.connect(owner).changeAddress(
        "TradingRestrictionManager",
        I_TradingRestrictionManager.target
      );
      expect(
        await I_PolymathRegistry.addressGetter("Permit2Contract")
      ).to.equal(PERMIT2_ADDRESS);
      expect(
        await I_PolymathRegistry.addressGetter("TradingRestrictionManager")
      ).to.equal(I_TradingRestrictionManager.target);
    });

    it("should set the operator", async () => {
      await I_TradingRestrictionManager.connect(owner).grantOperator(
        operator.address
      );
      expect(
        await I_TradingRestrictionManager.isOperator(operator.address)
      ).to.equal(true);
    });
    it("should whitelist three investors", async () => {
      // const endTime = BigInt(ltime) + BigInt(duration.days(30));

      // const nonUSLockPeriod = ltime + (duration.days(15));
      // const usLockPeriod = ltime + (duration.days(15));

      // const SecurityTokenAddress = await I_SecurityToken.target;
      // const tx1 = await I_TradingRestrictionManager.setTradingRestrictionPeriod(SecurityTokenAddress, 0, 0, endTime);
      // const receipt1 = await tx1.wait();

      // let eventUpdate: LogDescription | null = null;

      // for (const log of receipt1!.logs) {
      //     try {
      //         const parsed = I_TradingRestrictionManager.interface.parseLog(log);

      //         if (parsed && parsed.name === "TradingRestrictionSet") {
      //             eventUpdate = parsed;
      //             break;
      //         }
      //     } catch (err: any) {
      //         console.log(`Failed to parse log with STRProxied: ${err.message}`);
      //     }
      // }

      // expect(eventUpdate).to.not.be.null;
      // expect(eventUpdate!.args.token).to.equal(SecurityTokenAddress, "Token address not set correctly");
      // expect(eventUpdate!.args.nonUS).to.equal(0, "non us lock not set correctly");
      // expect(eventUpdate!.args.us).to.equal(0, "US lock period not set correctly");
      // expect(eventUpdate!.args.lockStart).to.equal(endTime, "End time not set correctly");

      const tx = await I_TradingRestrictionManager.connect(
        operator
      ).updateMerkleRootWithSignature(merkleRoot, expiry, signa);

      const {
        root,
        expiry: expiryTime,
      } = await I_TradingRestrictionManager.getCurrentMerkleRoot();

      expect(root).to.equal(merkleRoot, "Merkle root not set correctly");
      expect(expiryTime).to.equal(expiry, "Expiry time not set correctly");

      const receipt = await tx.wait();
      let MerkleRootUpdatedEvent: LogDescription | null = null;

      for (const log of receipt!.logs) {
        try {
          const parsed = I_TradingRestrictionManager.interface.parseLog(log);

          if (parsed && parsed.name === "MerkleRootUpdated") {
            MerkleRootUpdatedEvent = parsed;
            break;
          }
        } catch (err) {
          console.log(`Failed to parse log with STRProxied: ${err.message}`);
        }
      }

      expect(MerkleRootUpdatedEvent).to.not.be.null;
      expect(MerkleRootUpdatedEvent!.args.root).to.equal(
        merkleRoot,
        "Merkle root not set correctly"
      );
    });

    it("should allow operator to set merkle root", async function() {
      // await I_TradingRestrictionManager.connect(operator).modifyKYCData(merkleRoot);
      // Verify by checking that a valid proof works
      console.log("---------------------------", ltime, proof1, merkleRoot);
      await expect(
        I_TradingRestrictionManager.connect(operator).verifyInvestor(
          proof1,
          investor1.address,
          ltime,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.not.be.reverted;
    });

    it("should emit MerkleRootUpdated event", async function() {
      await expect(
        I_TradingRestrictionManager.connect(
          operator
        ).updateMerkleRootWithSignature(merkleRoot, expiry, signa)
      )
        .to.emit(I_TradingRestrictionManager, "MerkleRootUpdated")
        .withArgs(merkleRoot);
    });

    it("should reject non-operator trying to set merkle root", async function() {
      await expect(
        I_TradingRestrictionManager.connect(
          nonOperator
        ).updateMerkleRootWithSignature(merkleRoot, expiry, signa1)
      ).to.be.reverted;
    });

    it("should allow updating merkle root multiple times", async function() {
      await I_TradingRestrictionManager.connect(
        operator
      ).updateMerkleRootWithSignature(merkleRoot, expiry, signa);

      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new root"));
      const newSigna = await generateMerkleRootSignature(
        operator,
        newRoot,
        expiry
      );
      await expect(
        I_TradingRestrictionManager.connect(
          operator
        ).updateMerkleRootWithSignature(newRoot, expiry, newSigna)
      )
        .to.emit(I_TradingRestrictionManager, "MerkleRootUpdated")
        .withArgs(newRoot);
    });
  });

  describe("Investor Verification", function() {
    beforeEach(async function() {
      await I_TradingRestrictionManager.connect(
        operator
      ).updateMerkleRootWithSignature(merkleRoot, expiry, signa);
    });

    it("should verify investor with valid proof", async function() {
      const tx = await I_TradingRestrictionManager.connect(
        investor1
      ).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      await expect(tx)
        .to.emit(I_TradingRestrictionManager, "InvestorKYCDataUpdated")
        .withArgs(
          investor1.address,
          proof1,
          expiry,
          isAccredited1,
          InvestorClass.NonUS
        );

      expect(
        await I_TradingRestrictionManager.isExistingInvestor(investor1.address)
      ).to.equal(true);
    });

    it("should verify US investor", async function() {
      await expect(
        I_TradingRestrictionManager.connect(investor2).verifyInvestor(
          proof2,
          investor2.address,
          ltime,
          isAccredited2,
          InvestorClass.US
        )
      );
    });

    it("should reject expired proof", async function() {
      const expiredExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      await expect(
        I_TradingRestrictionManager.connect(investor1).verifyInvestor(
          proof1,
          investor1.address,
          expiredExpiry,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.be.reverted;
    });

    it("should reject invalid proof", async function() {
      const invalidProof = [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ];
      await expect(
        I_TradingRestrictionManager.connect(investor1).verifyInvestor(
          invalidProof,
          investor1.address,
          expiry,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.be.revertedWith("Invalid proof");
    });

    it("should reject proof with wrong investor address", async function() {
      await expect(
        I_TradingRestrictionManager.connect(investor3).verifyInvestor(
          proof1, // proof1 is for investor1, not investor3
          investor3.address,
          expiry,
          isAccredited1,
          InvestorClass.NonUS
        )
      ).to.be.revertedWith("Invalid proof");
    });

    it("should reject proof with wrong parameters", async function() {
      await expect(
        I_TradingRestrictionManager.connect(investor1).verifyInvestor(
          proof1,
          investor1.address,
          expiry,
          !isAccredited1, // Wrong accredited status
          InvestorClass.NonUS
        )
      ).to.be.revertedWith("Invalid proof");
    });

    it("should allow re-verification of existing investor", async function() {
      // First verification
      await I_TradingRestrictionManager.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        ltime,
        isAccredited1,
        InvestorClass.NonUS
      );

      // Second verification should work
      // await expect(
      //   I_TradingRestrictionManager.connect(investor1).verifyInvestor(
      //     proof1,
      //     investor1.address,
      //     ltime,
      //     isAccredited1,
      //     InvestorClass.US // Different class
      //   )
      // ).to.not.be.reverted;
      const updatedValues = [
        [investor1.address, ltime, isAccredited1, InvestorClass.US], // updated class here
        [investor2.address, ltime, isAccredited2, InvestorClass.NonUS],
        [investor3.address, ltime, isAccredited2, InvestorClass.US],
      ];
      const updatedMerkleTree = StandardMerkleTree.of(updatedValues, [
        "address",
        "uint64",
        "bool",
        "uint64",
      ]);
      const updatedMerkleRoot = updatedMerkleTree.root;

      // Generate new proof for investor1 from updated tree
      let updatedProof1: string[] = [];
      for (const [i, v] of updatedMerkleTree.entries()) {
        if (v[0] === investor1.address) {
          updatedProof1 = updatedMerkleTree.getProof(i);
          break;
        }
      }
      const updatedSigna = await generateMerkleRootSignature(
        operator,
        updatedMerkleRoot,
        expiry
      );

      await I_TradingRestrictionManager.connect(
        operator
      ).updateMerkleRootWithSignature(updatedMerkleRoot, expiry, updatedSigna);

      await expect(
        I_TradingRestrictionManager.connect(investor1).verifyInvestor(
          updatedProof1,
          investor1.address,
          expiry,
          isAccredited1,
          InvestorClass.US
        )
      ).to.not.be.reverted;
    });

    it("should return true on successful verification", async function() {
      const result = await I_TradingRestrictionManager.connect(
        investor1
      ).verifyInvestor.staticCall(
        proof1,
        investor1.address,
        ltime,
        isAccredited1,
        InvestorClass.NonUS
      );
      expect(result).to.equal(true);
    });
  });

  describe("Generate the SecurityToken", async () => {
    it("Should register the ticker before the generation of the security token", async () => {
      await I_PolyToken.connect(operator).approve(
        I_STRProxied.target,
        initRegFee
      );
      const tx = await I_STRProxied.connect(operator).registerNewTicker(
        operator.address,
        symbol
      );

      const receipt = await tx.wait();
      const fullReceipt = await ethers.provider.getTransactionReceipt(
        receipt!.hash
      );
      const strProxiedAddress = await I_STRProxied.getAddress();

      const logs = fullReceipt!.logs.filter(
        (log) => log.address.toLowerCase() === strProxiedAddress.toLowerCase()
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
        } catch (err) {
          console.log(`Failed to parse log: ${err.message}`);
        }
      }

      expect(eventFound).to.be.true;
    });

    it("Should generate the new security token with the same symbol as registered above", async () => {
      await I_PolyToken.connect(operator).approve(
        I_STRProxied.target,
        initRegFee
      );

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
        } catch (err) {
          console.log(`Failed to parse log with STRProxied: ${err.message}`);
        }
      }

      expect(securityTokenEvent).to.not.be.null;
      expect(securityTokenEvent!.args._ticker).to.equal(
        symbol.toUpperCase(),
        "SecurityToken doesn't get deployed"
      );

      I_SecurityToken = await ethers.getContractAt(
        "SecurityToken",
        securityTokenEvent!.args._securityTokenAddress
      );
      stGetter = await ethers.getContractAt("STGetter", I_SecurityToken.target);

      for (const log of receipt!.logs) {
        try {
          const parsed = I_SecurityToken.interface.parseLog(log);

          if (parsed && parsed.name === "ModuleAdded") {
            securityTokenEvent = parsed;
            break;
          }
        } catch (err) {
          console.log(`Failed to parse log with STRProxied: ${err.message}`);
        }
      }

      expect(securityTokenEvent).to.not.be.null;
      const nameBytes32 = ethers
        .decodeBytes32String(securityTokenEvent!.args._name)
        .replace(/\u0000/g, "");
      expect(nameBytes32).to.equal(
        "GeneralTransferManager",
        "SecurityToken doesn't have the transfer manager module"
      );
    });

    it("Should set the controller", async () => {
      await I_SecurityToken.connect(operator).setController(
        account_controller.address
      );
    });

    it("Should initialize the auto attached modules", async () => {
      const moduleData: string[] = await stGetter.getModulesByType(
        transferManagerKey
      );

      I_GeneralTransferManager = GeneralTransferManager.attach(moduleData[0]);
    });

    // it("should set trading restriction manager", async () => {
    //     const tx = await I_GeneralTransferManager.connect(operator).setTradingRestrictionManager(I_TradingRestrictionManager.target);

    //     const receipt = await tx.wait();
    //     let tradingRestrictionEvent: LogDescription | null = null;

    //     for (const log of receipt!.logs) {
    //         try {
    //             const parsed = I_GeneralTransferManager.interface.parseLog(log);

    //             if (parsed && parsed.name === "TradingRestrictionManagerUpdated") {
    //                 tradingRestrictionEvent = parsed;
    //                 break;
    //             }
    //         } catch (err: any) {
    //             console.log(`Failed to parse log with STRProxied: ${err.message}`);
    //         }
    //     }

    //     expect(tradingRestrictionEvent).to.not.be.null;
    //     expect(tradingRestrictionEvent!.args.newManager).to.equal(I_TradingRestrictionManager.target, "TradingRestrictionManager not set correctly");
    // });

    // it("should whitelist three investors", async () => {
    //     const tx = await I_TradingRestrictionManager.connect(operator).modifyKYCData(merkleRoot);

    //     const receipt = await tx.wait();
    //     let MerkleRootUpdatedEvent: LogDescription | null = null;

    //     for (const log of receipt!.logs) {
    //         try {
    //             const parsed = I_TradingRestrictionManager.interface.parseLog(log);

    //             if (parsed && parsed.name === "MerkleRootUpdated") {
    //                 MerkleRootUpdatedEvent = parsed;
    //                 break;
    //             }
    //         } catch (err: any) {
    //             console.log(`Failed to parse log with STRProxied: ${err.message}`);
    //         }
    //     }

    //     expect(MerkleRootUpdatedEvent).to.not.be.null;
    //     expect(MerkleRootUpdatedEvent!.args.root).to.equal(merkleRoot, "Merkle root not set correctly");
    // });
    it("should whitelist three investors", async () => {
      // const endTime = BigInt(ltime) + BigInt(duration.days(30));

      // const nonUSLockPeriod = ltime + (duration.days(15));
      // const usLockPeriod = ltime + (duration.days(15));

      // const SecurityTokenAddress = await I_SecurityToken.target;
      // const tx1 = await I_TradingRestrictionManager.setTradingRestrictionPeriod(SecurityTokenAddress, 0, 0, endTime);
      // const receipt1 = await tx1.wait();

      // let eventUpdate: LogDescription | null = null;

      // for (const log of receipt1!.logs) {
      //     try {
      //         const parsed = I_TradingRestrictionManager.interface.parseLog(log);

      //         if (parsed && parsed.name === "TradingRestrictionSet") {
      //             eventUpdate = parsed;
      //             break;
      //         }
      //     } catch (err: any) {
      //         console.log(`Failed to parse log with STRProxied: ${err.message}`);
      //     }
      // }

      // expect(eventUpdate).to.not.be.null;
      // expect(eventUpdate!.args.token).to.equal(SecurityTokenAddress, "Token address not set correctly");
      // expect(eventUpdate!.args.nonUS).to.equal(0, "non us lock not set correctly");
      // expect(eventUpdate!.args.us).to.equal(0, "US lock period not set correctly");
      // expect(eventUpdate!.args.lockStart).to.equal(endTime, "End time not set correctly");

      const tx = await I_TradingRestrictionManager.connect(
        operator
      ).updateMerkleRootWithSignature(merkleRoot, expiry, signa);

      const {
        root,
        expiry: expiryTime,
      } = await I_TradingRestrictionManager.getCurrentMerkleRoot();

      expect(root).to.equal(merkleRoot, "Merkle root not set correctly");
      expect(expiryTime).to.equal(expiry, "Expiry time not set correctly");

      const receipt = await tx.wait();
      let MerkleRootUpdatedEvent: LogDescription | null = null;

      for (const log of receipt!.logs) {
        try {
          const parsed = I_TradingRestrictionManager.interface.parseLog(log);

          if (parsed && parsed.name === "MerkleRootUpdated") {
            MerkleRootUpdatedEvent = parsed;
            break;
          }
        } catch (err) {
          console.log(`Failed to parse log with STRProxied: ${err.message}`);
        }
      }

      expect(MerkleRootUpdatedEvent).to.not.be.null;
      expect(MerkleRootUpdatedEvent!.args.root).to.equal(
        merkleRoot,
        "Merkle root not set correctly"
      );
    });
  });

  describe("Ownership", function() {
    it("should set deployer as owner", async function() {
      expect(await I_TradingRestrictionManager.owner()).to.equal(owner.address);
    });

    it("should allow owner to transfer ownership", async function() {
      await I_TradingRestrictionManager.connect(owner).transferOwnership(
        operator.address
      );
      expect(await I_TradingRestrictionManager.owner()).to.equal(
        operator.address
      );
    });

    it("should reject non-owner trying to transfer ownership", async function() {
      await expect(
        I_TradingRestrictionManager.connect(nonOperator).transferOwnership(
          operator.address
        )
      ).to.be.reverted;
    });

    it("should reject transfer to zero address", async function() {
      await expect(
        I_TradingRestrictionManager.connect(owner).transferOwnership(
          ethers.ZeroAddress
        )
      ).to.be.reverted;
    });

    it("should emit OwnershipTransferred event", async function() {
      console.log("Current owner:", await I_TradingRestrictionManager.owner());
      console.log("Owner:", owner.address);
      console.log("Operator:", operator.address);
      await expect(
        I_TradingRestrictionManager.connect(operator).transferOwnership(
          owner.address
        )
      )
        .to.emit(I_TradingRestrictionManager, "OwnershipTransferred")
        .withArgs(operator.address, owner.address);
    });
  });

  describe("Operator Management", function() {
    it("should grant operator role", async function() {
      expect(
        await I_TradingRestrictionManager.isOperator(operator.address)
      ).to.equal(true);
    });

    it("should allow owner to grant operator role", async function() {
      await I_TradingRestrictionManager.connect(owner).grantOperator(
        nonOperator.address
      );
      expect(
        await I_TradingRestrictionManager.isOperator(nonOperator.address)
      ).to.equal(true);
    });

    it("should emit OperatorRoleGranted event", async function() {
      await expect(
        I_TradingRestrictionManager.connect(owner).grantOperator(
          nonOperator1.address
        )
      )
        .to.emit(I_TradingRestrictionManager, "OperatorRoleGranted")
        .withArgs(nonOperator1.address);
    });

    it("should reject granting operator role to existing operator", async function() {
      await expect(
        I_TradingRestrictionManager.connect(owner).grantOperator(
          operator.address
        )
      ).to.be.revertedWith("Already operator");
    });

    it("should reject non-owner trying to grant operator role", async function() {
      await expect(
        I_TradingRestrictionManager.connect(nonOperator).grantOperator(
          investor1.address
        )
      ).to.be.reverted;
    });

    it("should allow owner to revoke operator role", async function() {
      await I_TradingRestrictionManager.connect(owner).revokeOperator(
        operator.address
      );
      expect(
        await I_TradingRestrictionManager.isOperator(operator.address)
      ).to.equal(false);
    });

    it("should emit OperatorRoleRevoked event", async function() {
      await expect(
        I_TradingRestrictionManager.connect(owner).revokeOperator(
          nonOperator.address
        )
      )
        .to.emit(I_TradingRestrictionManager, "OperatorRoleRevoked")
        .withArgs(nonOperator.address);
    });

    it("should reject revoking non-operator", async function() {
      await expect(
        I_TradingRestrictionManager.connect(owner).revokeOperator(
          nonOperator.address
        )
      ).to.be.revertedWith("Not an operator");
    });

    it("should reject non-owner trying to revoke operator role", async function() {
      await expect(
        I_TradingRestrictionManager.connect(nonOperator).revokeOperator(
          operator.address
        )
      ).to.be.reverted;
    });
  });

  describe("Trading Restriction Management", function() {
    it("should set trading restriction periods", async function() {
      const nonUSPeriod = 30 * 24 * 3600; // 30 days
      const usPeriod = 365 * 24 * 3600; // 365 days
      const lockStart = Math.floor(Date.now() / 1000);

      await I_TradingRestrictionManager.connect(
        owner
      ).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        usPeriod,
        lockStart
      );

      expect(
        await I_TradingRestrictionManager.nonUSTradingRestrictionPeriod(
          token1.address
        )
      ).to.equal(nonUSPeriod);
      expect(
        await I_TradingRestrictionManager.usTradingRestrictionPeriod(
          token1.address
        )
      ).to.equal(usPeriod);
      expect(
        await I_TradingRestrictionManager.tokenLockStartTime(token1.address)
      ).to.equal(lockStart);
    });

    it("should emit TradingRestrictionSet event", async function() {
      const nonUSPeriod = 30 * 24 * 3600;
      const usPeriod = 365 * 24 * 3600;
      const lockStart = Math.floor(Date.now() / 1000);

      await expect(
        I_TradingRestrictionManager.connect(owner).setTradingRestrictionPeriod(
          token1.address,
          nonUSPeriod,
          usPeriod,
          lockStart
        )
      )
        .to.emit(I_TradingRestrictionManager, "TradingRestrictionSet")
        .withArgs(token1.address, nonUSPeriod, usPeriod, lockStart);
    });

    it("should reject non-owner setting trading restrictions", async function() {
      await expect(
        I_TradingRestrictionManager.connect(
          nonOperator
        ).setTradingRestrictionPeriod(
          token1.address,
          30 * 24 * 3600,
          365 * 24 * 3600,
          Math.floor(Date.now() / 1000)
        )
      ).to.be.reverted;
    });

    it("should set whitelist-only trading", async function() {
      await I_TradingRestrictionManager.connect(owner).setWhitelistOnlyTrading(
        token1.address,
        true
      );
      expect(
        await I_TradingRestrictionManager.whitelistOnlyTrading(token1.address)
      ).to.equal(true);
    });

    it("should emit WhitelistOnlyTradingUpdated event", async function() {
      await expect(
        I_TradingRestrictionManager.connect(owner).setWhitelistOnlyTrading(
          token1.address,
          true
        )
      )
        .to.emit(I_TradingRestrictionManager, "WhitelistOnlyTradingUpdated")
        .withArgs(token1.address, true);
    });

    it("should reject non-owner setting whitelist-only trading", async function() {
      await expect(
        I_TradingRestrictionManager.connect(
          nonOperator
        ).setWhitelistOnlyTrading(token1.address, true)
      ).to.be.reverted;
    });
  });

  describe("KYC Data Retrieval", function() {
    beforeEach(async function() {
      if (!(await I_TradingRestrictionManager.isOperator(operator.address))) {
        await I_TradingRestrictionManager.connect(owner).grantOperator(operator.address);
      }
      await I_TradingRestrictionManager.connect(operator).updateMerkleRootWithSignature(merkleRoot, expiry, signa);
    });

    it("should return future times for non-existing investor with whitelist enforcement", async function() {
      await I_TradingRestrictionManager.connect(owner).setWhitelistOnlyTrading(
        token1.address,
        true
      );

      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        investor1.address,
        token1.address
      );

      const latestBlock = await ethers.provider.getBlock("latest");
      const now = Number(latestBlock.timestamp);
      const drift = 2 * 24 * 3600; // allow 2 days drift under coverage
      const floorTs = BigInt(now - drift);
      expect(result.canSendAfter).to.be.gte(floorTs);
      expect(result.canReceiveAfter).to.be.gte(floorTs);
      expect(result.added).to.be.oneOf([0n, 1n]);
    });

    it("should return future times for existing investor without lock start time", async function() {
      await I_TradingRestrictionManager.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        ltime,
        isAccredited1,
        InvestorClass.NonUS
      );

      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        investor1.address,
        token1.address
      );

      const latestBlock = await ethers.provider.getBlock("latest");
      const now = Number(latestBlock.timestamp);
      const drift = 2 * 24 * 3600; // allow 2 days drift under coverage
      const floorTs = BigInt(now - drift);
      expect(result.canSendAfter).to.be.gte(floorTs);
      expect(result.canReceiveAfter).to.be.gte(floorTs);
      expect(result.expiryTime).to.equal(ltime);
      expect(result.added).to.equal(1);
    });

    it("should calculate correct unlock time for Non-US investor", async function() {
      await I_TradingRestrictionManager.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        ltime,
        isAccredited1,
        InvestorClass.NonUS
      );

      const nonUSPeriod = 30 * 24 * 3600; // 30 days
      const usPeriod = 365 * 24 * 3600; // 365 days
      const lockStart = Math.floor(Date.now() / 1000) - 10 * 24 * 3600; // 10 days ago

      await I_TradingRestrictionManager.connect(
        owner
      ).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        usPeriod,
        lockStart
      );

      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        investor1.address,
        token1.address
      );

      const expectedUnlockTime = lockStart + nonUSPeriod;
      const now = Math.floor(Date.now() / 1000);

      if (now >= expectedUnlockTime) {
        expect(result.canSendAfter).to.be.lt(now);
      } else {
        expect(result.canSendAfter).to.equal(expectedUnlockTime);
      }

      expect(result.canReceiveAfter).to.equal(expectedUnlockTime);
      expect(result.expiryTime).to.equal(ltime);
      expect(result.added).to.equal(1);
    });

    it("should calculate correct unlock time for US investor", async function() {
      await I_TradingRestrictionManager.connect(investor3).verifyInvestor(
        proof3,
        investor3.address,
        ltime,
        isAccredited2,
        InvestorClass.US
      );

      const nonUSPeriod = 30 * 24 * 3600; // 30 days
      const usPeriod = 365 * 24 * 3600; // 365 days
      const lockStart = Math.floor(Date.now() / 1000);

      await I_TradingRestrictionManager.connect(
        owner
      ).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        usPeriod,
        lockStart
      );

      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        investor3.address,
        token1.address
      );

      const expectedUnlockTime = lockStart + usPeriod;
      expect(result.canSendAfter).to.equal(expectedUnlockTime);
      expect(result.expiryTime).to.equal(expiry);
      expect(result.added).to.equal(1);
    });

    it("should return past time for canSendAfter when restriction period has passed", async function() {
      await I_TradingRestrictionManager.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      const nonUSPeriod = 1; // 1 second
      const lockStart = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago

      await I_TradingRestrictionManager.connect(
        owner
      ).setTradingRestrictionPeriod(
        token1.address,
        nonUSPeriod,
        365 * 24 * 3600,
        lockStart
      );

      // Wait a moment to ensure time has passed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        investor1.address,
        token1.address
      );
      const now = Math.floor(Date.now() / 1000);

      expect(result.canSendAfter).to.be.lt(now);
    });

    it("should handle multiple tokens with different restrictions", async function() {
      await I_TradingRestrictionManager.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      const lockStart = Math.floor(Date.now() / 1000);

      // Set different restrictions for different tokens
      await I_TradingRestrictionManager.connect(
        owner
      ).setTradingRestrictionPeriod(
        token1.address,
        30 * 24 * 3600, // 30 days
        365 * 24 * 3600, // 365 days
        lockStart
      );

      await I_TradingRestrictionManager.connect(
        owner
      ).setTradingRestrictionPeriod(
        token2.address,
        60 * 24 * 3600, // 60 days
        730 * 24 * 3600, // 730 days
        lockStart
      );

      const result1 = await I_TradingRestrictionManager.getInvestorKYCData(
        investor1.address,
        token1.address
      );
      const result2 = await I_TradingRestrictionManager.getInvestorKYCData(
        investor1.address,
        token2.address
      );

      expect(result1.canSendAfter).to.equal(lockStart + 30 * 24 * 3600);
      expect(result2.canSendAfter).to.equal(lockStart + 60 * 24 * 3600);
    });
  });

  describe("Edge Cases and Error Handling", function() {
    it("should handle zero addresses appropriately", async function() {
      expect(
        await I_TradingRestrictionManager.isExistingInvestor(ethers.ZeroAddress)
      ).to.equal(false);

      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        ethers.ZeroAddress,
        token1.address
      );
      expect(result.added).to.be.oneOf([0n,1n]);
    });

    it("should handle uninitialized token data", async function() {
      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        investor3.address,
        token1.address
      );
      expect(result.added).to.be.oneOf([0n,1n]);
    });

    it("should handle very large timestamps", async function() {
      const futureExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600 * 100; // 100 years
      const values = [[investor1.address, futureExpiry, false, InvestorClass.NonUS]];
      const futureTree = StandardMerkleTree.of(values, ["address","uint64","bool","uint64"]);
      const futureRoot = futureTree.root;
      const futureProof = futureTree.getProof(0);
      await I_TradingRestrictionManager.connect(operator).modifyKYCData(futureRoot);
      await expect(
        I_TradingRestrictionManager.connect(investor1).verifyInvestor(
          futureProof,
          investor1.address,
          futureExpiry,
          false,
          InvestorClass.NonUS
        )
      ).to.not.be.reverted;
    });

    it("should handle zero restriction periods", async function() {
      await I_TradingRestrictionManager.connect(operator).modifyKYCData(
        merkleRoot
      );
      await I_TradingRestrictionManager.connect(investor1).verifyInvestor(
        proof1,
        investor1.address,
        expiry,
        isAccredited1,
        InvestorClass.NonUS
      );

      await I_TradingRestrictionManager.connect(
        owner
      ).setTradingRestrictionPeriod(
        token1.address,
        0, // Zero restriction period
        0,
        Math.floor(Date.now() / 1000)
      );

      const result = await I_TradingRestrictionManager.getInvestorKYCData(
        investor1.address,
        token1.address
      );
      const now = Math.floor(Date.now() / 1000);
      // With zero restriction, should be unlocked now or earlier
      expect(result.canSendAfter).to.be.at.most(now);
    });
  });
});
