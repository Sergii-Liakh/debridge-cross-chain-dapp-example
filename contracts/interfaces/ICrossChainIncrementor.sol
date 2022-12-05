// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface ICrossChainIncrementor {
    /* ========== EVENTS ========== */

    event ValueRead(uint8 amount);


    /* ========== METHODS ========== */

    function receiveReadCommand(uint8 _amount)
        external;
}
