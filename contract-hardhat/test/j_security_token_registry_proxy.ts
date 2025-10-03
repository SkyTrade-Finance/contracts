import { ethers } from "hardhat";
import { expect } from "chai";
import { takeSnapshot, revertToSnapshot } from "./helpers/time";
import { setUpPolymathNetwork } from "./helpers/createInstances";
import { Contract, LogDescription } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Helper function to encode function calls, similar to the original's encodeCall
const encodeCall = (contractInterface: any, functionName: string, args: any[]) => {
    return contractInterface.encodeFunctionData(functionName, args);
};

describe("SecurityTokenRegistryProxy", () => {
    let I_SecurityTokenRegistry: Contract;
    let I_SecurityTokenRegistryProxy: Contract;
    let I_GeneralTransferManagerFactory: Contract;
    let I_SecurityTokenRegistryMock: Contract;
    let I_STFactory: Contract;
    let I_PolymathRegistry: Contract;
    let I_ModuleRegistryProxy: Contract;
    let I_PolyToken: Contract;
    let I_STRProxied: Contract;
    let I_MRProxied: Contract;
    let I_SecurityToken: Contract;
    let I_ModuleRegistry: Contract;
    let I_FeatureRegistry: Contract;
    let I_STRGetter: Contract;
    let I_Getter: Contract;
    let I_STGetter: Contract;
    let stGetter: Contract;

    let account_polymath: SignerWithAddress;
    let account_temp: SignerWithAddress;
    let token_owner: SignerWithAddress;
    let account_polymath_new: SignerWithAddress;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("250");
    const initRegFeePOLY = ethers.parseEther("1000");
    const version = "1.0.0";
    const message = "Transaction Should Fail!";

    // SecurityToken Details
    const name = "Team";
    const symbol = "SAP";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;

    const transferManagerKey = 2;

    const address_zero = ethers.ZeroAddress;

    async function readStorage(contractAddress: string, slot: number) {
        return await ethers.provider.getStorage(contractAddress, slot);
    }

    before(async () => {
        [account_polymath, account_temp, token_owner, account_polymath_new] = await ethers.getSigners();

        // Step 1: Deploy the general PM ecosystem
        let instances = await setUpPolymathNetwork(account_polymath.address, token_owner.address);

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
            I_STRProxied,
            I_STRGetter,
            I_STGetter
        ] = instances;

        const SecurityTokenRegistryProxyFactory = await ethers.getContractFactory("SecurityTokenRegistryProxy");
        I_SecurityTokenRegistryProxy = await SecurityTokenRegistryProxyFactory.connect(account_polymath).deploy();
        await I_SecurityTokenRegistryProxy.waitForDeployment();

        await I_PolymathRegistry.connect(account_polymath).changeAddress("SecurityTokenRegistry", I_SecurityTokenRegistryProxy.target);
        await I_MRProxied.connect(account_polymath).updateFromRegistry();

        // Printing all the contract addresses
        console.log(`
         --------------------- Polymath Network Smart Contracts: ---------------------
         PolymathRegistry:                  ${I_PolymathRegistry.target}
         SecurityTokenRegistryProxy:        ${I_SecurityTokenRegistryProxy.target}
         SecurityTokenRegistry:             ${I_SecurityTokenRegistry.target}

         STFactory:                         ${I_STFactory.target}
         GeneralTransferManagerFactory:     ${I_GeneralTransferManagerFactory.target}
         -----------------------------------------------------------------------------
         `);
    });

    describe("Attach the implementation address", async () => {
        it("Should attach the implementation and version", async () => {
            const STRGetterFactory = await ethers.getContractFactory("STRGetter");
            I_STRGetter = await STRGetterFactory.connect(account_polymath).deploy();
            await I_STRGetter.waitForDeployment();

            const registryInterface = (await ethers.getContractFactory("SecurityTokenRegistry")).interface;
            let bytesProxy = encodeCall(registryInterface, "initialize", [
                I_PolymathRegistry.target,
                initRegFee,
                initRegFee,
                account_polymath.address,
                I_STRGetter.target
            ]);

            await I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeToAndCall("1.0.0", I_SecurityTokenRegistry.target, bytesProxy);

            const proxyAddress = I_SecurityTokenRegistryProxy.target;
            expect((await readStorage(proxyAddress, 12)).toLowerCase()).to.contain(I_SecurityTokenRegistry.target.toLowerCase().substring(2));
            expect(
                ethers.toUtf8String(await readStorage(proxyAddress, 11))
                    .replace(/\u0000/g, "")
                    .replace(/\n/, "")
            ).to.equal("1.0.0");

            I_STRProxied = await ethers.getContractAt("SecurityTokenRegistry", proxyAddress);
            I_STRGetter = await ethers.getContractAt("STRGetter", proxyAddress);
            await I_STRProxied.connect(account_polymath).setProtocolFactory(I_STFactory.target, 3, 0, 0);
            await I_STRProxied.connect(account_polymath).setLatestVersion(3, 0, 0);
        });

        it("Verify the initialize data", async () => {
            expect(await I_STRProxied.getUintValue(ethers.id("expiryLimit"))).to.equal(60 * 24 * 60 * 60);
            expect(await I_STRProxied.getUintValue(ethers.id("tickerRegFee"))).to.equal(ethers.parseEther("250"));
        });

        it("Upgrade the proxy again and change getter", async () => {
            let snapId = await takeSnapshot();
            const MockSTRGetterFactory = await ethers.getContractFactory("MockSTRGetter");
            const I_MockSTRGetter = await MockSTRGetterFactory.connect(account_polymath).deploy();
            await I_MockSTRGetter.waitForDeployment();

            const MockSecurityTokenRegistryFactory = await ethers.getContractFactory("SecurityTokenRegistry");
            const I_MockSecurityTokenRegistry = await MockSecurityTokenRegistryFactory.connect(account_polymath).deploy();
            await I_MockSecurityTokenRegistry.waitForDeployment();

            const bytesProxy = encodeCall(I_MockSecurityTokenRegistry.interface, "setGetterRegistry", [I_MockSTRGetter.target]);
            console.log("Getter: " + I_MockSTRGetter.target);
            console.log("Registry: " + I_MockSecurityTokenRegistry.target);
            console.log("STRProxy: " + I_SecurityTokenRegistryProxy.target);

            await I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeToAndCall("2.0.0", I_MockSecurityTokenRegistry.target, bytesProxy);

            const proxyAddress = I_SecurityTokenRegistryProxy.target;
            expect((await readStorage(proxyAddress, 12)).toLowerCase()).to.contain(I_MockSecurityTokenRegistry.target.toLowerCase().substring(2));
            expect(
                ethers.toUtf8String(await readStorage(proxyAddress, 11))
                    .replace(/\u0000/g, "")
                    .replace(/\n/, "")
            ).to.equal("2.0.0");

            const I_MockSecurityTokenRegistryProxy = await ethers.getContractAt("SecurityTokenRegistry", proxyAddress);
            const I_MockSTRGetterProxy = await ethers.getContractAt("MockSTRGetter", proxyAddress);
            await I_MockSecurityTokenRegistryProxy.connect(account_polymath).setProtocolFactory(I_STFactory.target, 3, 1, 0);
            await I_MockSecurityTokenRegistryProxy.connect(account_polymath).setLatestVersion(3, 1, 0);
            let newValue = await I_MockSTRGetterProxy.newFunction();
            expect(newValue).to.equal(99);
            await revertToSnapshot(snapId);
        });
    });

    describe("Feed some data in storage", async () => {
        it("Register the ticker", async () => {
            await I_PolyToken.getTokens(ethers.parseEther("8000"), token_owner.address);
            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFeePOLY);
            
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
                        expect(parsed.args._ticker).to.equal(symbol);
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
            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFeePOLY);

            const tx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(name, symbol, tokenDetails, false, token_owner.address, 0);
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = await I_STRProxied.getAddress();
        
            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let newSecurityTokenEvent: LogDescription = {} as LogDescription;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "NewSecurityToken") { 
                        expect(parsed.args._owner).to.equal(token_owner.address);
                        expect(parsed.args._ticker).to.equal(symbol);
                        newSecurityTokenEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(newSecurityTokenEvent).to.be.not.undefined;

            // const newSecurityTokenEvent = receipt.logs.find((log: any) => log.fragment && log.fragment.name === 'LogNewSecurityToken');
            // expect(newSecurityTokenEvent.args._ticker).to.equal(symbol);

            const securityTokenAddress = newSecurityTokenEvent.args._securityTokenAddress;
            I_SecurityToken = await ethers.getContractAt("SecurityToken", securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", securityTokenAddress);
            expect(await stGetter.getTreasuryWallet()).to.equal(token_owner.address);

            let moduleAddedEvent: LogDescription | null = null;
            for (const log of receipt!.logs) {
                try {
                    const parsed = I_SecurityToken.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "ModuleAdded") {
                        moduleAddedEvent = parsed;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse ModuleAdded log: ${err.message}`);
                }
            }

            expect(moduleAddedEvent).to.not.be.null;
            expect(moduleAddedEvent!.args._types[0]).to.equal(2n);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            expect(nameBytes32).to.equal("GeneralTransferManager", "SecurityToken doesn't have the transfer manager module");
        });
    });

    describe("Upgrade the imlplementation address", async () => {
        before(async () => {
            const SecurityTokenRegistryMockFactory = await ethers.getContractFactory("SecurityTokenRegistryMock");
            I_SecurityTokenRegistryMock = await SecurityTokenRegistryMockFactory.connect(account_polymath).deploy();
            await I_SecurityTokenRegistryMock.waitForDeployment();
        });

        it("Should upgrade the version and implementation address -- fail bad owner", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_temp).upgradeTo("1.1.0", I_SecurityTokenRegistryMock.target)
            ).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- Implementaion address should be a contract address", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", account_temp.address)
            ).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- Implemenation address should not be 0x", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", address_zero)
            ).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- Implemenation address should not be the same address", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", I_SecurityTokenRegistry.target)
            ).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- same version as previous is not allowed", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeTo("1.0.0", I_SecurityTokenRegistryMock.target)
            ).to.be.reverted;
        });

        it("Should upgrade the version and implementation address -- empty version string is not allowed", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeTo("", I_SecurityTokenRegistryMock.target)
            ).to.be.reverted;
        });

        it("Should upgrade the version and the implementation address successfully", async () => {
            await I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeTo("1.1.0", I_SecurityTokenRegistryMock.target);
            const proxyAddress = I_SecurityTokenRegistryProxy.target;
            
            expect(
                ethers.toUtf8String(await readStorage(proxyAddress, 11))
                    .replace(/\u0000/g, "")
                    .replace(/\n/, "")
            ).to.equal("1.1.0");
            expect((await readStorage(proxyAddress, 12)).toLowerCase()).to.contain(I_SecurityTokenRegistryMock.target.toLowerCase().substring(2));
            
            I_STRProxied = await ethers.getContractAt("SecurityTokenRegistryMock", proxyAddress);
            I_Getter = await ethers.getContractAt("STRGetter", proxyAddress);
        });
    });

    describe("Execute functionality of the implementation contract on the earlier storage", async () => {
        it("Should get the previous data", async () => {
            let _tokenAddress = await I_Getter.getSecurityTokenAddress(symbol);
            let _data = await I_Getter.getSecurityTokenData(_tokenAddress);
            expect(_data[0]).to.equal(symbol);
            expect(_data[1]).to.equal(token_owner.address);
            expect(_data[2]).to.equal(tokenDetails);
        });

        it("Should alter the old storage", async () => {
            await I_STRProxied.connect(account_polymath).changeTheFee(0);
            let feesToken = await I_STRProxied.getFees("0xd677304bb45536bb7fdfa6b9e47a3c58fe413f9e8f01474b0a4b9c6e0275baf2");
            console.log(feesToken);
            // Original test had commented out assertions
        });
    });

    describe("Transfer the ownership of the proxy contract", async () => {
        it("Should change the ownership of the contract -- because of bad owner", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_temp).transferProxyOwnership(account_polymath_new.address)
            ).to.be.reverted;
        });

        it("Should change the ownership of the contract -- new address should not be 0x", async () => {
            await expect(
                I_SecurityTokenRegistryProxy.connect(account_polymath).transferProxyOwnership(address_zero)
            ).to.be.reverted;
        });

        it("Should change the ownership of the contract", async () => {
            await I_SecurityTokenRegistryProxy.connect(account_polymath).transferProxyOwnership(account_polymath_new.address);
            let _currentOwner = await I_SecurityTokenRegistryProxy.connect(account_polymath_new).proxyOwner.staticCall();
            
            expect(_currentOwner).to.equal(account_polymath_new.address);
        });

        it("Should change the implementation contract and version by the new owner", async () => {
            const SecurityTokenRegistryFactory = await ethers.getContractFactory("SecurityTokenRegistry");
            I_SecurityTokenRegistry = await SecurityTokenRegistryFactory.connect(account_polymath).deploy();
            await I_SecurityTokenRegistry.waitForDeployment();

            await I_SecurityTokenRegistryProxy.connect(account_polymath_new).upgradeTo("1.2.0", I_SecurityTokenRegistry.target);
            const proxyAddress = I_SecurityTokenRegistryProxy.target;

            expect(
                ethers.toUtf8String(await readStorage(proxyAddress, 11))
                    .replace(/\u0000/g, "")
                    .replace(/\n/, "")
            ).to.equal("1.2.0");
            expect((await readStorage(proxyAddress, 12)).toLowerCase()).to.contain(I_SecurityTokenRegistry.target.toLowerCase().substring(2));
            
            I_STRProxied = await ethers.getContractAt("SecurityTokenRegistry", proxyAddress);
        });

        it("Should get the version", async () => {
            expect(await I_SecurityTokenRegistryProxy.connect(account_polymath_new).version.staticCall()).to.equal("1.2.0");
        });

        it("Should get the implementation address", async () => {
            expect(await I_SecurityTokenRegistryProxy.connect(account_polymath_new).implementation.staticCall()).to.equal(I_SecurityTokenRegistry.target);
        });
    });
});
