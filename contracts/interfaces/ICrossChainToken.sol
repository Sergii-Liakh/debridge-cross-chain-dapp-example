// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface ICrossChainToken {
    function recieveRemote(uint256 _amount, address _to) external;
}