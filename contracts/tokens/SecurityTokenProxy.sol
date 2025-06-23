// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../proxy/OwnedUpgradeabilityProxy.sol";
import "./OZStorage.sol";
import "./SecurityTokenStorage.sol";
import "hardhat/console.sol";

/**
 * @title USDTiered STO module Proxy
 */
contract SecurityTokenProxy is OZStorage, SecurityTokenStorage, OwnedUpgradeabilityProxy {

    /**
     * @notice constructor
     * @param _name Name of the SecurityToken
     * @param _symbol Symbol of the Token
     * @param _decimals Decimals for the securityToken
     * @param _granularity granular level of the token
     * @param _tokenDetails Details of the token that are stored off-chain
     * @param _polymathRegistry Contract address of the polymath registry
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _granularity,
        string memory _tokenDetails,
        address _polymathRegistry
    )
    {
        //Set storage variables - NB implementation not yet set
        require(_polymathRegistry != address(0), "Invalid Address");
        name_ = _name;
        symbol_ = _symbol;
        decimals_ = _decimals;
        polymathRegistry = IPolymathRegistry(_polymathRegistry);
        tokenDetails = _tokenDetails;
        granularity = _granularity;
        owner_ = msg.sender;
        console.log(owner_, " is the owner of the SecurityTokenProxy");
    }

}
