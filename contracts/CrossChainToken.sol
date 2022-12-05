// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/libraries/Flags.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/interfaces/IDeBridgeGateExtended.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/ICrossChainToken.sol";

contract CrossChainToken is AccessControl, ERC20, ICrossChainToken {
    event TokenRecieved(uint256 amount);
    /// @dev DeBridgeGate's address on the current chain
    IDeBridgeGateExtended public deBridgeGate;

    /// @dev Chain ID where the cross-chain counter contract has been deployed
    uint256 remoteChainID;

    /// @dev Address of the cross-chain counter contract (on the `remoteChainID` chain)
    address remoteAddress;

    error AdminBadRole();

    /* ========== MODIFIERS ========== */

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert AdminBadRole();
        _;
    }

    /* ========== INITIALIZERS ========== */

    constructor(
        string memory _name,
        string memory _symbol,
        address _deBridgeGate
    ) ERC20(_name, _symbol) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _mint(msg.sender, 1000);
        deBridgeGate = IDeBridgeGateExtended(_deBridgeGate);
    }

    /* ========== MAINTENANCE METHODS ========== */

    function setDeBridgeGate(IDeBridgeGateExtended deBridgeGate_)
        external
        onlyAdmin
    {
        deBridgeGate = deBridgeGate_;
    }

    function addRemote(
        uint256 remoteChainID_,
        address remoteAddress_
    ) external onlyAdmin {
        remoteChainID = remoteChainID_;
        remoteAddress = remoteAddress_;
    }

    function giveMe(uint256 amount) external {
        _mint(msg.sender, amount);
    }

    /* ========== PUBLIC METHODS: SENDING ========== */

    function sendRemote(uint256 _amount, uint256 _executionFee)
        external
        payable
    {
        _burn(msg.sender, _amount);
        bytes memory dstTxCall = _encodeReceiveCommand(_amount, msg.sender);

        _send(dstTxCall, _executionFee);
    }

    function recieveRemote(uint256 _amount, address _to) public override {
        _mint(_to, _amount);
        emit TokenRecieved(_amount);
    }

    /* ========== INTERNAL METHODS ========== */

    function _encodeReceiveCommand(uint256 _amount, address _to)
        internal
        pure
        returns (bytes memory)
    {
        return
            abi.encodeWithSelector(
                ICrossChainToken.recieveRemote.selector,
                _amount,
                _to
            );
    }

    function _send(bytes memory _dstTransactionCall, uint256 _executionFee)
        internal
    {
        //
        // sanity checks
        //
        uint256 protocolFee = deBridgeGate.globalFixedNativeFee();
        require(
            msg.value >= (protocolFee + _executionFee),
            "fees not covered by the msg.value"
        );

        // we bridge as much asset as specified in the _executionFee arg
        // (i.e. bridging the minimum necessary amount to to cover the cost of execution)
        // However, deBridge cuts a small fee off the bridged asset, so
        // we must ensure that executionFee < amountToBridge
        uint assetFeeBps = deBridgeGate.globalTransferFeeBps();
        uint amountToBridge = _executionFee;
        uint amountAfterBridge = amountToBridge * (10000 - assetFeeBps) / 10000;

        //
        // start configuring a message
        //
        IDeBridgeGate.SubmissionAutoParamsTo memory autoParams;

        // use the whole amountAfterBridge as the execution fee to be paid to the executor
        autoParams.executionFee = amountAfterBridge;

        // Exposing nativeSender must be requested explicitly
        // We request it bc of CrossChainCounter's onlyCrossChainIncrementor modifier
        autoParams.flags = Flags.setFlag(
            autoParams.flags,
            Flags.PROXY_WITH_SENDER,
            true
        );

        // if something happens, we need to revert the transaction, otherwise the sender will loose assets
        autoParams.flags = Flags.setFlag(
            autoParams.flags,
            Flags.REVERT_IF_EXTERNAL_FAIL,
            true
        );

        autoParams.data = _dstTransactionCall;
        autoParams.fallbackAddress = abi.encodePacked(msg.sender);

        try 
            deBridgeGate.send{value: msg.value}(
                address(0), // _tokenAddress
                amountToBridge, // _amount
                remoteChainID, // _chainIdTo
                abi.encodePacked(remoteAddress), // _receiver
                "", // _permit
                true, // _useAssetFee
                0, // _referralCode
                abi.encode(autoParams) // _autoParams
        ) {} catch Error(string memory err) {
            revert(err);
        } 
            
    }
}
