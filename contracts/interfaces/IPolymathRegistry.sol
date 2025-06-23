// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

interface IPolymathRegistry {

    event ChangeAddress(string _nameKey, address indexed _oldAddress, address indexed _newAddress);
    
    /**
     * @notice Returns the contract address
     * @param _nameKey is the key for the contract address mapping
     *  registryAddress
     */
    function getAddress(string calldata _nameKey) external view returns(address registryAddress);

    /**
     * @notice Changes the contract address
     * @param _nameKey is the key for the contract address mapping
     * @param _newAddress is the new contract address
     */
    function changeAddress(string calldata _nameKey, address _newAddress) external;

}
