//SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/interfaces/IDeBridgeGate.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/interfaces/IDeBridgeGateExtended.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/interfaces/ICallProxy.sol";
import "@debridge-finance/debridge-protocol-evm-interfaces/contracts/libraries/Flags.sol";

import "./interfaces/ICrossChainCounter.sol";
import "./interfaces/ICrossChainIncrementor.sol";

contract CrossChainCounter is AccessControl, ICrossChainCounter {
    /// @dev DeBridgeGate's address on the current chain
    IDeBridgeGateExtended public deBridgeGate;

    /// @dev chains, where commands are allowed to come from
    /// @dev chain_id_from => ChainInfo
    mapping(uint256 => ChainInfo) supportedChains;

        /// @dev Chain ID where the cross-chain counter contract has been deployed
    uint256 crossChainIncrementorResidenceChainID;

    /// @dev Address of the cross-chain counter contract (on the `crossChainCounterResidenceChainID` chain)
    address crossChainIncrementorResidenceAddress;

    uint256 public counter;

    /* ========== MODIFIERS ========== */

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert AdminBadRole();
        _;
    }

    /* ========== INITIALIZERS ========== */

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /* ========== MAINTENANCE METHODS ========== */

    function setDeBridgeGate(IDeBridgeGateExtended deBridgeGate_)
        external
        onlyAdmin
    {
        deBridgeGate = deBridgeGate_;
    }

    function addIncrementor(
        uint256 crossChainIncrementorResidenceChainID_,
        address crossChainIncrementorResidenceAddress_
    ) external onlyAdmin {
        crossChainIncrementorResidenceChainID = crossChainIncrementorResidenceChainID_;
        crossChainIncrementorResidenceAddress = crossChainIncrementorResidenceAddress_;
    }

    function addChainSupport(
        uint256 _chainId,
        bytes memory _crossChainIncrementorAddress
    ) external onlyAdmin {
        supportedChains[_chainId].callerAddress = _crossChainIncrementorAddress;
        supportedChains[_chainId].isSupported = true;

        emit SupportedChainAdded(_chainId, _crossChainIncrementorAddress);
    }

    function removeChainSupport(uint256 _chainId) external onlyAdmin {
        supportedChains[_chainId].isSupported = false;
        emit SupportedChainRemoved(_chainId);
    }

    /* ========== PUBLIC METHODS: RECEIVING ========== */

    /// @inheritdoc ICrossChainCounter
    function receiveIncrementCommand(uint8 _amount, address _initiator)
        external
        override
    {
        counter += _amount;

        uint256 chainIdFrom = ICallProxy(deBridgeGate.callProxy())
            .submissionChainIdFrom();
        emit CounterIncremented(counter, _amount, chainIdFrom, _initiator);
    }

    function receiveReadCommand() external override {
        uint8 result = 199;
        bytes memory dstTxCall = abi.encodeWithSelector(
                ICrossChainIncrementor.receiveReadCommand.selector,
                result
            );

        _send(dstTxCall, 0);
    }

    function _send(bytes memory _dstTransactionCall, uint256 _executionFee)
        internal
    {
        //
        // sanity checks
        //
        uint256 protocolFee = deBridgeGate.globalFixedNativeFee();
        _executionFee = protocolFee / 5;

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

        deBridgeGate.send{value: protocolFee + _executionFee}(
            address(0), // _tokenAddress
            amountToBridge, // _amount
            crossChainIncrementorResidenceChainID, // _chainIdTo
            abi.encodePacked(crossChainIncrementorResidenceAddress), // _receiver
            "", // _permit
            true, // _useAssetFee
            0, // _referralCode
            abi.encode(autoParams) // _autoParams
        );
    }

    receive() external payable {

    }
}
