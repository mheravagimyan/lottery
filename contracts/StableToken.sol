// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// Using just for test
contract StableToken is ERC20("Stable Token", "ST") {
    function mint(address to, uint amount) external {
        _mint(to, amount);
    }
}