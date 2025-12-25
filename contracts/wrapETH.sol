// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract ShadowLuckWETH is ERC7984, ZamaEthereumConfig {
    address public minter;

    constructor(address initialMinter) ERC7984("ShadowLuck WETH", "slWETH", "") {
        minter = initialMinter;
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function setMinter(address newMinter) external {
        require(msg.sender == minter, "Caller is not minter");
        require(newMinter != address(0), "Invalid minter");
        minter = newMinter;
    }

    function mint(address to, euint64 amount) external returns (euint64 transferred) {
        require(msg.sender == minter, "Caller is not minter");
        return _mint(to, amount);
    }
}
