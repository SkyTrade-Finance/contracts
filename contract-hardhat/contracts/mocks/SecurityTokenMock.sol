// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../tokens/SecurityToken.sol";

contract SecurityTokenMock is SecurityToken {

    /**
     * @notice Initialization function
     * @dev Expected to be called atomically with the proxy being created, by the owner of the token
     * @dev Can only be called once
     */
    function initialize(address _getterDelegate) public override {
        super.initialize(_getterDelegate);
        securityTokenVersion = SemanticVersion(2, 2, 0);
    }
}
