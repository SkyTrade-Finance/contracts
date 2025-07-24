// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ITradingRestrictionManager {
    enum InvestorClass { NonUS, US }

    struct InvestorKYCData {
        bytes32[] proof;
        uint64 expiryTime;
        InvestorClass investorClass;
    }

    event InvestorKYCDataUpdated(address indexed investor, bytes32[] proof, uint64 expiryTime, bool isAccredited, InvestorClass investorClass);
    event WhitelistOnlyTradingUpdated(address indexed token, bool status);
    event MerkleRootUpdated(bytes32 root);

    function modifyKYCData(
        bytes32 root
    ) external;

    function verifyInvestor(
        bytes32[] calldata proof,
        address investor,
        uint64 expiry,
        bool isAccredited,
        InvestorClass investorClass
    ) external returns (bool);

    function setTradingRestrictionPeriod(
        address token,
        uint64 nonUSRestrictionPeriod,
        uint64 usRestrictionPeriod,
        uint64 lockStartTime
    ) external;

    function setWhitelistOnlyTrading(address token, bool status) external;

    function isExistingInvestor(address investor) external view returns (bool);

    function getInvestorKYCData(
        address investor,
        address token
    ) external view returns (
        uint64 canSendAfter,
        uint64 canReceiveAfter,
        uint64 expiryTime,
        uint8 added
    );
}