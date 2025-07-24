import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { LogDescription } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { pk } from "./helpers/testprivateKey";
import { setUpPolymathNetwork, deployGPMAndVerifyed } from "./helpers/createInstances";
import { revertToSnapshot, takeSnapshot } from "./helpers/time";
import { catchRevert } from "./helpers/exceptions";

describe("GeneralPermissionManager", function() {

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
    let account_delegate2: HardhatEthersSigner;
    let account_delegate3: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    const delegateDetails = ethers.encodeBytes32String("I am delegate");
    const message = "Transaction Should Fail!";

    // Contract Instance Declaration
    let I_GeneralPermissionManagerFactory: any;
    let P_GeneralPermissionManagerFactory: any;
    let I_SecurityTokenRegistryProxy: any;
    let P_GeneralPermissionManager: any;
    let I_GeneralTransferManagerFactory: any;
    let I_GeneralPermissionManager: any;
    let I_GeneralTransferManager: any;
    let I_ModuleRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_STRProxied: any;
    let I_MRProxied: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_DummySTOFactory: any;
    let I_STFactory: any;
    let I_SecurityToken: any;
    let I_PolyToken: any;
    let I_PolymathRegistry: any;
    let I_STRGetter: any;
    let I_STGetter: any;
    let I_SecurityTokenRegistryInterface: any;
    let stGetter: any;

    // Contract Factories
    let GeneralTransferManagerFactory: any;
    let GeneralPermissionManagerFactory: any;
    let SecurityTokenFactory: any;
    let STGetterFactory: any;
    let SecurityTokenRegistryInterfaceFactory: any;

    // SecurityToken Details
    const name = "Team";
    const symbol = "SAP";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    const contact = "team@polymath.network";
    const managerDetails = ethers.encodeBytes32String("Hello");

    // Module keys
    const delegateManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("1000");

    const one_address = "0x0000000000000000000000000000000000000001";
    const address_zero = ethers.ZeroAddress;

    let currentTime: number;
    let snapId: string;

    before(async () => {
        // Get signers
        accounts = await ethers.getSigners();
        
        currentTime = await latestTime();
        
        // Account assignments
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        token_owner = account_issuer;
        token_owner_pk = pk.account_1;
        account_delegate3 = accounts[5];
        account_delegate2 = accounts[6];
        account_delegate = accounts[7];
        account_investor1 = accounts[8];
        account_investor2 = accounts[9];

        console.log(token_owner.address, "token_owner.address");

        // Get contract factories
        GeneralTransferManagerFactory = await ethers.getContractFactory("GeneralTransferManager");
        GeneralPermissionManagerFactory = await ethers.getContractFactory("GeneralPermissionManager");
        // SecurityTokenRegistryInterfaceFactory = await ethers.getContractFactory("ISecurityTokenRegistry");

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

        // Deploy GeneralPermissionManager factories
        [I_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(
            account_polymath.address,
            I_MRProxied,
            0n
        );
        
        [P_GeneralPermissionManagerFactory] = await deployGPMAndVerifyed(
            account_polymath.address, 
            I_MRProxied, 
            ethers.parseEther("500")
        );

        // Get SecurityTokenRegistryInterface
        // I_SecurityTokenRegistryInterface = SecurityTokenRegistryInterfaceFactory.attach(await I_SecurityTokenRegistryProxy.getAddress());
        I_SecurityTokenRegistryInterface = await ethers.getContractAt("ISecurityTokenRegistry",await I_SecurityTokenRegistryProxy.getAddress());

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

            expect(await stGetter.getTreasuryWallet()).to.equal(token_owner.address, "Incorrect wallet set");

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

        it("Should successfully attach the General permission manager factory with the security token -- failed because Token is not paid", async () => {
            // The getTokens function is a utility to mint tokens for an address.
            // The original test implies token_owner needs tokens, but the call fails for other reasons (like insufficient allowance or payment mechanism).
            // We will assume getTokens is available for the test setup.
            // The original code `await I_PolyToken.getTokens(..., token_owner)` is ambiguous. Assuming it means minting for token_owner.
            // A later test `I_PolyToken.transfer(..., { from: token_owner })` confirms token_owner has tokens.
            // Let's assume a utility function `getTokens(recipient, amount)` exists on the token contract.
            // The original code has `getTokens(amount, recipient)`. I will assume that signature.
            await I_PolyToken.getTokens(ethers.parseEther("2000"), token_owner.address);
            await catchRevert(
            I_SecurityToken.connect(token_owner).addModule(
                P_GeneralPermissionManagerFactory.target,
                "0x",
                ethers.parseEther("2000"),
                0n,
                false
            )
            );
        });

        it("Should successfully attach the General permission manager factory with the security token", async () => {
            const snapId = await takeSnapshot();
            await I_PolyToken.connect(token_owner).transfer(I_SecurityToken.target, ethers.parseEther("500"));
            const tx = await I_SecurityToken.connect(token_owner).addModule(
            P_GeneralPermissionManagerFactory.target,
            "0x",
            ethers.parseEther("500"),
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
                // Not a SecurityToken event
            }
            }

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(BigInt(delegateManagerKey), "General Permission Manager doesn't get deployed");
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            expect(moduleName).to.equal("GeneralPermissionManager", "GeneralPermissionManagerFactory module was not added");
            P_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);
            await revertToSnapshot(snapId);
        });

        it("Should successfully attach the General permission manager factory with the security token", async () => {
            const tx = await I_SecurityToken.connect(token_owner).addModule(I_GeneralPermissionManagerFactory.target, "0x", 0n, 0n, false);
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
                // Not a SecurityToken event
            }
            }

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(BigInt(delegateManagerKey), "General Permission Manager doesn't get deployed");
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            expect(moduleName).to.equal("GeneralPermissionManager", "GeneralPermissionManagerFactory module was not added");
            I_GeneralPermissionManager = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);
        });
        });

        describe("General Permission Manager test cases", async () => {
        it("Get the init data", async () => {
            const initFunction = await I_GeneralPermissionManager.getInitFunction();
            // The original test expects the result to be equivalent to 0, likely an empty bytes4 selector.
            expect(initFunction).to.equal("0x00000000");
        });

        it("Should fail in adding the delegate -- msg.sender doesn't have permission", async () => {
            await catchRevert(
            I_GeneralPermissionManager.connect(account_investor1).addDelegate(account_delegate.address, delegateDetails)
            );
        });

        it("Should fail in adding the delegate -- no delegate details provided", async () => {
            await catchRevert(I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate.address, ethers.ZeroHash));
        });

        it("Should fail in adding the delegate -- no delegate address provided", async () => {
            await catchRevert(I_GeneralPermissionManager.connect(token_owner).addDelegate(address_zero, delegateDetails));
        });

        it("Should fail to remove the delegate -- failed because delegate does not exist", async () => {
            await catchRevert(I_GeneralPermissionManager.connect(token_owner).deleteDelegate(account_delegate.address));
        });

        it("Should successfully add the delegate", async () => {
            const tx = I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate.address, delegateDetails);
            await expect(tx)
            .to.emit(I_GeneralPermissionManager, "AddDelegate")
            .withArgs(account_delegate.address, delegateDetails);
        });

        it("Should successfully add the delegate -- failed because trying to add the already present delegate", async () => {
            await catchRevert(I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate.address, delegateDetails));
        });

        it("Should fail to provide the permission -- because msg.sender doesn't have permission", async () => {
            await catchRevert(
            I_GeneralPermissionManager.connect(account_investor1).changePermission(
                account_delegate.address,
                I_GeneralTransferManager.target,
                ethers.encodeBytes32String("WHITELIST"),
                true
            )
            );
        });

        it("Should check the permission", async () => {
            const hasPermission = await I_GeneralPermissionManager.checkPermission(
            account_delegate.address,
            I_GeneralTransferManager.target,
            ethers.encodeBytes32String("WHITELIST")
            );
            expect(hasPermission).to.be.false;
        });

        it("Should provide the permission", async () => {
            const perm = ethers.encodeBytes32String("WHITELIST");
            const tx = I_GeneralPermissionManager.connect(token_owner).changePermission(
            account_delegate.address,
            I_GeneralTransferManager.target,
            perm,
            true
            );
            await expect(tx)
            .to.emit(I_GeneralPermissionManager, "ChangePermission")
            .withArgs(account_delegate.address, I_GeneralTransferManager.target, perm, true);
        });

        it("Should check the permission", async () => {
            const hasPermission = await I_GeneralPermissionManager.checkPermission(
            account_delegate.address,
            I_GeneralTransferManager.target,
            ethers.encodeBytes32String("WHITELIST")
            );
            expect(hasPermission).to.be.true;
        });

        it("Security token should deny all permission if all permission managers are disabled", async () => {
            await I_SecurityToken.connect(token_owner).archiveModule(I_GeneralPermissionManager.target);
            let hasPermission = await stGetter.checkPermission(
            account_delegate.address,
            I_GeneralTransferManager.target,
            ethers.encodeBytes32String("WHITELIST")
            );
            expect(hasPermission).to.be.false;

            await I_SecurityToken.connect(token_owner).unarchiveModule(I_GeneralPermissionManager.target);
            hasPermission = await stGetter.checkPermission(
            account_delegate.address,
            I_GeneralTransferManager.target,
            ethers.encodeBytes32String("WHITELIST")
            );
            expect(hasPermission).to.be.true;
        });

        it("Should fail to remove the delegate -- failed because unauthorized msg.sender", async () => {
            await catchRevert(I_GeneralPermissionManager.connect(account_delegate).deleteDelegate(account_delegate.address));
        });

        it("Should remove the delegate", async () => {
            const tx = I_GeneralPermissionManager.connect(token_owner).deleteDelegate(account_delegate.address);
        });

        it("Should check the permission", async () => {
            const hasPermission = await I_GeneralPermissionManager.checkPermission(
            account_delegate.address,
            I_GeneralTransferManager.target,
            ethers.encodeBytes32String("WHITELIST")
            );
            expect(hasPermission).to.be.false;
        });

        it("Should successfully add the delegate", async () => {
            const tx = I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate.address, delegateDetails);
            await expect(tx)
            .to.emit(I_GeneralPermissionManager, "AddDelegate")
            .withArgs(account_delegate.address, delegateDetails);
        });

        it("Should check the delegate details", async () => {
            const details = await I_GeneralPermissionManager.delegateDetails(account_delegate.address);
            expect(ethers.decodeBytes32String(details).replace(/\u0000/g, ""))
            .to.equal(ethers.decodeBytes32String(delegateDetails).replace(/\u0000/g, ""), "Wrong delegate address get checked");
        });

        it("Should get the permission of the general permission manager contract", async () => {
            const permissions = await I_GeneralPermissionManager.getPermissions();
            expect(ethers.decodeBytes32String(permissions[0]).replace(/\u0000/g, "")).to.equal("ADMIN", "Wrong permissions");
        });

        it("Should return all delegates", async () => {
            let tokensByDelegate1 = await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate.address);
            expect(tokensByDelegate1[0]).to.equal(I_SecurityToken.target);
            expect(tokensByDelegate1.length).to.equal(1);

            let tokensByDelegate2 = await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate2.address);
            expect(tokensByDelegate2.length).to.equal(0);

            await I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate2.address, delegateDetails);

            tokensByDelegate1 = await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate.address);
            expect(tokensByDelegate1[0]).to.equal(I_SecurityToken.target);
            expect(tokensByDelegate1.length).to.equal(1);

            tokensByDelegate2 = await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate2.address);
            expect(tokensByDelegate2[0]).to.equal(I_SecurityToken.target);
            expect(tokensByDelegate2.length).to.equal(1);

            const allDelegates = await I_GeneralPermissionManager.getAllDelegates();
            expect(allDelegates.length).to.equal(2);
            expect(allDelegates).to.include(account_delegate.address);
            expect(allDelegates).to.include(account_delegate2.address);
        });

        it("Should create a new token and add some more delegates, then get them", async () => {
            // The original test implies a getTokens function on PolyToken. Assuming it exists and works like in previous tests.
            await I_PolyToken.getTokens(ethers.parseEther("500"), token_owner.address);

            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFee);
            
            const tx1 = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, "DEL");
            const receipt1 = await tx1.wait();
            let registerTickerEvent: LogDescription | null = null;
            for (const log of receipt1!.logs) {
            try {
                const parsed = I_STRProxied.interface.parseLog(log);
                if (parsed && parsed.name === "RegisterTicker") {
                registerTickerEvent = parsed;
                break;
                }
            } catch (e) { /* ignore */ }
            }
            expect(registerTickerEvent).to.not.be.null;
            expect(registerTickerEvent!.args._owner).to.equal(token_owner.address);
            expect(registerTickerEvent!.args._ticker).to.equal("DEL");

            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFee);
            
            const tx2 = await I_STRProxied.connect(token_owner).generateNewSecurityToken(name, "DEL", tokenDetails, false, token_owner.address, 0);
            const receipt2 = await tx2.wait();
            let newSecurityTokenEvent: LogDescription | null = null;
            for (const log of receipt2!.logs) {
            try {
                const parsed = I_STRProxied.interface.parseLog(log);
                if (parsed && parsed.name === "NewSecurityToken") {
                newSecurityTokenEvent = parsed;
                break;
                }
            } catch (e) { /* ignore */ }
            }
            expect(newSecurityTokenEvent).to.not.be.null;
            expect(newSecurityTokenEvent!.args._ticker).to.equal("DEL", "SecurityToken doesn't get deployed");

            const I_SecurityToken_DEL = await ethers.getContractAt("ISecurityToken", newSecurityTokenEvent!.args._securityTokenAddress);

            const tx = await I_SecurityToken_DEL.connect(token_owner).addModule(I_GeneralPermissionManagerFactory.target, "0x", 0n, 0n, false);
            const receipt = await tx.wait();
            let moduleAddedEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
            try {
                const parsed = I_SecurityToken_DEL.interface.parseLog(log);
                if (parsed && parsed.name === "ModuleAdded") {
                moduleAddedEvent = parsed;
                break;
                }
            } catch (e) { /* ignore */ }
            }
            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(BigInt(delegateManagerKey), "General Permission Manager doesn't get deployed");
            const moduleName = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, "");
            expect(moduleName).to.equal("GeneralPermissionManager", "GeneralPermissionManagerFactory module was not added");

            const I_GeneralPermissionManager_DEL = await ethers.getContractAt("GeneralPermissionManager", moduleAddedEvent!.args._module);
            await I_GeneralPermissionManager_DEL.connect(token_owner).addDelegate(account_delegate3.address, delegateDetails);

            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate.address))[0]).to.equal(I_SecurityToken.target);
            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate2.address))[0]).to.equal(I_SecurityToken.target);
            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate3.address))[0]).to.equal(I_SecurityToken_DEL.target);
            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate.address)).length).to.equal(1);
            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate2.address)).length).to.equal(1);
            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate3.address)).length).to.equal(1);
            
            await I_GeneralPermissionManager_DEL.connect(token_owner).addDelegate(account_delegate2.address, delegateDetails);
            
            const tokensByDelegate2 = await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate2.address);
            expect(tokensByDelegate2).to.include(I_SecurityToken.target);
            expect(tokensByDelegate2).to.include(I_SecurityToken_DEL.target);
            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate.address)).length).to.equal(1);
            expect(tokensByDelegate2.length).to.equal(2);
            expect((await I_SecurityTokenRegistryInterface.getTokensByDelegate(account_delegate3.address)).length).to.equal(1);
            
            const allDelegates = await I_GeneralPermissionManager_DEL.getAllDelegates();
            expect(allDelegates.length).to.equal(2);
            expect(allDelegates).to.include(account_delegate3.address);
            expect(allDelegates).to.include(account_delegate2.address);
        });

        it("Should check is delegate for 0x address - failed 0x address is not allowed", async () => {
            await catchRevert(I_GeneralPermissionManager.checkDelegate(address_zero));
        });

        it("Should return false when check is delegate - because user is not a delegate", async () => {
            expect(await I_GeneralPermissionManager.checkDelegate(account_investor1.address)).to.be.false;
        });

        it("Should return true when check is delegate - because user is a delegate", async () => {
            expect(await I_GeneralPermissionManager.checkDelegate(account_delegate.address)).to.be.true;
        });

        it("Should successfully provide the permissions in batch -- failed because of array length is 0", async () => {
            await I_GeneralPermissionManager.connect(token_owner).addDelegate(account_delegate3.address, delegateDetails);
            await catchRevert(
            I_GeneralPermissionManager.connect(token_owner).changePermissionMulti(
                account_delegate3.address,
                [],
                [ethers.encodeBytes32String("ADMIN"), ethers.encodeBytes32String("ADMIN")],
                [true, true]
            )
            );
        });

        it("Should successfully provide the permissions in batch -- failed because of perm array length is 0", async () => {
            await catchRevert(
            I_GeneralPermissionManager.connect(token_owner).changePermissionMulti(
                account_delegate3.address,
                [I_GeneralTransferManager.target, I_GeneralPermissionManager.target],
                [],
                [true, true]
            )
            );
        });

        it("Should successfully provide the permissions in batch -- failed because mismatch in arrays length", async () => {
            await catchRevert(
            I_GeneralPermissionManager.connect(token_owner).changePermissionMulti(
                account_delegate3.address,
                [I_GeneralTransferManager.target],
                [ethers.encodeBytes32String("ADMIN"), ethers.encodeBytes32String("ADMIN")],
                [true, true]
            )
            );
        });

        it("Should successfully provide the permissions in batch -- failed because mismatch in arrays length", async () => {
            await catchRevert(
            I_GeneralPermissionManager.connect(token_owner).changePermissionMulti(
                account_delegate3.address,
                [I_GeneralTransferManager.target, I_GeneralPermissionManager.target],
                [ethers.encodeBytes32String("ADMIN"), ethers.encodeBytes32String("ADMIN")],
                [true]
            )
            );
        });

        it("Should successfully provide the permissions in batch", async () => {
            const perm = ethers.encodeBytes32String("ADMIN");
            const tx = I_GeneralPermissionManager.connect(token_owner).changePermissionMulti(
            account_delegate3.address,
            [I_GeneralTransferManager.target, I_GeneralPermissionManager.target],
            [perm, perm],
            [true, true]
            );

            await expect(tx)
            .to.emit(I_GeneralPermissionManager, "ChangePermission")
            .withArgs(account_delegate3.address, I_GeneralTransferManager.target, perm, true);
            
            await expect(tx)
            .to.emit(I_GeneralPermissionManager, "ChangePermission")
            .withArgs(account_delegate3.address, I_GeneralPermissionManager.target, perm, true);

            expect(await I_GeneralPermissionManager.checkPermission(account_delegate3.address, I_GeneralTransferManager.target, perm)).to.be.true;
            expect(await I_GeneralPermissionManager.checkPermission(account_delegate3.address, I_GeneralPermissionManager.target, perm)).to.be.true;
        });

        it("Should provide all delegates with specified permission", async () => {
            const perm = ethers.encodeBytes32String("ADMIN");
            await I_GeneralPermissionManager.connect(token_owner).changePermission(account_delegate2.address, I_GeneralTransferManager.target, perm, true);
            
            const delegates = await I_GeneralPermissionManager.getAllDelegatesWithPerm(I_GeneralTransferManager.target, perm);
            expect(delegates.length).to.equal(2);
            expect(delegates).to.include(account_delegate2.address);
            expect(delegates).to.include(account_delegate3.address);
        });

        it("Should get all delegates for the permission manager", async () => {
            const perm = ethers.encodeBytes32String("ADMIN");
            const delegates = await I_GeneralPermissionManager.getAllDelegatesWithPerm(I_GeneralPermissionManager.target, perm);
            expect(delegates.length).to.equal(1);
            expect(delegates[0]).to.equal(account_delegate3.address);
        });

        it("Should return all modules and all permission", async () => {
            const result = await I_GeneralPermissionManager.getAllModulesAndPermsFromTypes(account_delegate3.address, [2, 1]);
            expect(result[0][0]).to.equal(I_GeneralTransferManager.target);
            expect(ethers.decodeBytes32String(result[1][0]).replace(/\u0000/g, "")).to.equal("ADMIN");
            expect(result[0][1]).to.equal(I_GeneralPermissionManager.target);
            expect(ethers.decodeBytes32String(result[1][1]).replace(/\u0000/g, "")).to.equal("ADMIN");
        });
        });

        describe("General Permission Manager Factory test cases", async () => {
        it("should get the exact details of the factory", async () => {
            expect(await I_GeneralPermissionManagerFactory.setupCost()).to.equal(0n);
            expect((await I_GeneralPermissionManagerFactory.getTypes())[0]).to.equal(1n);
            expect(await I_GeneralPermissionManagerFactory.version()).to.equal("3.0.0");
            expect(ethers.decodeBytes32String(await I_GeneralPermissionManagerFactory.name()).replace(/\u0000/g, "")).to.equal("GeneralPermissionManager", "Wrong Module added");
            expect(await I_GeneralPermissionManagerFactory.description()).to.equal("Manage permissions within the Security Token and attached modules", "Wrong Module added");
            expect(await I_GeneralPermissionManagerFactory.title()).to.equal("General Permission Manager", "Wrong Module added");
        });

        it("Should get the tags of the factory", async () => {
            const tags = await I_GeneralPermissionManagerFactory.getTags();
            expect(ethers.decodeBytes32String(tags[0]).replace(/\u0000/g, "")).to.equal("Permission Management");
        });

    });
});
