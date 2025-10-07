import { assert, expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, LogDescription } from "ethers";

import { takeSnapshot, revertToSnapshot } from "./helpers/time";
import { setUpPolymathNetwork } from "./helpers/createInstances";
import { TOKEN_CONFIG, FEE_CONSTANTS, COMMON_ADDRESSES } from "./helpers/testConstants";

/**
 * DataStore Test Suite
 * 
 * Tests the DataStore contract which provides key-value storage functionality
 * for security tokens. This is used to store arbitrary data associated with tokens.
 * 
 * Tests cover:
 * - Storage and retrieval of different data types (uint256, bytes32, address, string, bytes, bool)
 * - Array operations (set, get, insert, delete)
 * - Batch operations (multi-set, multi-insert)
 * - Access control (only authorized addresses can modify data)
 * - Security token attachment and management
 */
describe("DataStore", function() {
    // ============ Account Variables ============
    let account_polymath: HardhatEthersSigner;
    let token_owner: HardhatEthersSigner;
    let accounts: HardhatEthersSigner[];

    // ============ Contract Instances ============
    let I_GeneralTransferManagerFactory: any;
    let I_SecurityTokenRegistryProxy: any;
    let I_ModuleRegistry: any;
    let I_FeatureRegistry: any;
    let I_SecurityTokenRegistry: any;
    let I_STRProxied: any;
    let I_STFactory: any;
    let I_SecurityToken: any;
    let I_PolyToken: any;
    let I_PolymathRegistry: any;
    let I_DataStore: any;
    let I_ModuleRegistryProxy: any;
    let I_MRProxied: any;
    let I_STRGetter: any;
    let I_STGetter: any;
    let stGetter: any;

    // ============ Test Data ============
    const symbol = TOKEN_CONFIG.symbol;
    const key = '0x' + '41'.padStart(64, '0');
    const key2 = '0x' + '42'.padStart(64, '0');
    const bytes32data = "0x4200000000000000000000000000000000000000000000000000000000000000";
    const bytes32data2 = "0x4400000000000000000000000000000000000000000000000000000000000000";

    /**
     * Setup: Deploy Polymath ecosystem and create security token
     */
    before(async () => {
        // Get test accounts
        accounts = await ethers.getSigners();
        account_polymath = accounts[0];
        token_owner = accounts[1];

        // Deploy Polymath ecosystem
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

        console.log(`
        ===================== Polymath Network Deployed =====================
        PolymathRegistry:              ${await I_PolymathRegistry.getAddress()}
        SecurityTokenRegistry:         ${await I_SecurityTokenRegistry.getAddress()}
        ModuleRegistry:                ${await I_ModuleRegistry.getAddress()}
        STFactory:                     ${await I_STFactory.getAddress()}
        ====================================================================
        `);
    });

    describe("Generate the SecurityToken", async () => {
        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), FEE_CONSTANTS.INIT_REG_FEE);
            let tx = await I_STRProxied.connect(token_owner).registerNewTicker(token_owner.address, symbol);
            
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
                        assert.equal(parsed.args._owner, token_owner.address);
                        assert.equal(parsed.args._ticker, symbol.toUpperCase());
                        eventFound = true;
                        break;
                    }
                } catch (err: any) {
                    console.log(`Failed to parse log: ${err.message}`);
                }
            }
        
            assert.equal(eventFound, true);
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            await I_PolyToken.connect(token_owner).approve(await I_STRProxied.getAddress(), FEE_CONSTANTS.INIT_REG_FEE);

            let tx = await I_STRProxied.connect(token_owner).generateNewSecurityToken(TOKEN_CONFIG.name, symbol, TOKEN_CONFIG.tokenDetails, false, token_owner.address, 0);

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

            // Verify the successful generation of the security token
            assert.equal(securityTokenEvent!.args._ticker, symbol.toUpperCase(), "SecurityToken doesn't get deployed");

            I_SecurityToken = await ethers.getContractAt("SecurityToken", securityTokenEvent!.args._securityTokenAddress);
            stGetter = await ethers.getContractAt("STGetter", await I_SecurityToken.getAddress());
            assert.equal(await stGetter.getTreasuryWallet(), token_owner.address, "Incorrect wallet set");
            
            // Find ModuleAdded event in the logs
            let moduleAddedEvent: LogDescription | null = null;
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
            assert.equal(Number(moduleAddedEvent!.args._types[0]), 2);
            const nameBytes32 = ethers.decodeBytes32String(moduleAddedEvent!.args._name).replace(/\u0000/g, '');
            assert.equal(nameBytes32, "GeneralTransferManager");
        });

        it("Should fetch data store address", async () => {
            const dataStoreAddress = await I_SecurityToken.dataStore();
            I_DataStore = await ethers.getContractAt("DataStore", dataStoreAddress);
        });
    });

    describe("Should attach to security token securely", async () => {
        it("Should be attached to a security token upon deployment", async () => {
            assert.equal(await I_DataStore.securityToken(), await I_SecurityToken.getAddress(), "Incorrect Security Token attached");
        });

        it("Should not allow non-issuer to change security token address", async () => {
            await expect(I_DataStore.connect(account_polymath).setSecurityToken(COMMON_ADDRESSES.ONE)).to.be.reverted;
        });

        it("Should allow issuer to change security token address", async () => {
            const snapId = await takeSnapshot();
            await I_DataStore.connect(token_owner).setSecurityToken(COMMON_ADDRESSES.ONE);
            assert.equal(await I_DataStore.securityToken(), COMMON_ADDRESSES.ONE, "Incorrect Security Token attached");
            await revertToSnapshot(snapId);
            assert.equal(await I_DataStore.securityToken(), await I_SecurityToken.getAddress(), "Incorrect Security Token attached");
        });
    });

    describe("Should set data correctly", async () => {
        it("Should set and fetch uint256 correctly", async () => {
            await expect(I_DataStore.connect(token_owner).setUint256(ethers.ZeroHash, 1)).to.be.reverted;
            await I_DataStore.connect(token_owner).setUint256(key, 1);
            assert.equal(Number(await I_DataStore.getUint256(key)), 1, "Incorrect Data Inserted");
        });

        it("Should set and fetch bytes32 correctly", async () => {
            await I_DataStore.connect(token_owner).setBytes32(key, bytes32data);
            assert.equal(await I_DataStore.getBytes32(key), bytes32data, "Incorrect Data Inserted");
        });

        it("Should set and fetch address correctly", async () => {
            await I_DataStore.connect(token_owner).setAddress(key, COMMON_ADDRESSES.ONE);
            assert.equal(await I_DataStore.addressGetter(key), COMMON_ADDRESSES.ONE, "Incorrect Data Inserted");
        });

        it("Should set and fetch string correctly", async () => {
            await I_DataStore.connect(token_owner).setString(key, TOKEN_CONFIG.name);
            assert.equal(await I_DataStore.getString(key), TOKEN_CONFIG.name, "Incorrect Data Inserted");
        });

        it("Should set and fetch bytes correctly", async () => {
            await I_DataStore.connect(token_owner).setBytes(key, bytes32data);
            assert.equal(await I_DataStore.getBytes(key), bytes32data, "Incorrect Data Inserted");
        });

        it("Should set and fetch bool correctly", async () => {
            await I_DataStore.connect(token_owner).setBool(key, true);
            assert.equal(await I_DataStore.getBool(key), true, "Incorrect Data Inserted");
        });

        it("Should set and fetch uint256 array correctly", async () => {
            const arr = [1, 2];
            await I_DataStore.connect(token_owner).setUint256Array(key, arr);
            const arr2 = await I_DataStore.getUint256Array(key);
            const arrLen = await I_DataStore.getUint256ArrayLength(key);
            const arrElement2 = await I_DataStore.getUint256ArrayElement(key, 1);
            assert.equal(Number(arr2[0]), arr[0], "Incorrect Data Inserted");
            assert.equal(Number(arr2[1]), arr[1], "Incorrect Data Inserted");
            assert.equal(Number(arrLen), arr.length, "Incorrect Array Length");
            assert.equal(Number(arrElement2), arr[1], "Incorrect array element");
        });

        it("Should set and fetch bytes32 array correctly", async () => {
            const arr = [bytes32data, bytes32data2];
            await I_DataStore.connect(token_owner).setBytes32Array(key, arr);
            const arr2 = await I_DataStore.getBytes32Array(key);
            const arrLen = await I_DataStore.getBytes32ArrayLength(key);
            const arrElement2 = await I_DataStore.getBytes32ArrayElement(key, 1);
            assert.equal(arr2[0], arr[0], "Incorrect Data Inserted");
            assert.equal(arr2[1], arr[1], "Incorrect Data Inserted");
            assert.equal(Number(arrLen), arr.length, "Incorrect Array Length");
            assert.equal(arrElement2, arr[1], "Incorrect array element");
        });

        it("Should set and fetch address array correctly", async () => {
            const arr = [COMMON_ADDRESSES.ZERO, COMMON_ADDRESSES.ONE];
            await I_DataStore.connect(token_owner).setAddressArray(key, arr);
            const arr2 = await I_DataStore.getAddressArray(key);
            const arrLen = await I_DataStore.getAddressArrayLength(key);
            const arrElement2 = await I_DataStore.getAddressArrayElement(key, 1);
            assert.equal(arr2[0], arr[0], "Incorrect Data Inserted");
            assert.equal(arr2[1], arr[1], "Incorrect Data Inserted");
            assert.equal(Number(arrLen), arr.length, "Incorrect Array Length");
            assert.equal(arrElement2, arr[1], "Incorrect array element");
        });

        it("Should set and fetch bool array correctly", async () => {
            const arr = [false, true];
            await I_DataStore.connect(token_owner).setBoolArray(key, arr);
            const arr2 = await I_DataStore.getBoolArray(key);
            const arrLen = await I_DataStore.getBoolArrayLength(key);
            const arrElement2 = await I_DataStore.getBoolArrayElement(key, 1);
            assert.equal(arr2[0], arr[0], "Incorrect Data Inserted");
            assert.equal(arr2[1], arr[1], "Incorrect Data Inserted");
            assert.equal(Number(arrLen), arr.length, "Incorrect Array Length");
            assert.equal(arrElement2, arr[1], "Incorrect array element");
        });

        it("Should insert uint256 into Array", async () => {
            const arrLen = await I_DataStore.getUint256ArrayLength(key);
            await I_DataStore.connect(token_owner).insertUint256(key, 10);
            const arrElement = await I_DataStore.getUint256ArrayElement(key, Number(arrLen));
            const arrElements = await I_DataStore.getUint256ArrayElements(key, 0, Number(arrLen));
            assert.equal(Number(arrElement), Number(arrElements[Number(arrLen)]));
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getUint256ArrayLength(key)), "Incorrect Array Length");
            assert.equal(Number(arrElement), 10, "Incorrect array element");
        });

        it("Should insert bytes32 into Array", async () => {
            const arrLen = await I_DataStore.getBytes32ArrayLength(key);
            await I_DataStore.connect(token_owner).insertBytes32(key, bytes32data);
            const arrElement = await I_DataStore.getBytes32ArrayElement(key, Number(arrLen));
            const arrElements = await I_DataStore.getBytes32ArrayElements(key, 0, Number(arrLen));
            assert.equal(arrElement, arrElements[Number(arrLen)]);
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getBytes32ArrayLength(key)), "Incorrect Array Length");
            assert.equal(arrElement, bytes32data, "Incorrect array element");
        });

        it("Should insert address into Array", async () => {
            const arrLen = await I_DataStore.getAddressArrayLength(key);
            await I_DataStore.connect(token_owner).insertAddress(key, COMMON_ADDRESSES.ONE);
            const arrElement = await I_DataStore.getAddressArrayElement(key, Number(arrLen));
            const arrElements = await I_DataStore.getAddressArrayElements(key, 0, Number(arrLen));
            assert.equal(arrElement, arrElements[Number(arrLen)]);
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getAddressArrayLength(key)), "Incorrect Array Length");
            assert.equal(arrElement, COMMON_ADDRESSES.ONE, "Incorrect array element");
        });

        it("Should insert bool into Array", async () => {
            const arrLen = await I_DataStore.getBoolArrayLength(key);
            await I_DataStore.connect(token_owner).insertBool(key, true);
            const arrElement = await I_DataStore.getBoolArrayElement(key, Number(arrLen));
            const arrElements = await I_DataStore.getBoolArrayElements(key, 0, Number(arrLen));
            assert.equal(arrElement, arrElements[Number(arrLen)]);
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getBoolArrayLength(key)), "Incorrect Array Length");
            assert.equal(arrElement, true, "Incorrect array element");
        });

        it("Should delete uint256 from Array", async () => {
            const arrLen = await I_DataStore.getUint256ArrayLength(key);
            const indexToDelete = Number(arrLen) - 2;
            const lastElement = await I_DataStore.getUint256ArrayElement(key, Number(arrLen) - 1);
            await I_DataStore.connect(token_owner).deleteUint256(key, indexToDelete);
            assert.equal(Number(arrLen) - 1, Number(await I_DataStore.getUint256ArrayLength(key)), "Incorrect Array Length");
            assert.equal(Number(lastElement), Number(await I_DataStore.getUint256ArrayElement(key, indexToDelete)), "Incorrect array element");
        });

        it("Should delete bytes32 from Array", async () => {
            const arrLen = await I_DataStore.getBytes32ArrayLength(key);
            const indexToDelete = Number(arrLen) - 2;
            const lastElement = await I_DataStore.getBytes32ArrayElement(key, Number(arrLen) - 1);
            await I_DataStore.connect(token_owner).deleteBytes32(key, indexToDelete);
            assert.equal(Number(arrLen) - 1, Number(await I_DataStore.getBytes32ArrayLength(key)), "Incorrect Array Length");
            assert.equal(lastElement, await I_DataStore.getBytes32ArrayElement(key, indexToDelete), "Incorrect array element");
        });

        it("Should delete address from Array", async () => {
            const arrLen = await I_DataStore.getAddressArrayLength(key);
            const indexToDelete = Number(arrLen) - 2;
            const lastElement = await I_DataStore.getAddressArrayElement(key, Number(arrLen) - 1);
            await I_DataStore.connect(token_owner).deleteAddress(key, indexToDelete);
            assert.equal(Number(arrLen) - 1, Number(await I_DataStore.getAddressArrayLength(key)), "Incorrect Array Length");
            assert.equal(lastElement, await I_DataStore.getAddressArrayElement(key, indexToDelete), "Incorrect array element");
        });

        it("Should delete bool from Array", async () => {
            let arrLen = await I_DataStore.getBoolArrayLength(key);
            let indexToDelete = Number(arrLen) - 2;
            let lastElement = await I_DataStore.getBoolArrayElement(key, Number(arrLen) - 1);
            await I_DataStore.connect(token_owner).deleteBool(key, indexToDelete);
            assert.equal(Number(arrLen) - 1, Number(await I_DataStore.getBoolArrayLength(key)), "Incorrect Array Length");
            assert.equal(lastElement, await I_DataStore.getBoolArrayElement(key, indexToDelete), "Incorrect array element");
        });

        it("Should set and fetch multiple uint256 correctly", async () => {
            await expect(I_DataStore.connect(token_owner).setUint256Multi([key], [1, 2])).to.be.reverted;
            await I_DataStore.connect(token_owner).setUint256Multi([key, key2], [1, 2]);
            assert.equal(Number(await I_DataStore.getUint256(key)), 1, "Incorrect Data Inserted");
            assert.equal(Number(await I_DataStore.getUint256(key2)), 2, "Incorrect Data Inserted");
        });

        it("Should set and fetch multiple bytes32 correctly", async () => {
            await I_DataStore.connect(token_owner).setBytes32Multi([key, key2], [bytes32data, bytes32data2]);
            assert.equal(await I_DataStore.getBytes32(key), bytes32data, "Incorrect Data Inserted");
            assert.equal(await I_DataStore.getBytes32(key2), bytes32data2, "Incorrect Data Inserted");
        });

        it("Should set and fetch multiple address correctly", async () => {
            await I_DataStore.connect(token_owner).setAddressMulti([key, key2], [COMMON_ADDRESSES.ONE, COMMON_ADDRESSES.TWO]);
            assert.equal(await I_DataStore.addressGetter(key), COMMON_ADDRESSES.ONE, "Incorrect Data Inserted");
            assert.equal(await I_DataStore.addressGetter(key2), COMMON_ADDRESSES.TWO, "Incorrect Data Inserted");
        });

        it("Should set and fetch multiple bool correctly", async () => {
            await I_DataStore.connect(token_owner).setBoolMulti([key, key2], [true, true]);
            assert.equal(await I_DataStore.getBool(key), true, "Incorrect Data Inserted");
            assert.equal(await I_DataStore.getBool(key2), true, "Incorrect Data Inserted");
        });

        it("Should insert multiple uint256 into multiple Array", async () => {
            let arrLen = await I_DataStore.getUint256ArrayLength(key);
            let arrLen2 = await I_DataStore.getUint256ArrayLength(key2);
            await I_DataStore.connect(token_owner).insertUint256Multi([key, key2], [10, 20]);
            let arrElement = await I_DataStore.getUint256ArrayElement(key, Number(arrLen));
            let arrElement2 = await I_DataStore.getUint256ArrayElement(key2, Number(arrLen2));
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getUint256ArrayLength(key)), "Incorrect Array Length");
            assert.equal(Number(arrElement), 10, "Incorrect array element");
            assert.equal(Number(arrLen2) + 1, Number(await I_DataStore.getUint256ArrayLength(key2)), "Incorrect Array Length");
            assert.equal(Number(arrElement2), 20, "Incorrect array element");
        });

        it("Should insert multiple bytes32 into multiple Array", async () => {
            let arrLen = await I_DataStore.getBytes32ArrayLength(key);
            let arrLen2 = await I_DataStore.getBytes32ArrayLength(key2);
            await I_DataStore.connect(token_owner).insertBytes32Multi([key, key2], [bytes32data, bytes32data2]);
            let arrElement = await I_DataStore.getBytes32ArrayElement(key, Number(arrLen));
            let arrElement2 = await I_DataStore.getBytes32ArrayElement(key2, Number(arrLen2));
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getBytes32ArrayLength(key)), "Incorrect Array Length");
            assert.equal(Number(arrLen2) + 1, Number(await I_DataStore.getBytes32ArrayLength(key2)), "Incorrect Array Length");
            assert.equal(arrElement, bytes32data, "Incorrect array element");
            assert.equal(arrElement2, bytes32data2, "Incorrect array element");
        });

        it("Should insert multiple address into multiple Array", async () => {
            let arrLen = await I_DataStore.getAddressArrayLength(key);
            let arrLen2 = await I_DataStore.getAddressArrayLength(key2);
            await I_DataStore.connect(token_owner).insertAddressMulti([key, key2], [COMMON_ADDRESSES.ONE, COMMON_ADDRESSES.TWO]);
            let arrElement = await I_DataStore.getAddressArrayElement(key, Number(arrLen));
            let arrElement2 = await I_DataStore.getAddressArrayElement(key2, Number(arrLen2));
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getAddressArrayLength(key)), "Incorrect Array Length");
            assert.equal(Number(arrLen2) + 1, Number(await I_DataStore.getAddressArrayLength(key2)), "Incorrect Array Length");
            assert.equal(arrElement, COMMON_ADDRESSES.ONE, "Incorrect array element");
            assert.equal(arrElement2, COMMON_ADDRESSES.TWO, "Incorrect array element");
        });

        it("Should insert multiple bool into multiple Array", async () => {
            let arrLen = await I_DataStore.getBoolArrayLength(key);
            let arrLen2 = await I_DataStore.getBoolArrayLength(key2);
            await I_DataStore.connect(token_owner).insertBoolMulti([key, key2], [true, true]);
            let arrElement = await I_DataStore.getBoolArrayElement(key, Number(arrLen));
            let arrElement2 = await I_DataStore.getBoolArrayElement(key2, Number(arrLen2));
            assert.equal(Number(arrLen) + 1, Number(await I_DataStore.getBoolArrayLength(key)), "Incorrect Array Length");
            assert.equal(Number(arrLen2) + 1, Number(await I_DataStore.getBoolArrayLength(key2)), "Incorrect Array Length");
            assert.equal(arrElement, true, "Incorrect array element");
            assert.equal(arrElement2, true, "Incorrect array element");
        });
    });

    describe("Should not allow unautohrized modification to data", async () => {
        it("Should not allow unauthorized addresses to modify uint256", async () => {
            await expect(I_DataStore.connect(account_polymath).setUint256(key, 1)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify bytes32", async () => {
            await expect(I_DataStore.connect(account_polymath).setBytes32(key, bytes32data)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify address", async () => {
            await expect(I_DataStore.connect(account_polymath).setAddress(key, COMMON_ADDRESSES.ONE)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify string", async () => {
            await expect(I_DataStore.connect(account_polymath).setString(key, TOKEN_CONFIG.name)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify bytes", async () => {
            await expect(I_DataStore.connect(account_polymath).setBytes32(key, bytes32data)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify bool", async () => {
            await expect(I_DataStore.connect(account_polymath).setBool(key, true)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify uint256 array", async () => {
            let arr = [1, 2];
            await expect(I_DataStore.connect(account_polymath).setUint256Array(key, arr)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify bytes32 array", async () => {
            let arr = [bytes32data, bytes32data2];
            await expect(I_DataStore.connect(account_polymath).setBytes32Array(key, arr)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify address array", async () => {
            let arr = [COMMON_ADDRESSES.ZERO, COMMON_ADDRESSES.ONE];
            await expect(I_DataStore.connect(account_polymath).setAddressArray(key, arr)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify bool array", async () => {
            let arr = [false, true];
            await expect(I_DataStore.connect(account_polymath).setBoolArray(key, arr)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert uint256 into Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertUint256(key, 10)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert bytes32 into Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertBytes32(key, bytes32data)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert address into Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertAddress(key, COMMON_ADDRESSES.ONE)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert bool into Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertBool(key, true)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to delete uint256 from Array", async () => {
            await expect(I_DataStore.connect(account_polymath).deleteUint256(key, 0)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to delete bytes32 from Array", async () => {
            await expect(I_DataStore.connect(account_polymath).deleteBytes32(key, 0)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to delete address from Array", async () => {
            await expect(I_DataStore.connect(account_polymath).deleteAddress(key, 0)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to delete bool from Array", async () => {
            await expect(I_DataStore.connect(account_polymath).deleteBool(key, 0)).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify multiple uint256", async () => {
            await expect(I_DataStore.connect(account_polymath).setUint256Multi([key, key2], [1, 2])).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify multiple bytes32", async () => {
            await expect(I_DataStore.connect(account_polymath).setBytes32Multi([key, key2], [bytes32data, bytes32data2])).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify multiple address", async () => {
            await expect(I_DataStore.connect(account_polymath).setAddressMulti([key, key2], [COMMON_ADDRESSES.ONE, COMMON_ADDRESSES.TWO])).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to modify multiple bool", async () => {
            await expect(I_DataStore.connect(account_polymath).setBoolMulti([key, key2], [true, true])).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert multiple uint256 into multiple Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertUint256Multi([key, key2], [10, 20])).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert multiple bytes32 into multiple Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertBytes32Multi([key, key2], [bytes32data, bytes32data2])).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert multiple address into multiple Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertAddressMulti([key, key2], [COMMON_ADDRESSES.ONE, COMMON_ADDRESSES.TWO])).to.be.reverted;
        });

        it("Should not allow unauthorized addresses to insert multiple bool into multiple Array", async () => {
            await expect(I_DataStore.connect(account_polymath).insertBoolMulti([key, key2], [true, true])).to.be.reverted;
        });
    });
});
