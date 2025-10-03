// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DummyERC20
 * @dev A dummy ERC20 token for testing purposes that premints infinite tokens to the deployer
 * @notice This contract is ONLY for testing and should NEVER be deployed to mainnet
 */
contract DummyERC20 is ERC20, Ownable {
    
    /**
     * @dev Constructor that creates the token and mints infinite supply to the deployer
     * @param _name The name of the token
     * @param _symbol The symbol of the token
     * @param _decimals The number of decimals for the token
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        // Mint maximum possible tokens to the deployer (effectively infinite for testing)
        // Using type(uint256).max which is 2^256 - 1
        _mint(msg.sender, type(uint256).max);
    }
    
    /**
     * @dev Function to mint additional tokens (only owner can call)
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @dev Function to burn tokens from caller's balance
     * @param amount The amount of tokens to burn
     */
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
    
    /**
     * @dev Function to burn tokens from a specific address (only owner can call)
     * @param from The address to burn tokens from
     * @param amount The amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) public onlyOwner {
        _burn(from, amount);
    }
}
