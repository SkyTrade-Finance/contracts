// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../interfaces/IOracle.sol";
import "../libraries/Ownable.sol";

contract StableOracle is IOracle, Ownable {
    IOracle public oracle;
    uint256 public lastPrice;
    uint256 public evictPercentage; // % multiplied by 10**16

    bool public manualOverride;
    uint256 public manualPrice;

    event ChangeOracle(address indexed oldOracle, address indexed newOracle);
    event ChangeEvictPercentage(uint256 oldEvictPercentage, uint256 newEvictPercentage);
    event SetManualPrice(uint256 oldPrice, uint256 newPrice);
    event SetManualOverride(bool overrideStatus);

    /**
     * @notice Creates a new stable oracle based on existing oracle
     * @param _oracle address of underlying oracle
     * @param _evictPercentage allowed change percentage (scaled by 10^16)
     */
    constructor(address _oracle, uint256 _evictPercentage) Ownable() {
        require(_oracle != address(0), "Invalid oracle");
        oracle = IOracle(_oracle);
        evictPercentage = _evictPercentage;
    }

    /**
     * @notice Updates oracle address
     * @param _oracle Address of new underlying oracle
     */
    function changeOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        emit ChangeOracle(address(oracle), _oracle);
        oracle = IOracle(_oracle);
    }

    /**
     * @notice Updates eviction percentage
     * @param _evictPercentage Percentage multiplied by 10**16
     */
    function changeEvictPercentage(uint256 _evictPercentage) external onlyOwner {
        emit ChangeEvictPercentage(evictPercentage, _evictPercentage);
        evictPercentage = _evictPercentage;
    }

    /**
     * @notice Returns address of oracle currency (0x0 for ETH)
     */
    function getCurrencyAddress() external view override returns (address) {
        return oracle.getCurrencyAddress();
    }

    /**
     * @notice Returns symbol of oracle currency (e.g. "ETH")
     */
    function getCurrencySymbol() external view override returns (bytes32) {
        return oracle.getCurrencySymbol();
    }

    /**
     * @notice Returns denomination of price (e.g. "USD")
     */
    function getCurrencyDenominated() external view override returns (bytes32) {
        return oracle.getCurrencyDenominated();
    }

    /**
     * @notice Returns the latest price (manual if override is set)
     */
    function getPrice() external override returns (uint256) {
        if (manualOverride) {
            return manualPrice;
        }

        uint256 currentPrice = oracle.getPrice();

        if (lastPrice == 0 || _change(currentPrice, lastPrice) >= evictPercentage) {
            lastPrice = currentPrice;
        }

        return lastPrice;
    }

    /**
     * @notice Internal function to compute % price change scaled by 1e18
     */
    function _change(uint256 _newPrice, uint256 _oldPrice) internal pure returns (uint256) {
        if (_oldPrice == 0) return type(uint256).max;
        uint256 diff = _newPrice > _oldPrice ? _newPrice - _oldPrice : _oldPrice - _newPrice;
        return (diff * 1e18) / _oldPrice;
    }

    /**
     * @notice Set manual price (only used when override is true)
     */
    function setManualPrice(uint256 _price) external onlyOwner {
        emit SetManualPrice(manualPrice, _price);
        manualPrice = _price;
    }

    /**
     * @notice Toggle manual price override
     */
    function setManualOverride(bool _override) external onlyOwner {
        manualOverride = _override;
        emit SetManualOverride(_override);
    }
}