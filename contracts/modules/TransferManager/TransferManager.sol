// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../Module.sol";
import "../../interfaces/ITransferManager.sol";

/**
 * @title Base abstract contract to be implemented by all Transfer Manager modules
 */
abstract contract TransferManager is ITransferManager, Module {

    bytes32 public constant LOCKED = "LOCKED";
    bytes32 public constant UNLOCKED = "UNLOCKED";

    modifier onlySecurityToken() {
        require(msg.sender == address(securityToken), "Sender is not owner");
        _;
    }

    // Provide default versions of ERC1410 functions that can be overriden

    /**
     * @notice return the amount of tokens for a given user as per the partition
     * @dev returning the balance of token holder against the UNLOCKED partition. 
     * This condition is valid only when the base contract doesn't implement the
     * `getTokensByPartition()` function.  
     */
    function getTokensByPartition(bytes32 _partition, address _tokenHolder, uint256 /*_additionalBalance*/) external virtual view returns(uint256) {
        if (_partition == UNLOCKED)
            return securityToken.balanceOf(_tokenHolder);
        return uint256(0);
    }

}
