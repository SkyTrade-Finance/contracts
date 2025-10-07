import { ethers } from "hardhat";

/**
 * Shared Test Constants
 * Centralized constants used across multiple test files
 */

// Security Token Configuration
export const TOKEN_CONFIG = {
    name: "Team",
    symbol: "SAP",
    tokenDetails: "This is equity type of issuance",
    decimals: 18,
    contact: "team@polymath.network",
} as const;

// Module Keys
export const MODULE_KEYS = {
    DELEGATE_MANAGER: 1,
    TRANSFER_MANAGER: 2,
    STO: 3,
    CHECKPOINT: 4,
} as const;

// Investor Classification
export enum InvestorClass {
    NonUS = 0,
    US = 1,
}

// Fund Raise Types
export const FUND_RAISE_TYPES = {
    ETH: 0,
    POLY: 1,
    DAI: 2,
} as const;

// Time Constants (in seconds)
export const TIME_CONSTANTS = {
    ONE_DAY: 24 * 60 * 60,
    ONE_WEEK: 7 * 24 * 60 * 60,
    ONE_MONTH: 30 * 24 * 60 * 60,
    ONE_YEAR: 365 * 24 * 60 * 60,
} as const;

// Fee Constants
export const FEE_CONSTANTS = {
    INIT_REG_FEE: ethers.parseEther("1000"),
    STO_SETUP_COST: 0,
} as const;

// Common Addresses
export const COMMON_ADDRESSES = {
    ZERO: ethers.ZeroAddress,
    ONE: "0x0000000000000000000000000000000000000001",
    TWO: "0x0000000000000000000000000000000000000002",
} as const;

// Ethereum Unit Helpers
export const ETH_UNITS = {
    e18: 10n ** 18n,
    e16: 10n ** 16n,
    e8: 10n ** 8n,
} as const;

// Trading Restriction Periods
export const RESTRICTION_PERIODS = {
    NON_US_STANDARD: 90 * TIME_CONSTANTS.ONE_DAY,
    US_STANDARD: 180 * TIME_CONSTANTS.ONE_DAY,
} as const;

// Test Messages
export const TEST_MESSAGES = {
    TRANSACTION_SHOULD_FAIL: "Transaction Should Fail!",
    INVALID_PROOF: "Invalid proof",
    ALREADY_OPERATOR: "Already operator",
    NOT_OPERATOR: "Not an operator",
    SIGNATURE_MUST_BE_FROM_OPERATOR: "Signature must be from operator",
} as const;

// Dividend Test Data
export const DIVIDEND_CONFIG = {
    name: "0x546573744469766964656e640000000000000000000000000000000000000000", // "TestDividend" in bytes32
    defaultAmount: ethers.parseEther("1.5"),
} as const;


