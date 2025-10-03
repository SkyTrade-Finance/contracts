// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title Interface that every module contract should implement
 */
interface IModule {
    // Emit when trading restriction manager address get changed
    event TradingRestrictionManagerUpdated(address indexed newManager);
    
    /**
     * @notice This function returns the signature of configure function
     */
    function getInitFunction() external pure returns(bytes4 initFunction);

    /**
     * @notice Return the permission flags that are associated with a module
     */
    function getPermissions() external view returns(bytes32[] memory permissions);

}
