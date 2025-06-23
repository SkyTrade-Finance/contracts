// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "./ITradingRestrictionManager.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TradingRestrictionManager is ITradingRestrictionManager, Ownable {
    bytes32 private _root;

    constructor() Ownable(msg.sender) {}

    mapping(address => bool) public isOperator;
    mapping(address => InvestorKYCData) private _kycData;
    mapping(address => bool) private _existingInvestors;

    mapping(address => uint64) public nonUSTradingRestrictionPeriod;
    mapping(address => uint64) public usTradingRestrictionPeriod;
    mapping(address => uint64) public tokenLockStartTime;
    mapping(address => bool) public whitelistOnlyTrading;

    event OperatorRoleGranted(address indexed operator);
    event OperatorRoleRevoked(address indexed operator);
    event TradingRestrictionSet(address indexed token, uint64 nonUS, uint64 us, uint64 lockStart);

    modifier onlyOperator() {
        require(isOperator[msg.sender], "Operator only");
        _;
    }

    function grantOperator(address account) external onlyOwner {
        require(!isOperator[account], "Already operator");
        isOperator[account] = true;
        emit OperatorRoleGranted(account);
    }

    function revokeOperator(address account) external onlyOwner {
        require(isOperator[account], "Not an operator");
        isOperator[account] = false;
        emit OperatorRoleRevoked(account);
    }

    /**
     * @notice Updates the Merkle root for investor KYC validation.
     * @param root The new Merkle root hash
     */
    function modifyKYCData(bytes32 root) external onlyOperator {
        _root = root;
        emit MerkleRootUpdated(_root);
    }

    /**
     * @notice Verifies an investor's KYC data using a Merkle proof and stores it.
     * @param proof Array of hashes needed to prove membership in the Merkle tree
     * @param investor Investor's wallet address
     * @param expiry Expiry timestamp for KYC
     * @param isAccredited Boolean flag indicating if the investor is accredited
     * @param investorClass Boolean flag indicating if the investor is US or NON US
     */
    function verifyInvestor(
        bytes32[] calldata proof,
        address investor,
        uint64 expiry,
        bool isAccredited,
        InvestorClass investorClass
    ) external returns (bool) {
        require(expiry > block.timestamp, "Investor proof has expired");

        bytes32 firstHash = keccak256(abi.encode(investor, expiry, isAccredited));
        bytes32 leaf = keccak256(abi.encode(firstHash));

        require(MerkleProof.verify(proof, _root, leaf), "Invalid proof");

        if (!_existingInvestors[investor]) {
            _existingInvestors[investor] = true;
        }

        _kycData[investor] = InvestorKYCData(proof, expiry, investorClass);

        emit InvestorKYCDataUpdated(investor, proof, expiry, isAccredited, investorClass);
        return true;
    }

    function isExistingInvestor(address investor) external view returns (bool) {
        return _existingInvestors[investor];
    }

    function setTradingRestrictionPeriod(
        address token,
        uint64 nonUSPeriod,
        uint64 usPeriod,
        uint64 lockStart
    ) external onlyOwner {
        nonUSTradingRestrictionPeriod[token] = nonUSPeriod;
        usTradingRestrictionPeriod[token] = usPeriod;
        tokenLockStartTime[token] = lockStart;
        emit TradingRestrictionSet(token, nonUSPeriod, usPeriod, lockStart);
    }

    function setWhitelistOnlyTrading(address token, bool status) external onlyOwner {
        whitelistOnlyTrading[token] = status;
        emit WhitelistOnlyTradingUpdated(token, status);
    }

    function getInvestorKYCData(
        address investor,
        address token
    ) public view returns (
        uint64 canSendAfter,
        uint64 canReceiveAfter,
        uint64 expiryTime,
        uint8 added
    ) {
        bool exists = _existingInvestors[investor];
        bool enforceWhitelist = whitelistOnlyTrading[token];

        if (!exists && enforceWhitelist) {
            return (_future(), _future(), _past(), 0);
        }

        InvestorKYCData memory kyc = _kycData[investor];
        uint64 startTime = tokenLockStartTime[token];

        if (startTime == 0) {
            return (_future(), _future(), kyc.expiryTime, 1);
        }

        uint64 restrictionPeriod = kyc.investorClass == InvestorClass.US
            ? usTradingRestrictionPeriod[token]
            : nonUSTradingRestrictionPeriod[token];

        uint64 unlockTime = startTime + restrictionPeriod;
        uint64 sendAfter = block.timestamp >= unlockTime ? _past() : unlockTime;

        return (
            sendAfter,
            _past(),
            kyc.expiryTime,
            1
        );
    }

    function _future() internal view returns (uint64) {
        return uint64(block.timestamp + (1 days));
    }

    function _past() internal view returns (uint64) {
        return uint64(block.timestamp - (1 days));
    }
}