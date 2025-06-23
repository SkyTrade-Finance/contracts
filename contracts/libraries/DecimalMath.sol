// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library DecimalMath {
    uint256 internal constant e18 = 10 ** 18;

    /**
     * @notice This function multiplies two decimals represented as (decimal * 10**DECIMALS)
     *  z
     */
    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = (x * y + e18 / 2) / e18;
    }

    /**
     * @notice This function divides two decimals represented as (decimal * 10**DECIMALS)
     *  z
     */
    function div(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = (x * e18 + y / 2) / y;
    }
}
