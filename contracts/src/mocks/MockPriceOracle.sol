// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPriceOracle} from "../oracles/IPriceOracle.sol";

/// @title MockPriceOracle
/// @notice DEMO / TEST ONLY. A settable in-memory oracle used by the hackathon
///         demo, tests, and local Anvil deployments. Production deployments use
///         ChainlinkOracleAdapter instead.
contract MockPriceOracle is IPriceOracle {
    uint256 public price;

    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(uint256 _initialPrice) {
        price = _initialPrice;
    }

    function setPrice(uint256 _price) external {
        uint256 old = price;
        price = _price;
        emit PriceUpdated(old, _price);
    }

    /// @inheritdoc IPriceOracle
    function getPrice() external view returns (uint256) {
        return price;
    }
}
