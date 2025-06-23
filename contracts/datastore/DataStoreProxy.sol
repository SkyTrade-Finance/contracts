// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../proxy/Proxy.sol";
import "./DataStoreStorage.sol";

/**
 * @title DataStoreProxy Proxy
 */
contract DataStoreProxy is DataStoreStorage, Proxy {

    /**
    * @notice Constructor
    * @param _securityToken Address of the security token
    * @param _implementation representing the address of the new implementation to be set
    */
    constructor(
        address _securityToken,
        address _implementation
    )
    {
        require(_implementation != address(0) && _securityToken != address(0),
            "Address should not be 0x"
        );
        securityToken = ISecurityToken(_securityToken);
        __implementation = _implementation;
    }

    /**
    * @notice Internal function to provide the address of the implementation contract
    */
    function _implementation() internal override view returns(address) {
        return __implementation;
    }

}
