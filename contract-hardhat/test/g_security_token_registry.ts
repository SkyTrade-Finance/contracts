import { assert, expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, ContractFactory } from "ethers";

import { latestTime } from "./helpers/latestTime";
import { duration } from "./helpers/utils";
import { takeSnapshot, increaseTime, revertToSnapshot } from "./helpers/time";
import { encodeProxyCall, encodeModuleCall } from "./helpers/encodeCall";
import { catchRevert } from "./helpers/exceptions";
import { setUpPolymathNetwork, deployDummySTOAndVerifyed } from "./helpers/createInstances";

describe("SecurityTokenRegistry", function() {
    // Accounts Variable declaration
    let account_polymath: HardhatEthersSigner;
    let account_investor1: HardhatEthersSigner;
    let account_issuer: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let account_investor2: HardhatEthersSigner;
    let account_fundsReceiver: HardhatEthersSigner;
    let account_delegate: HardhatEthersSigner;
    let account_temp: HardhatEthersSigner;
    let dummy_token: HardhatEthersSigner;
    let treasury_wallet: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    let balanceOfReceiver: bigint;

    let ID_snap: string;
    const message = "Transaction Should Fail!!";

    // Contract Instance Declaration
    let I_GeneralTransferManagerFactory: Contract;
    let I_GeneralPermissionManager: Contract;
    let I_GeneralTransferManager: Contract;
    let I_ModuleRegistryProxy: Contract;
    let I_ModuleRegistry: Contract;
    let I_FeatureRegistry: Contract;
    let I_SecurityTokenRegistry: Contract;
    let I_SecurityTokenRegistryV2: Contract;
    let I_DummySTOFactory: Contract;
    let I_STVersion: Contract;
    let I_SecurityToken: Contract;
    let I_DummySTO: Contract;
    let I_PolyToken: Contract;
    let I_STFactory: Contract;
    let I_STFactory002: Contract;
    let I_SecurityToken002: Contract;
    let I_STFactory003: Contract;
    let I_PolymathRegistry: Contract;
    let I_SecurityTokenRegistryProxy: Contract;
    let I_STRProxied: Contract;
    let I_MRProxied: Contract;
    let I_STRGetter: Contract;
    let I_Getter: Contract;
    let I_STGetter: Contract;
    let stGetter: Contract;
    let I_USDOracle: Contract;
    let I_POLYOracle: Contract;
    let I_StablePOLYOracle: Contract;
    let I_TokenLib: Contract;

    // Contract Factories
    let SecurityTokenRegistryFactory: ContractFactory;
    let SecurityTokenRegistryProxyFactory: ContractFactory;
    let STRGetterFactory: ContractFactory;

    // SecurityToken Details (Launched ST on the behalf of the issuer)
    const name = "Demo Token";
    const symbol = "DET";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    //Security Token Detials (Version 2)
    const name2 = "Demo2 Token";
    const symbol2 = "DET2";
    const tokenDetails2 = "This is equity type of issuance";
    const address_zero = "0x0000000000000000000000000000000000000000";
    const one_address = "0x0000000000000000000000000000000000000001";

    // Module key
    const permissionManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;
    const budget = 0;

    // Initial fee for ticker registry and security token registry
    const initRegFee = ethers.parseEther("250");
    const initRegFeePOLY = ethers.parseEther("1000");

    const STRProxyParameters = ["address", "uint256", "uint256", "address", "address"];
    const STOParameters = ["uint256", "uint256", "uint256", "string"];

    // Capped STO details
    const cap = ethers.parseEther("10000");
    const someString = "Hello string";

    let currentTime: number;

    function _pack(_major: number, _minor: number, _patch: number): number {
        let packedVersion = (parseInt(_major.toString()) << 16) | (parseInt(_minor.toString()) << 8) | parseInt(_patch.toString());
        return packedVersion;
    }

    before(async () => {
        currentTime = await latestTime();
        
        // Get signers
        accounts = await ethers.getSigners();
        
        treasury_wallet = accounts[2];
        account_polymath = accounts[0];
        account_issuer = accounts[1];
        account_investor1 = accounts[9];
        account_investor2 = accounts[6];
        account_fundsReceiver = accounts[4];
        account_delegate = accounts[5];
        account_temp = accounts[8];
        token_owner = account_issuer;
        dummy_token = accounts[3];

        // Get contract factories
        SecurityTokenRegistryFactory = await ethers.getContractFactory("SecurityTokenRegistry");
        SecurityTokenRegistryProxyFactory = await ethers.getContractFactory("SecurityTokenRegistryProxy");
        STRGetterFactory = await ethers.getContractFactory("STRGetter");

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
            I_SecurityTokenRegistryProxy,
            I_STRProxied,
            I_STRGetter,
            I_STGetter,
            I_USDOracle,
            I_POLYOracle,
            I_StablePOLYOracle
        ] = instances;

        // STEP 8: Deploy the CappedSTOFactory
        [I_DummySTOFactory] = await deployDummySTOAndVerifyed(account_polymath.address, I_MRProxied, 0);
        
        // Step 9: Deploy the SecurityTokenRegistry
        console.log(await I_SecurityTokenRegistry.getAddress());
        I_SecurityTokenRegistry = await SecurityTokenRegistryFactory.connect(account_polymath).deploy();
        await I_SecurityTokenRegistry.waitForDeployment();
        console.log(await I_SecurityTokenRegistry.getAddress());

        expect(await I_SecurityTokenRegistry.getAddress()).to.not.equal(
            address_zero,
            "SecurityTokenRegistry contract was not deployed"
        );

        // Step 9 (a): Deploy the proxy
        I_SecurityTokenRegistryProxy = await SecurityTokenRegistryProxyFactory.connect(account_polymath).deploy();
        await I_SecurityTokenRegistryProxy.waitForDeployment();
        
        // Step 10 : Deploy the getter contract
        I_STRGetter = await STRGetterFactory.connect(account_polymath).deploy();
        await I_STRGetter.waitForDeployment();
        
        //Step 11: update the registries addresses from the PolymathRegistry contract
        await I_PolymathRegistry.connect(account_polymath).changeAddress("SecurityTokenRegistry", await I_SecurityTokenRegistryProxy.getAddress());
        await I_MRProxied.connect(account_polymath).updateFromRegistry();

        console.log(`
        --------------------- Polymath Network Smart Contracts: ---------------------
        PolymathRegistry:                  ${await I_PolymathRegistry.getAddress()}
        SecurityTokenRegistryProxy:        ${await I_SecurityTokenRegistryProxy.getAddress()}
        SecurityTokenRegistry:             ${await I_SecurityTokenRegistry.getAddress()}
        ModuleRegistry:                    ${await I_ModuleRegistry.getAddress()}
        ModuleRegistryProxy:               ${await I_ModuleRegistryProxy.getAddress()}
        FeatureRegistry:                   ${await I_FeatureRegistry.getAddress()}

        STFactory:                         ${await I_STFactory.getAddress()}
        GeneralTransferManagerFactory:     ${await I_GeneralTransferManagerFactory.getAddress()}

        DummySTOFactory:                  ${await I_DummySTOFactory.getAddress()}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Test the initialize the function", async () => {
        it("Should successfully update the implementation address -- fail because polymathRegistry address is 0x", async () => {
            let bytesProxy = encodeProxyCall(STRProxyParameters, [
                address_zero,
                initRegFee,
                initRegFee,
                account_polymath.address,
                await I_STRGetter.getAddress()
            ]);
            await catchRevert(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeToAndCall("1.0.0", await I_SecurityTokenRegistry.getAddress(), bytesProxy),
                "tx-> revert because polymathRegistry address is 0x"
            );
        });

        it("Should successfully update the implementation address -- fail because owner address is 0x", async () => {
            let bytesProxy = encodeProxyCall(STRProxyParameters, [
                await I_PolymathRegistry.getAddress(),
                initRegFee,
                initRegFee,
                address_zero,
                await I_STRGetter.getAddress()
            ]);
            await catchRevert(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeToAndCall("1.0.0", await I_SecurityTokenRegistry.getAddress(), bytesProxy),
                "tx-> revert because owner address is 0x"
            );
        });

        it("Should successfully update the implementation address -- fail because all params get 0", async () => {
            let bytesProxy = encodeProxyCall(STRProxyParameters, [address_zero, 0n, 0n, address_zero, address_zero]);
            await catchRevert(
                I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeToAndCall("1.0.0", await I_SecurityTokenRegistry.getAddress(), bytesProxy),
                "tx-> revert because owner address is 0x"
            );
        });

        it("Should successfully update the implementation address", async () => {
            let bytesProxy = encodeProxyCall(STRProxyParameters, [
                await I_PolymathRegistry.getAddress(),
                initRegFee,
                initRegFee,
                account_polymath.address,
                await I_STRGetter.getAddress()
            ]);
            await I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeToAndCall("1.0.0", await I_SecurityTokenRegistry.getAddress(), bytesProxy);
            
            I_Getter = await ethers.getContractAt("STRGetter", await I_SecurityTokenRegistryProxy.getAddress());
            I_STRProxied = await ethers.getContractAt("SecurityTokenRegistry", await I_SecurityTokenRegistryProxy.getAddress());
            
            await I_STRProxied.setProtocolFactory(await I_STFactory.getAddress(), 3, 0, 0);
            await I_STRProxied.setLatestVersion(3, 0, 0);

            let latestSTF = await I_Getter.getSTFactoryAddress();
            console.log(latestSTF);
            expect(await I_Getter.getSTFactoryAddressOfVersion(196608)).to.equal(latestSTF); //196608 is 3.0.0 in packed format
            
            let info = await I_Getter.getLatestProtocolVersion();
            for (let i = 0; i < info.length; i++) {
                console.log(info[i].toString());
            }
            console.log(await I_Getter.getLatestProtocolVersion());
        });
    });

    describe(" Test cases of the registerTicker", async () => {
        it("verify the intial parameters", async () => {
            let intialised = await I_STRProxied.getBoolValue(ethers.keccak256(ethers.toUtf8Bytes("initialised")));
            assert.isTrue(intialised, "Should be true");

            let expiry = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("expiryLimit")));
            assert.equal(Number(expiry), 5184000, "Expiry limit should be equal to 60 days");

            let polytoken = await I_STRProxied.getAddressValue(ethers.keccak256(ethers.toUtf8Bytes("polyToken")));
            assert.equal(polytoken, await I_PolyToken.getAddress(), "Should be the polytoken address");

            let stlaunchFee = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("stLaunchFee")));
            assert.equal(stlaunchFee, initRegFee, "Should be provided reg fee");

            let tickerRegFee = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("tickerRegFee")));
            assert.equal(tickerRegFee, initRegFee, "Should be provided reg fee");

            let polymathRegistry = await I_STRProxied.getAddressValue(ethers.keccak256(ethers.toUtf8Bytes("polymathRegistry")));
            assert.equal(polymathRegistry, await I_PolymathRegistry.getAddress(), "Should be the address of the polymath registry");

            let getterContract = await I_STRProxied.getAddressValue(ethers.keccak256(ethers.toUtf8Bytes("STRGetter")));
            assert.equal(getterContract, await I_STRGetter.getAddress(), "Should be the address of the getter contract");

            let owner = await I_STRProxied.getAddressValue(ethers.keccak256(ethers.toUtf8Bytes("owner")));
            assert.equal(owner, account_polymath.address, "Should be the address of the registry owner");
        });

        it("Can't call the initialize function again", async () => {
            await catchRevert(
                I_STRProxied.initialize(
                    await I_PolymathRegistry.getAddress(),
                    initRegFee,
                    initRegFee,
                    account_polymath.address,
                    await I_STRGetter.getAddress()
                ),
                "tx revert -> Can't call the initialize function again"
            );
        });

        it("Should fail to register ticker if tickerRegFee not approved", async () => {
            await catchRevert(
                I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, symbol),
                "tx revert -> POLY allowance not provided for registration fee"
            );
        });

        it("Should fail to register ticker if owner is 0x", async () => {
            await I_PolyToken.connect(account_temp).getTokens(initRegFeePOLY, account_temp.address);
            await I_PolyToken.connect(account_temp).approve(I_STRProxied.target, initRegFeePOLY);

            await catchRevert(
                I_STRProxied.connect(account_temp).registerNewTicker(address_zero, symbol),
                "tx revert -> owner should not be 0x"
            );
        });

        it("Should fail to register ticker due to the symbol length is 0", async () => {
            await catchRevert(I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, ""), "tx revert -> Symbol Length is 0");
        });

        it("Should fail to register ticker due to the symbol length is greater than 10", async () => {
            await catchRevert(
                I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, "POLYMATHNET"),
                "tx revert -> Symbol Length is greater than 10"
            );
        });

        it("Should register the ticker before the generation of the security token", async () => {
            let tx = await I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, symbol);
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
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal(symbol.toUpperCase());
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            
            let data = await I_Getter.getTickerDetails(symbol);
            assert.equal(data[0], account_temp.address);
            // trying to access the function data directly from the STRGetter then it should give all values zero
            data = await I_STRGetter.getTickerDetails(symbol);
            assert.equal(data[0], address_zero);
            assert.equal(data[3], "");
        });

        // it("Should change ticker price based on oracle", async () => {
        //     let snap_Id = await takeSnapshot();
        //     let origPriceUSD = ethers.parseEther("250");
        //     let origPricePOLY = ethers.parseEther("1000");
        //     const currentRate = await I_POLYOracle.getPrice();
        //     console.log("Current Rate: ", currentRate);
        //     let feesTicker = await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     let feesToken = await I_STRProxied.getFees("0xd677304bb45536bb7fdfa6b9e47a3c58fe413f9e8f01474b0a4b9c6e0275baf2");
        //     console.log("Fees Ticker: ", feesTicker);
        //     assert.equal(feesTicker[0], origPriceUSD);
        //     assert.equal(feesTicker[1], origPricePOLY);
        //     assert.equal(feesToken[0], origPriceUSD);
        //     assert.equal(feesToken[1], origPricePOLY);
        //     await I_POLYOracle.changePrice(27n * 10n ** 16n);
        //     await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesTicker = await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesToken = await I_STRProxied.getFees("0xd677304bb45536bb7fdfa6b9e47a3c58fe413f9e8f01474b0a4b9c6e0275baf2");
        //     // No change as difference is less than 10%
        //     assert.equal(feesTicker[0], origPriceUSD);
        //     assert.equal(feesTicker[1], origPricePOLY);
        //     assert.equal(feesToken[0], origPriceUSD);
        //     assert.equal(feesToken[1], origPricePOLY);
        //     await I_POLYOracle.changePrice(20n * 10n ** 16n);
        //     await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesTicker = await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesToken = await I_STRProxied.getFees("0xd677304bb45536bb7fdfa6b9e47a3c58fe413f9e8f01474b0a4b9c6e0275baf2");
        //     let newPricePOLY = ethers.parseEther("1250");
        //     assert.equal(feesTicker[0], origPriceUSD);
        //     assert.equal(feesTicker[1], newPricePOLY);
        //     assert.equal(feesToken[0], origPriceUSD);
        //     assert.equal(feesToken[1], newPricePOLY);
        //     await I_POLYOracle.changePrice(21n * 10n ** 16n);
        //     await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesTicker = await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesToken = await I_STRProxied.getFees("0xd677304bb45536bb7fdfa6b9e47a3c58fe413f9e8f01474b0a4b9c6e0275baf2");
        //     // No change as difference is less than 10%
        //     assert.equal(feesTicker[0], origPriceUSD);
        //     assert.equal(feesTicker[1], newPricePOLY);
        //     assert.equal(feesToken[0], origPriceUSD);
        //     assert.equal(feesToken[1], newPricePOLY);
        //     await I_StablePOLYOracle.changeEvictPercentage(10n ** 16n);
        //     await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesTicker = await I_STRProxied.getFees("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2");
        //     feesToken = await I_STRProxied.getFees("0xd677304bb45536bb7fdfa6b9e47a3c58fe413f9e8f01474b0a4b9c6e0275baf2");
        //     // Change as eviction percentage updated
        //     // newPricePOLY = new BN(web3.utils.toWei("1250"));
        //     //1190.476190476190476190 = 250/0.21
        //     assert.equal(feesTicker[0], origPriceUSD);
        //     assert.equal(feesTicker[1], 1190476190476190476190n);
        //     assert.equal(feesToken[0], origPriceUSD);
        //     assert.equal(feesToken[1], 1190476190476190476190n);
        //     await revertToSnapshot(snap_Id);
        // });

        it("Should register the ticker when the tickerRegFee is 0", async () => {
            let snap_Id = await takeSnapshot();
            await I_STRProxied.connect(account_polymath).changeTickerRegistrationFee(0);
            let tx = await I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, "ZERO");
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
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("ZERO");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            await revertToSnapshot(snap_Id);
        });

        it("Should fail to register same symbol again", async () => {
            // Give POLY to token issuer
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFeePOLY);
            // Call registration function
            await catchRevert(
                I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbol),
                "tx revert -> Symbol is already alloted to someone else"
            );
        });

        it("Should successfully register pre registerd ticker if expiry is reached", async () => {
            await increaseTime(5184000 + 100); // 60(5184000) days of expiry + 100 sec for buffer
            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, initRegFeePOLY);
            let tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbol);
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);

            const strProxiedAddress = String(I_STRProxied.target);

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

        it("Should fail to register ticker if registration is paused", async () => {
            await I_STRProxied.connect(account_polymath).pause();
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFeePOLY);

            await catchRevert(
                I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, "AAA"),
                "tx revert -> Registration is paused"
            );
        });

        it("Should fail to pause if already paused", async () => {
            await catchRevert(I_STRProxied.connect(account_polymath).pause(), "tx revert -> Registration is already paused");
        });

        it("Should successfully register ticker if registration is unpaused", async () => {
            await I_STRProxied.connect(account_polymath).unpause();
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFeePOLY);
            let tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, "AAA");
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);

            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(token_owner.address);
                        expect(parsed.args._ticker).to.equal("AAA");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
        });

        it("Should fail to unpause if already unpaused", async () => {
            await catchRevert(I_STRProxied.connect(account_polymath).unpause(), "tx revert -> Registration is already unpaused");
        });
    });

    describe("Test cases for the expiry limit", async () => {
        it("Should fail to set the expiry limit because msg.sender is not owner", async () => {
            await catchRevert(I_STRProxied.connect(account_temp).changeExpiryLimit(duration.days(10)), "tx revert -> msg.sender is not owner");
        });

        it("Should successfully set the expiry limit", async () => {
            await I_STRProxied.connect(account_polymath).changeExpiryLimit(duration.days(10));
            assert.equal(
                Number(await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("expiryLimit")))),
                duration.days(10),
                "Failed to change the expiry limit"
            );
        });

        it("Should fail to set the expiry limit because new expiry limit is lesser than one day", async () => {
            await catchRevert(
                I_STRProxied.connect(account_polymath).changeExpiryLimit(duration.seconds(5000)),
                "tx revert -> New expiry limit is lesser than one day"
            );
        });
    });

    describe("Test cases for the getTickerDetails", async () => {
        it("Should get the details of the symbol", async () => {
            let tx = await I_Getter.getTickerDetails(symbol);
            assert.equal(tx[0], token_owner.address, "Should equal to the rightful owner of the ticker");
            assert.equal(tx[3], "", "Name of the token should equal be null/empty as it's not stored anymore");
            assert.equal(tx[4], false, "Status if the symbol should be undeployed -- false");
        });

        it("Should get the details of unregistered token", async () => {
            let tx = await I_Getter.getTickerDetails("TORO");
            assert.equal(tx[0], address_zero, "Should be 0x as ticker is not exists in the registry");
            assert.equal(tx[3], "", "Should be an empty string");
            assert.equal(tx[4], false, "Status if the symbol should be undeployed -- false");
        });
    });

    describe("Generate SecurityToken", async () => {
        it("Should get the ticker details successfully and prove the data is not storing in to the logic contract", async () => {
            let data = await I_Getter.getTickerDetails(symbol);
            assert.equal(data[0], token_owner.address, "Token owner should be equal");
            assert.equal(data[3], "", "Name of the token should equal be null/empty as it's not stored anymore");
            assert.equal(data[4], false, "Token is not launched yet so it should return False");
            data = await I_STRGetter.getTickerDetails(symbol);
            console.log("This is the data from the original securityTokenRegistry contract");
            assert.equal(data[0], address_zero, "Token owner should be 0x");
        });

        it("Should fail to generate new security token if fee not provided", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), 0n);

            await catchRevert(
                I_STRProxied.connect(token_owner).generateNewSecurityToken(name, symbol, tokenDetails, false, token_owner.address, 0),
                "tx revert -> POLY allowance not provided for registration fee"
            );
        });

        it("Should fail to generate token if registration is paused", async () => {
            await I_STRProxied.connect(account_polymath).pause();
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFeePOLY);

            await catchRevert(
                I_STRProxied.connect(token_owner).generateNewSecurityToken(name, symbol, tokenDetails, false, token_owner.address, 0),
                "tx revert -> Registration is paused"
            );
        });

        it("Should fail to generate the securityToken -- Because ticker length is 0", async () => {
            await I_STRProxied.unpause({ from: account_polymath });

            await catchRevert(
                I_STRProxied.connect(token_owner).generateNewSecurityToken(name, "0x0", tokenDetails, false, token_owner, 0),
                "tx revert -> Zero ticker length is not allowed"
            );
        });

        it("Should fail to generate the securityToken -- Because name length is 0", async () => {
            await catchRevert(
                I_STRProxied.connect(token_owner).generateNewSecurityToken("", symbol, tokenDetails, false, token_owner, 0),
                "tx revert -> 0 name length is not allowed"
            );
        });

        it("Should fail to generate the securityToken -- Because version is not valid", async () => {
            await catchRevert(
                I_STRProxied.connect(token_owner).generateNewSecurityToken("", symbol, tokenDetails, false, token_owner, 12356),
                "tx revert -> 0 name length is not allowed"
            );
        });

        it("Should fail to generate the securityToken -- Because treasury wallet is 0x0", async () => {
            await catchRevert(
                I_STRProxied.connect(token_owner).generateNewSecurityToken(name, symbol, tokenDetails, false, address_zero, 0),
                "tx revert -> 0x0 value of treasury wallet is not allowed"
            );
        });

        it("Should fail to generate the securityToken -- Because msg.sender is not the rightful owner of the ticker", async () => {
            await catchRevert(
                I_STRProxied.connect(account_temp).generateNewSecurityToken(name, symbol, tokenDetails, false, token_owner, 0),
                "tx revert -> Because msg.sender is not the rightful owner of the ticker"
            );
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            console.log(await I_STRGetter.getSTFactoryAddress());
            let info = await I_STRGetter.getLatestProtocolVersion();
            for (let i = 0; i < info.length; i++) {
            console.log(info[i].toString());
            }
            console.log(await I_STRGetter.getLatestProtocolVersion());
            let tx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(name, symbol, tokenDetails, false, treasury_wallet.address, 0);

            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            // Verify the successful generation of the security token
            const newSecurityTokenEvent = (receipt?.logs as any[]).find(log => log.eventName === 'NewSecurityToken');
            expect(newSecurityTokenEvent).to.not.be.undefined;
            assert.equal(newSecurityTokenEvent.args._ticker, symbol, "SecurityToken doesn't get deployed");

            I_SecurityToken = await ethers.getContractAt("SecurityToken", newSecurityTokenEvent.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", I_SecurityToken.target);
            assert.equal(await stGetter.getTreasuryWallet(), treasury_wallet.address, "Incorrect wallet set")

            let securityTokenEvent: any = null;
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

        it("Should fail to generate the SecurityToken when token is already deployed with the same symbol", async () => {
            await catchRevert(
            I_STRProxied.connect(token_owner).generateNewSecurityToken(name, symbol, tokenDetails, false, treasury_wallet.address, 0),
            "tx revert -> Because ticker is already in use"
            );
        });

        it("Should fail to generate the SecurityToken because ticker gets expired", async () => {
            let snap_Id = await takeSnapshot();
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), ethers.parseEther("2000"));
            await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, "CCC");
            await increaseTime(duration.days(65));
            await catchRevert(
            I_STRProxied.connect(token_owner).generateNewSecurityToken(name, "CCC", tokenDetails, false, treasury_wallet.address, 0),
            "tx revert -> Because ticker is expired"
            );
            await revertToSnapshot(snap_Id);
        });

        it("Should generate the SecurityToken when launch fee is 0", async () => {
            let snap_Id = await takeSnapshot();
            await I_STRProxied.connect(account_polymath).changeSecurityLaunchFee(0n);
            await I_STRProxied.connect(account_polymath).changeTickerRegistrationFee(0n);
            //await I_PolyToken.approve(I_STRProxied.address, new BN(web3.utils.toWei("2000")));
            await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, "CCC");
            await I_STRProxied.connect(token_owner).generateNewSecurityToken(name, "CCC", tokenDetails, false, treasury_wallet.address, 0);
            await revertToSnapshot(snap_Id);
        });

        it("Should get all created security tokens", async() => {
            let snap_Id = await takeSnapshot();
            // Assuming getTokens is a privileged function called by polymath account
            await I_PolyToken.connect(account_polymath).getTokens(ethers.parseEther("2000"), account_temp.address);
            await I_PolyToken.connect(account_temp).approve(await I_STRProxied.getAddress(), ethers.parseEther("2000"));
            await I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, "TMP");
            let tx = await I_STRProxied.connect(account_temp).generateNewSecurityToken(name, "TMP", tokenDetails, false, account_temp.address, 0);

            const receipt = await tx.wait();
            // Verify the successful generation of the security token
            const newSecurityTokenEvent = (receipt?.logs as any[]).find(log => log.eventName === 'NewSecurityToken');
            expect(newSecurityTokenEvent).to.not.be.undefined;
            assert.equal(newSecurityTokenEvent.args._ticker, "TMP", "SecurityToken doesn't get deployed");

            let securityTokenTmp = await ethers.getContractAt("SecurityToken", newSecurityTokenEvent.args._securityTokenAddress);

            let tokens = await I_Getter.getTokensByOwner(token_owner.address);
            assert.equal(tokens.length, 1, "tokens array length error");
            assert.equal(tokens[0], await I_SecurityToken.getAddress(), "ST address incorrect");

            let allTokens = await I_Getter.getTokens();
            assert.equal(allTokens.length, 2);
            assert.equal(allTokens[0], await securityTokenTmp.getAddress());
            assert.equal(allTokens[1], await I_SecurityToken.getAddress());

            await revertToSnapshot(snap_Id);
        });
        });

        describe("Generate SecurityToken v2", async () => {
        it("Should deploy the new ST factory version 2", async () => {

            const TokenLibFactory = await ethers.getContractFactory("TokenLib");
            const I_TokenLib = await TokenLibFactory.deploy();
            await I_TokenLib.waitForDeployment();
            console.log(I_TokenLib.target, "tokenLib");

            // Get factories
            const STGetterFactory = await ethers.getContractFactory("STGetter", {
                libraries: {
                    TokenLib: await I_TokenLib.getAddress()
                }
            });
            const DataStoreLogicFactory = await ethers.getContractFactory("DataStore");
            const DataStoreFactoryFactory = await ethers.getContractFactory("DataStoreFactory");

            // Deploy libraries and dependencies
            I_STGetter = await STGetterFactory.connect(account_polymath).deploy();
            await I_STGetter.waitForDeployment();

            // const initializeData = I_STGetter.interface.encodeFunctionData("initialize", [await I_STGetter.getAddress()]);

            const abiCoder = new ethers.Interface([
                    "function initialize(address _getterDelegate)"
                ]);
            
            const initializeData = abiCoder.encodeFunctionData("initialize", [I_STGetter.target]);

            const I_DataStoreLogic = await DataStoreLogicFactory.connect(account_polymath).deploy();
            await I_DataStoreLogic.waitForDeployment();

            const I_DataStoreFactory = await DataStoreFactoryFactory.connect(account_polymath).deploy(I_DataStoreLogic.target);
            await I_DataStoreFactory.waitForDeployment();

            // Get factories for contracts with libraries
            const SecurityTokenMockFactory = await ethers.getContractFactory("SecurityTokenMock", {
            libraries: {
                TokenLib: await I_TokenLib.getAddress()
            }
            });
            const STFactoryV2Factory = await ethers.getContractFactory("STFactory");

            // Deploy logic and factory
            const SecurityTokenV2Logic = await SecurityTokenMockFactory.connect(account_polymath).deploy();
            await SecurityTokenV2Logic.waitForDeployment();

            I_STFactory002 = await STFactoryV2Factory.connect(account_polymath).deploy(
                I_PolymathRegistry.target,
                I_GeneralTransferManagerFactory.target,
                I_DataStoreFactory.target,
                "3",
                SecurityTokenV2Logic.target,
                initializeData
            );
            await I_STFactory002.waitForDeployment();

            console.log("STF deployed");
            assert.notEqual(
            await I_STFactory002.getAddress(),
            address_zero,
            "STFactory002 contract was not deployed"
            );
            let _protocol = await I_Getter.getLatestProtocolVersion();
            assert.equal(_protocol[0], 3);
            assert.equal(_protocol[1], 0);
            assert.equal(_protocol[2], 0);
        });

        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFeePOLY);
            let tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbol2);
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);

            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(token_owner.address);
                        expect(parsed.args._ticker).to.equal(symbol2.toUpperCase());
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
        });

        it("Should change the protocol version", async() => {
            await I_STRProxied.connect(account_polymath).setProtocolFactory(await I_STFactory002.getAddress(), 2n, 2n, 0n);
            let _protocol = await I_Getter.getLatestProtocolVersion();
            assert.equal(_protocol[0], 3);
            assert.equal(_protocol[1], 0);
            assert.equal(_protocol[2], 0);
            await I_STRProxied.connect(account_polymath).setLatestVersion(2n, 2n, 0n);
            _protocol = await I_Getter.getLatestProtocolVersion();
            assert.equal(_protocol[0], 2);
            assert.equal(_protocol[1], 2);
            assert.equal(_protocol[2], 0);
            await catchRevert(
            I_STRProxied.connect(account_polymath).setProtocolFactory(await I_STFactory.getAddress(), 3n, 0n, 0n)
            );
            await I_STRProxied.connect(account_polymath).setProtocolFactory(await I_STFactory.getAddress(), 3n, 0n, 1n);
            await I_STRProxied.connect(account_polymath).setLatestVersion(3n, 0n, 0n);
            _protocol = await I_Getter.getLatestProtocolVersion();
            assert.equal(_protocol[0], 3);
            assert.equal(_protocol[1], 0);
            assert.equal(_protocol[2], 0);
        });

        it("Should fail to generate the securityToken because of invalid version", async() => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), initRegFeePOLY);
            await catchRevert(
            I_STRProxied.connect(token_owner).generateNewSecurityToken(name2, symbol2, tokenDetails, false, token_owner.address, _pack(1,2,0))
            );
        })

        it("Should generate the new security token with version 2", async () => {
            let snapId = await takeSnapshot();
            // Version bounds not checked here as MR is called as non-token
            let tx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(name2, symbol2, tokenDetails, false, token_owner.address, _pack(2,2,0));
            console.log(`Protocol version: ${_pack(2,2,0)}`);
            
            const receipt = await tx.wait();
            // Verify the successful generation of the security token
            const newSecurityTokenEvent = (receipt?.logs as any[]).find(log => log.eventName === 'NewSecurityToken');
            expect(newSecurityTokenEvent).to.not.be.undefined;
            assert.equal(newSecurityTokenEvent.args._ticker, symbol2, "SecurityToken doesn't get deployed");

            I_SecurityToken002 = await ethers.getContractAt("SecurityTokenMock", newSecurityTokenEvent.args._securityTokenAddress);
            let stGetterV2 = await ethers.getContractAt("STGetter", await I_SecurityToken002.getAddress());
            let stVersion = await stGetterV2.getVersion();
            console.log(stVersion);
            assert.equal(stVersion[0], 2);
            assert.equal(stVersion[1], 2);
            assert.equal(stVersion[2], 0);

            let securityTokenEvent: any = null;
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
            expect(securityTokenEvent!.args._types[0]).to.equal(transferManagerKey, "Transfer manager key is not correct");
            const nameBytes32 = ethers.decodeBytes32String(securityTokenEvent!.args._name).replace(/\u0000/g, '');
            expect(nameBytes32).to.equal("GeneralTransferManager", "SecurityToken doesn't have the transfer manager module");
            await revertToSnapshot(snapId);
        });
        });

        describe("Deploy the new SecurityTokenRegistry", async () => {
        it("Should deploy the new SecurityTokenRegistry contract logic", async () => {
            const SecurityTokenRegistryMockFactory = await ethers.getContractFactory("SecurityTokenRegistryMock");
            I_SecurityTokenRegistryV2 = await SecurityTokenRegistryMockFactory.connect(account_polymath).deploy();
            await I_SecurityTokenRegistryV2.waitForDeployment();
            assert.notEqual(await I_SecurityTokenRegistryV2.getAddress(), address_zero, "SecurityTokenRegistry contract was not deployed");
        });

        it("Should fail to upgrade the logic contract of the STRProxy -- bad owner", async () => {
            await I_STRProxied.connect(account_polymath).pause();

            const STRProxyConfigParameters = ["uint256"];
            let bytesProxy = encodeModuleCall(STRProxyConfigParameters, [
            99
            ]);

            await catchRevert(
            I_SecurityTokenRegistryProxy.connect(account_temp).upgradeToAndCall("1.1.0", await I_SecurityTokenRegistryV2.getAddress(), bytesProxy),
            "tx revert -> bad owner"
            );
        });

        it("Should upgrade the logic contract into the STRProxy", async () => {
            const STRProxyConfigParameters = ["uint256"];
            let bytesProxy = encodeModuleCall(STRProxyConfigParameters, [
            99
            ]);

            await I_SecurityTokenRegistryProxy.connect(account_polymath).upgradeToAndCall("1.1.0", await I_SecurityTokenRegistryV2.getAddress(), bytesProxy);
            I_STRProxied = await ethers.getContractAt("SecurityTokenRegistry", await I_SecurityTokenRegistryProxy.getAddress());
            assert.isTrue(await I_STRProxied.getBoolValue(ethers.keccak256(ethers.toUtf8Bytes("paused"))), "Paused value should be false");
        });

        it("Should check the old data persist or not", async () => {
            let data = await I_Getter.getTickerDetails(symbol);
            assert.equal(data[0], token_owner.address, "Should be equal to the token owner address");
            assert.equal(data[3], name, "Should be equal to the name of the token that is provided earlier");
            assert.isTrue(data[4], "Token status should be deployed == true");
        });

        it("Should unpause the logic contract", async () => {
            await I_STRProxied.connect(account_polymath).unpause();
            assert.isFalse(await I_STRProxied.getBoolValue(ethers.keccak256(ethers.toUtf8Bytes("paused"))), "Paused value should be false");
        });
        });

        describe("Generate custom tokens", async () => {
        it("Should fail if msg.sender is not polymath", async () => {
            await catchRevert(
            I_STRProxied.connect(account_delegate).modifyExistingSecurityToken("LOG", account_temp.address, dummy_token.address, "I am custom ST", currentTime),
            "tx revert -> msg.sender is not polymath account"
            );
        });

        it("Should fail to genrate the custom security token -- ticker length is greater than 10 chars", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingSecurityToken("LOGLOGLOGLOG", account_temp.address, dummy_token.address, "I am custom ST", currentTime),
            "tx revert -> ticker length is greater than 10 chars"
            );
        });

        it("Should fail to generate the custom security token -- name should not be 0 length ", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingSecurityToken("LOG", account_temp.address, dummy_token.address, "I am custom ST", currentTime),
            "tx revert -> name should not be 0 length"
            );
        });

        it("Should fail if ST address is 0 address", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingSecurityToken("LOG", account_temp.address, address_zero, "I am custom ST", currentTime),
            "tx revert -> Security token address is 0"
            );
        });

        it("Should fail if symbol length is 0", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingSecurityToken("", account_temp.address, dummy_token.address, "I am custom ST", currentTime),
            "tx revert -> zero length of the symbol is not allowed"
            );
        });

        it("Should fail to generate the custom ST -- deployedAt param is 0", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingSecurityToken(symbol2, token_owner.address, dummy_token.address, "I am custom ST", 0n),
            "tx revert -> because deployedAt param is 0"
            );
        });

        it("Should successfully generate custom token", async () => {
            // Register the new ticker -- Fulfiling the TickerStatus.ON condition
            await I_PolyToken.connect(account_polymath).getTokens(ethers.parseEther("1000"), account_temp.address);
            await I_PolyToken.connect(account_temp).approve(await I_STRProxied.getAddress(), initRegFeePOLY);
            let tickersListArray = await I_Getter.getTickersByOwner(account_temp.address);
            console.log(tickersListArray);
            await I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, "LOG");
            tickersListArray = await I_Getter.getTickersByOwner(account_temp.address);
            console.log(tickersListArray);
            // Generating the ST
            let tx = await I_STRProxied.connect(account_polymath).modifyExistingSecurityToken("LOG", account_temp.address, await I_SecurityToken.getAddress(), "I am custom ST", currentTime);
            
            const receipt = await tx.wait();
            tickersListArray = await I_Getter.getTickersByOwner(account_temp.address);
            console.log(tickersListArray);

            const newSecurityTokenEvent = (receipt?.logs as any[]).find(log => log.eventName === 'NewSecurityToken');
            expect(newSecurityTokenEvent).to.not.be.undefined;
            assert.equal(newSecurityTokenEvent.args._ticker, "LOG", "Symbol should match with the registered symbol");
            assert.equal(
            newSecurityTokenEvent.args._securityTokenAddress,
            await I_SecurityToken.getAddress(),
            `Address of the SecurityToken should be matched with the input value of addCustomSecurityToken`
            );
        });

        it("Should successfully generate the custom token", async () => {
            // Fulfilling the TickerStatus.NN condition
            let tx = await I_STRProxied.connect(account_polymath).modifyExistingSecurityToken("LOG2", account_temp.address, await I_SecurityToken.getAddress(), "I am custom ST", currentTime);
            const receipt = await tx.wait();

            const newSecurityTokenEvent = (receipt?.logs as any[]).find(log => log.eventName === 'NewSecurityToken');
            expect(newSecurityTokenEvent).to.not.be.undefined;

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);

            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let tickerRegisteredEvent = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("LOG2");
                        tickerRegisteredEvent = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(tickerRegisteredEvent).to.be.true;

            assert.equal(newSecurityTokenEvent.args._ticker, "LOG2", "Symbol should match with the registered symbol");
            assert.equal(
            newSecurityTokenEvent.args._securityTokenAddress,
            await I_SecurityToken.getAddress(),
            `Address of the SecurityToken should be matched with the input value of addCustomSecurityToken`
            );
        });

        it("Should successfully modify the ticker", async () => {
            let snap_Id = await takeSnapshot();
            await I_STRProxied.connect(account_polymath).modifyExistingTicker(
            account_temp.address,
            "LOG2",
            currentTime,
            currentTime + duration.days(60),
            false
            );
            await revertToSnapshot(snap_Id);
        });
        });

        describe("Test case for modifyTicker", async () => {
        it("Should add the custom ticker --failed because of bad owner", async () => {
            currentTime = await latestTime();
            await catchRevert(
            I_STRProxied.connect(account_temp).modifyExistingTicker(token_owner.address, "ETH", currentTime, currentTime + duration.days(10), false),
            "tx revert -> failed beacause of bad owner0"
            );
        });

        it("Should add the custom ticker --fail ticker length should not be 0", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingTicker(token_owner.address, "", currentTime, currentTime + duration.days(10), false),
            "tx revert -> failed beacause ticker length should not be 0"
            );
        });

        it("Should add the custom ticker --failed because time should not be 0", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingTicker(token_owner.address, "ETH", 0, currentTime + duration.days(10), false),
            "tx revert -> failed because time should not be 0"
            );
        });

        it("Should add the custom ticker --failed because registeration date is greater than the expiryDate", async () => {
            let ctime = currentTime;
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingTicker(token_owner.address, "ETH", ctime, ctime - duration.minutes(10), false),
            "tx revert -> failed because registeration date is greater than the expiryDate"
            );
        });

        it("Should add the custom ticker --failed because owner should not be 0x", async () => {
            let ctime = currentTime;
            await catchRevert(
            I_STRProxied.connect(account_polymath).modifyExistingTicker(
                address_zero,
                "ETH",
                ctime,
                ctime + duration.minutes(10),
                false
            ),
            "tx revert -> failed because owner should not be 0x"
            );
        });

        it("Should add the new custom ticker", async () => {
            let ctime = currentTime;
            let tx = await I_STRProxied.connect(account_polymath).modifyExistingTicker(
                account_temp.address,
                "ETH",
                ctime,
                ctime + duration.minutes(10),
                false
            );
            
            const receipt = await tx.wait();
            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);

            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );

            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    console.log(parsed, "parsed log");
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("ETH");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
        });

        it("Should change the details of the existing ticker", async () => {
            let ctime = currentTime;
            let tx = await I_STRProxied.connect(account_polymath).modifyExistingTicker(
            token_owner.address,
            "ETH",
            ctime,
            ctime + duration.minutes(10),
            false
            );
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);

            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );

            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    console.log(parsed, "parsed log");
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(token_owner.address);
                        expect(parsed.args._ticker).to.equal("ETH");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
        });
        });

        describe("Test cases for the transferTickerOwnership()", async () => {
        it("Should be able to transfer the ticker ownership -- failed because token is not deployed having the same ticker", async () => {
            await catchRevert(
            I_STRProxied.connect(account_temp).transferTickerOwnership(account_issuer.address, "ETH"),
            "tx revert -> failed because token is not deployed having the same ticker"
            );
        });

        it("Should be able to transfer the ticker ownership -- failed because new owner is 0x", async () => {
            await catchRevert(
            I_STRProxied.connect(token_owner).transferTickerOwnership(address_zero, symbol2),
            "tx revert -> failed because new owner is 0x"
            );
        });

        it("Should be able to transfer the ticker ownership -- failed because ticker is of zero length", async () => {
            await catchRevert(
            I_STRProxied.connect(token_owner).transferTickerOwnership(account_temp.address, ""),
            "tx revert -> failed because ticker is of zero length"
            );
        });

        it("Should be able to transfer the ticker ownership", async () => {
            let tx = await I_STRProxied.connect(token_owner).transferTickerOwnership(account_temp.address, symbol2);
            const receipt = await tx.wait();
            const event = (receipt?.logs as any[]).find(log => log.eventName === 'ChangeTickerOwnership');
            expect(event).to.not.be.undefined;
            assert.equal(event.args._newOwner, account_temp.address);
            let symbolDetails = await I_Getter.getTickerDetails(symbol2);
            assert.equal(symbolDetails[0], account_temp.address, `Owner of the symbol should be ${account_temp.address}`);
        });
        });

        describe("Test case for the changeSecurityLaunchFee()", async () => {
        it("Should be able to change the STLaunchFee-- failed because of bad owner", async () => {
            await catchRevert(
            I_STRProxied.connect(account_temp).changeSecurityLaunchFee(ethers.parseEther("500")),
            "tx revert -> failed because of bad owner"
            );
        });

        it("Should be able to change the STLaunchFee-- failed because of putting the same fee", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).changeSecurityLaunchFee(initRegFee),
            "tx revert -> failed because of putting the same fee"
            );
        });

        it("Should be able to change the STLaunchFee", async () => {
            const newFee = ethers.parseEther("500");
            let tx = await I_STRProxied.connect(account_polymath).changeSecurityLaunchFee(newFee);
            const receipt = await tx.wait();
            const event = (receipt?.logs as any[]).find(log => log.eventName === 'ChangeSecurityLaunchFee');
            expect(event).to.not.be.undefined;
            assert.equal(event.args._newFee.toString(), newFee.toString());
            let stLaunchFee = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("stLaunchFee")));
            assert.equal(stLaunchFee.toString(), newFee.toString());
        });
        });

        describe("Test cases for the changeExpiryLimit()", async () => {
        it("Should be able to change the ExpiryLimit-- failed because of bad owner", async () => {
            await catchRevert(
            I_STRProxied.connect(account_temp).changeExpiryLimit(duration.days(15)),
            "tx revert -> failed because of bad owner"
            );
        });

        it("Should be able to change the ExpiryLimit-- failed because expirylimit is less than 1 day", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).changeExpiryLimit(duration.minutes(50)),
            "tx revert -> failed because expirylimit is less than 1 day"
            );
        });

        it("Should be able to change the ExpiryLimit", async () => {
            let tx = await I_STRProxied.connect(account_polymath).changeExpiryLimit(duration.days(20));
            const receipt = await tx.wait();
            const event = (receipt?.logs as any[]).find(log => log.eventName === 'ChangeExpiryLimit');
            expect(event).to.not.be.undefined;
            assert.equal(event.args._newExpiry, duration.days(20));
            let expiry = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("expiryLimit")));
            assert.equal(expiry, duration.days(20));
        });
        });

        describe("Test cases for the changeTickerRegistrationFee()", async () => {
        it("Should be able to change the fee currency-- failed because of bad owner", async () => {
            await catchRevert(
            I_STRProxied.connect(account_temp).changeFeesAmountAndCurrency(ethers.parseEther("500"), ethers.parseEther("100"), false),
            "tx revert -> failed because of bad owner"
            );
        });

        it("Should be able to change the fee currency-- failed because of putting the same currency", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).changeFeesAmountAndCurrency(ethers.parseEther("500"), ethers.parseEther("100"), false),
            "tx revert -> failed because of putting the same fee"
            );
        });

        it("Should be able to change the fee currency", async () => {
            let snapId = await takeSnapshot();
            const tickerFee = ethers.parseEther("500");
            const stFee = ethers.parseEther("100");
            let tx = await I_STRProxied.connect(account_polymath).changeFeesAmountAndCurrency(tickerFee, stFee, true);
            const receipt = await tx.wait();
            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            console.log(fullReceipt, "full receipt");

            const changeTickerFeeEvent = (receipt?.logs as any[]).find(log => log.eventName === 'ChangeTickerRegistrationFee');
            const changeSTFeeEvent = (receipt?.logs as any[]).find(log => log.eventName === 'ChangeSecurityLaunchFee');
            const changeFeeTypeEvent = (receipt?.logs as any[]).find(log => log.eventName === 'ChangeFeeCurrency');
            
            expect(changeTickerFeeEvent).to.not.be.undefined;
            expect(changeSTFeeEvent).to.not.be.undefined;
            expect(changeFeeTypeEvent).to.not.be.undefined;

            assert.equal(changeTickerFeeEvent.args._newFee.toString(), tickerFee.toString(), "wrong ticker fee in event");
            assert.equal(changeSTFeeEvent.args._newFee.toString(), stFee.toString(), "wrong st fee in event");
            assert.equal(changeFeeTypeEvent.args._isFeeInPoly, true, "wrong fee type");
            assert.equal(await I_Getter.getIsFeeInPoly(), true, "is fee in poly not set");
            
            // let tickerRegFeeValue = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("tickerRegFee")));
            let tickerRegFeeValue = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("tickerRegFee")));
            assert.equal(tickerRegFeeValue.toString(), tickerFee.toString(), "wrong fee");
            
            let tickerRegFeePoly = (await I_STRProxied.getFees.staticCall("0x2fcc69711628630fb5a42566c68bd1092bc4aa26826736293969fddcd11cb2d2"));
            console.log(tickerRegFeePoly, "tickerRegFeePoly");
            assert.equal(tickerRegFeePoly[1], tickerRegFeeValue.toString());

            let stFeeValue = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("stLaunchFee")));
            assert.equal(stFeeValue.toString(), stFee.toString(), "wrong fee");
            
            let stFeePoly = (await I_STRProxied.getFees.staticCall("0xd677304bb45536bb7fdfa6b9e47a3c58fe413f9e8f01474b0a4b9c6e0275baf2"));
            assert.equal(stFeePoly[1].toString(), stFeeValue.toString());
            
            await revertToSnapshot(snapId);
        });
        });

        describe("Test cases for the changeTickerRegistrationFee()", async () => {
        it("Should be able to change the TickerRegFee-- failed because of bad owner", async () => {
            await catchRevert(
            I_STRProxied.connect(account_temp).changeTickerRegistrationFee(ethers.parseEther("500")),
            "tx revert -> failed because of bad owner"
            );
        });

        it("Should be able to change the TickerRegFee-- failed because of putting the same fee", async () => {
            await catchRevert(
                I_STRProxied.connect(account_polymath).changeTickerRegistrationFee(initRegFee),
                "tx revert -> failed because of putting the same fee"
            );
        });

        it("Should be able to change the TickerRegFee", async () => {
            const newFee = ethers.parseEther("400");
            let tx = await I_STRProxied.connect(account_polymath).changeTickerRegistrationFee(newFee);
            const receipt = await tx.wait();
            const event = (receipt?.logs as any[]).find(log => log.eventName === 'ChangeTickerRegistrationFee');
            expect(event).to.not.be.undefined;
            assert.equal(event.args._newFee.toString(), newFee.toString());
            let tickerRegFee = await I_STRProxied.getUintValue(ethers.keccak256(ethers.toUtf8Bytes("tickerRegFee")));
            assert.equal(tickerRegFee.toString(), newFee.toString());
            console.log(`Ticker registration fee changed to on script: ${newFee.toString()}`);
        });

        // FEE IN POLY TERMS, NOT IN ETH
        it("Should fail to register the ticker with the old fee", async () => {
            await I_PolyToken.connect(token_owner).approve(I_STRProxied.target, ethers.parseEther("0.2")); // because Fee is in POLY AND NOT ETH
            const allowance = await I_PolyToken.allowance(token_owner.address, await I_STRProxied.getAddress());
            console.log(allowance, "allowance");
            await expect(
                I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, "POLY"),
                "tx revert -> failed because of ticker registeration fee gets change"
            ).to.be.reverted;
        });

        it("Should register the ticker with the new fee", async () => {
            await I_PolyToken.connect(account_polymath).getTokens(ethers.parseEther("1600"), token_owner.address);
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), ethers.parseEther("2000"));
            let tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, "POLY");
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
                        expect(parsed.args._ticker).to.equal("POLY");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
        });

        it("Should fail to launch the securityToken with the old launch fee", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), ethers.parseEther("0.2")); // because Fee is in POLY AND NOT ETH
            await catchRevert(
                I_STRProxied.connect(token_owner).generateNewSecurityToken("Polymath", "POLY", tokenDetails, false, token_owner.address, 0),
                "tx revert -> failed because of old launch fee"
            );
        });

        it("Should launch the the securityToken", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), ethers.parseEther("2000"));
            let tx = await I_STRProxied.connect(token_owner).generateNewSecurityToken("Polymath", "POLY", tokenDetails, false, token_owner.address, 0);

            // Verify the successful generation of the security token
            const receipt = await tx.wait();
            const event = (receipt?.logs as any[]).find(log => log.eventName === 'NewSecurityToken');
            expect(event).to.not.be.undefined;
            assert.equal(event.args._ticker, "POLY", "SecurityToken doesn't get deployed");
        });
        });

        describe("Test case for the update poly token", async () => {
        it("Should change the polytoken address -- failed because of bad owner", async () => {
            await catchRevert(
            I_STRProxied.connect(account_temp).updatePolyTokenAddress(dummy_token.address),
            "tx revert -> failed because of bad owner"
            );
        });

        it("Should change the polytoken address -- failed because of 0x address", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).updatePolyTokenAddress(address_zero),
            "tx revert -> failed because 0x address"
            );
        });

        it("Should successfully change the polytoken address", async () => {
            let _id = await takeSnapshot();
            await I_STRProxied.connect(account_polymath).updatePolyTokenAddress(dummy_token.address);
            assert.equal(await I_STRProxied.getAddressValue(ethers.keccak256(ethers.toUtf8Bytes("polyToken"))), dummy_token.address);
            await revertToSnapshot(_id);
        });
        });

        describe("Test case for refreshing a security token", async () => {
        it("Should fail if msg.sender is not ST owner", async () => {
            await catchRevert(
            I_STRProxied.connect(account_delegate).refreshSecurityToken("refreshedToken", symbol, "refreshedToken", true, token_owner.address)
            );
        });

        it("Should fail if ticker is not deployed", async () => {
            await catchRevert(
            I_STRProxied.connect(token_owner).refreshSecurityToken("refreshedToken", "LOGLOG3", "refreshedToken", true, token_owner.address)
            );
        });

        it("Should fail if name is 0 length", async () => {
            await catchRevert(
            I_STRProxied.connect(token_owner).refreshSecurityToken("", symbol, "refreshedToken", true, token_owner.address)
            );
        });

        it("Should fail if null treasurey wallet", async () => {
            await catchRevert(
            I_STRProxied.connect(token_owner).refreshSecurityToken("refreshedToken", symbol, "refreshedToken", true, address_zero)
            );
        });

        it("Should fail if transfers not frozen", async () => {
            await catchRevert(
            I_STRProxied.connect(token_owner).refreshSecurityToken("refreshedToken", symbol, "refreshedToken", true, token_owner.address)
            );
        });

        it("Should refresh security token", async () => {
            let snapid = await takeSnapshot();
            let oldStAddress = await I_Getter.getSecurityTokenAddress(symbol);
            let oldSt = await ethers.getContractAt("SecurityToken", oldStAddress);
            await oldSt.connect(token_owner).freezeTransfers();
            let tx = await I_STRProxied.connect(token_owner).refreshSecurityToken("refreshedToken", symbol, "refreshedToken", true, token_owner.address);
            
            const receipt = await tx.wait();
            const newSecurityTokenEvent = (receipt?.logs as any[]).find(log => log.eventName === 'SecurityTokenRefreshed');
            expect(newSecurityTokenEvent).to.not.be.undefined;

            assert.equal(newSecurityTokenEvent.args._ticker, symbol, "SecurityToken not deployed");
            let newStAddress = await I_Getter.getSecurityTokenAddress(symbol);
            let securityTokenTmp = newSecurityTokenEvent.args._securityTokenAddress;
            assert.equal(newStAddress, securityTokenTmp, "ST address not updated");
            let newST = await ethers.getContractAt("SecurityToken", newStAddress);
            assert.notEqual(oldStAddress, newStAddress, "new ST not generated");
            assert.equal(await newST.name(), "refreshedToken", "ST not deployed properly");
            await revertToSnapshot(snapid);
        });
        });

        describe("Test cases for getters", async () => {
        it("Should get the security token address", async () => {
            let address = await I_Getter.getSecurityTokenAddress(symbol);
            assert.equal(address, await I_SecurityToken.getAddress());
        });

        it("Should get the security token data", async () => {
            let data = await I_Getter.getSecurityTokenData(await I_SecurityToken.getAddress());
            assert.equal(data[0], "LOG2");
            assert.equal(data[1], token_owner.address);
        });

        it("Should get the tickers by owner", async () => {
            let tickersList = await I_Getter.getTickersByOwner(token_owner.address);
            console.log(tickersList);
            assert.equal(tickersList.length, 4);
            let tickersListArray = await I_Getter.getTickersByOwner(account_temp.address);
            console.log(tickersListArray);
            assert.equal(tickersListArray.length, 3);
        });
        });

        describe("Test case for the Removing the ticker", async () => {
        it("Should remove the ticker from the polymath ecosystem -- bad owner", async () => {
            await catchRevert(
            I_STRProxied.connect(account_investor1).removeTicker(symbol2),
            "tx revert -> failed because msg.sender should be account_polymath"
            );
        });

        it("Should remove the ticker from the polymath ecosystem -- fail because ticker doesn't exist in the ecosystem", async () => {
            await catchRevert(
            I_STRProxied.connect(account_polymath).removeTicker("HOLA"),
            "tx revert -> failed because ticker doesn't exist in the polymath ecosystem"
            );
        });

        it("Should successfully remove the ticker from the polymath ecosystem", async () => {
            let tx = await I_STRProxied.connect(account_polymath).removeTicker(symbol2);
            const receipt = await tx.wait();
            const event = (receipt?.logs as any[]).find(log => log.eventName === 'TickerRemoved');
            expect(event).to.not.be.undefined;
            assert.equal(event.args._ticker, symbol2, "Ticker doesn't get deleted successfully");
        });
        });

        describe(" Test cases of the registerTicker", async () => {
        it("Should register the ticker 1", async () => {
            await I_PolyToken.connect(account_polymath).getTokens(ethers.parseEther("1600"), account_temp.address);
            await I_PolyToken.connect(account_temp).approve(await I_STRProxied.getAddress(), ethers.parseEther("1600"));
            let tx = await I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, "TOK1");
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("TOK1");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            console.log((await I_Getter.getTickersByOwner(account_temp.address)).map(x => ethers.toUtf8String(x).replace(/\u0000/g, "")));
        });

        it("Should register the ticker 2", async () => {
            await I_PolyToken.connect(account_polymath).getTokens(ethers.parseEther("1600"), account_temp.address);
            await I_PolyToken.connect(account_temp).approve(await I_STRProxied.getAddress(), ethers.parseEther("1600"));
            let tx = await I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, "TOK2");
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("TOK2");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            console.log((await I_Getter.getTickersByOwner(account_temp.address)).map(x => ethers.toUtf8String(x).replace(/\u0000/g, "")));
        });

        it("Should register the ticker 3", async () => {
            await I_PolyToken.connect(account_polymath).getTokens(ethers.parseEther("1600"), account_temp.address);
            await I_PolyToken.connect(account_temp).approve(await I_STRProxied.getAddress(), ethers.parseEther("1600"));
            let tx = await I_STRProxied.connect(account_temp).registerNewTicker(account_temp.address, "TOK3");
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("TOK3");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            console.log((await I_Getter.getTickersByOwner(account_temp.address)).map(x => ethers.toUtf8String(x).replace(/\u0000/g, "")));
        });

        it("Should successfully remove the ticker 2", async () => {
            let tx = await I_STRProxied.connect(account_polymath).removeTicker("TOK2");
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);

                    if (parsed && parsed.name === "TickerRemoved") {
                        expect(parsed.args._ticker).to.equal("TOK2");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            console.log((await I_Getter.getTickersByOwner(account_temp.address)).map(x => ethers.toUtf8String(x).replace(/\u0000/g, "")));
        });

        it("Should modify ticker 1", async () => {
            currentTime = await latestTime();
            let tx = await I_STRProxied.connect(account_polymath).modifyExistingTicker(
                account_temp.address,
                "TOK1",
                currentTime,
                currentTime + duration.minutes(10),
                false
            );
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("TOK1");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            console.log((await I_Getter.getTickersByOwner(account_temp.address)).map(x => ethers.toUtf8String(x).replace(/\u0000/g, "")));
        });

        it("Should modify ticker 3", async () => {
            let tx = await I_STRProxied.connect(account_polymath).modifyExistingTicker(
                account_temp.address,
                "TOK3",
                currentTime,
                currentTime + duration.minutes(10),
                false
            );
            const receipt = await tx.wait();

            const fullReceipt = await ethers.provider.getTransactionReceipt(receipt!.hash);
            const strProxiedAddress = String(I_STRProxied.target);

            const logs = fullReceipt!.logs.filter(log => 
                log.address.toLowerCase() === strProxiedAddress.toLowerCase()
            );
        
            let eventFound = false;
            for (const log of logs) {
                try {
                    const parsed = I_STRProxied.interface.parseLog(log);
                    
                    if (parsed && parsed.name === "RegisterTicker") { 
                        expect(parsed.args._owner).to.equal(account_temp.address);
                        expect(parsed.args._ticker).to.equal("TOK3");
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            expect(eventFound).to.be.true;
            console.log((await I_Getter.getTickersByOwner(account_temp.address)).map(x => ethers.toUtf8String(x).replace(/\u0000/g, "")));
        });
        });

        describe("Test cases for IRegistry functionality", async () => {
        describe("Test cases for reclaiming funds", async () => {
            it("Should successfully reclaim POLY tokens -- fail because token address will be 0x", async () => {
            await I_PolyToken.connect(token_owner).transfer(await I_STRProxied.getAddress(), ethers.parseEther("1"));
            await catchRevert(I_STRProxied.connect(account_polymath).reclaimERC20(address_zero));
            });

            it("Should successfully reclaim POLY tokens -- not authorised", async () => {
            await catchRevert(I_STRProxied.connect(account_temp).reclaimERC20(await I_PolyToken.getAddress()));
            });

            it("Should successfully reclaim POLY tokens", async () => {
            let bal1 = await I_PolyToken.balanceOf(account_polymath.address);
            await I_STRProxied.connect(account_polymath).reclaimERC20(await I_PolyToken.getAddress());
            let bal2 = await I_PolyToken.balanceOf(account_polymath.address);
            expect(bal2).to.be.gt(bal1);
            });
        });

        describe("Test cases for pausing the contract", async () => {
            it("Should fail to pause if msg.sender is not owner", async () => {
            await catchRevert(I_STRProxied.connect(account_temp).pause(), "tx revert -> msg.sender should be account_polymath");
            });

            it("Should successfully pause the contract", async () => {
            await I_STRProxied.connect(account_polymath).pause();
            let status = await I_STRProxied.getBoolValue(ethers.keccak256(ethers.toUtf8Bytes("paused")));
            assert.isTrue(status);
            });

            it("Should fail to unpause if msg.sender is not owner", async () => {
            await catchRevert(I_STRProxied.connect(account_temp).unpause(), "tx revert -> msg.sender should be account_polymath");
            });

            it("Should successfully unpause the contract", async () => {
            await I_STRProxied.connect(account_polymath).unpause();
            let status = await I_STRProxied.getBoolValue(ethers.keccak256(ethers.toUtf8Bytes("paused")));
            assert.isFalse(status);
            });
        });

        describe("Test cases for the setProtocolVersion", async () => {
            it("Should successfully change the protocolVersion -- failed because of bad owner", async () => {
            await catchRevert(I_STRProxied.connect(account_temp).setProtocolFactory(accounts[8].address, 5, 6, 7));
            });

            it("Should successfully change the protocolVersion -- failed because factory address is 0x", async () => {
            await catchRevert(
                I_STRProxied.connect(account_polymath).setProtocolFactory(address_zero, 5, 6, 7)
            );
            });

            it("Should successfully change the protocolVersion -- not a valid version", async () => {
            await catchRevert(I_STRProxied.connect(account_polymath).setLatestVersion(0, 0, 0));
            });

            it("Should successfully change the protocolVersion -- fail in second attempt because of invalid version", async () => {
            let snap_Id = await takeSnapshot();
            await I_STRProxied.connect(account_polymath).setProtocolFactory(accounts[8].address, 3, 1, 1);
            await catchRevert(I_STRProxied.connect(account_polymath).setLatestVersion(1, 3, 1));
            await revertToSnapshot(snap_Id);
            });
        });

        describe("Test cases for the transferOwnership", async () => {
            it("Should fail to transfer the ownership -- not authorised", async () => {
            await catchRevert(I_STRProxied.connect(account_issuer).transferOwnership(account_temp.address));
            });

            it("Should fail to transfer the ownership -- 0x address is not allowed", async () => {
            await catchRevert(I_STRProxied.connect(account_polymath).transferOwnership(address_zero));
            });

            it("Should successfully transfer the ownership of the STR", async () => {
            let tx = await I_STRProxied.connect(account_polymath).transferOwnership(account_temp.address);
            const receipt = await tx.wait();
            const event = (receipt?.logs as any[]).find(log => log.eventName === 'OwnershipTransferred');
            expect(event).to.not.be.undefined;
            assert.equal(event.args.previousOwner, account_polymath.address);
            assert.equal(event.args.newOwner, account_temp.address);
            });
        });
        });
});
