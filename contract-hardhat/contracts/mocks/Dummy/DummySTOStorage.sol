// SPDX-License-Identifier: MIT 
pragma solidity 0.8.30;

/**
 * @title Contract used to store layout for the DummySTO storage
 */
contract DummySTOStorage {

    uint256 public _investorCount;

    uint256 public cap;
    string public someString;

    mapping (address => uint256) public investors;

}
