import { BigNumber, ContractReceipt } from "ethers";
import { deployMockContract } from "ethereum-waffle";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { CallProxy, DeBridgeGate, MockWeth, MockWeth__factory } from "../../typechain";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DeBridgeGate as DeBridgeGateStructs } from "./structs";

function _check(hre: HardhatRuntimeEnvironment) {
    if (hre.network.name != 'hardhat') throw new Error("deBridge.emulator is intended for hardhat network only")
}

// Define the state so we can ease deBridgeSimulator usage

interface _STATE {
    currentGate?: DeBridgeGate
}

const STATE: _STATE = {}

// deployGate

export interface DeployDebridgeGateFunction {
    (): Promise<DeBridgeGate>;
}

export function makeDeployGate(hre: HardhatRuntimeEnvironment): DeployDebridgeGateFunction {
    _check(hre);

    return async function deployGate(): Promise<DeBridgeGate> {
        // setup WETH9 for wrapping
        const Weth = await hre.ethers.getContractFactory('MockWeth') as MockWeth__factory;
        const weth = await Weth.deploy("wrapped Ether", "wETH") as MockWeth;
        await weth.deployed();

        const DeBridgeGate = await hre.ethers.getContractFactory("DeBridgeGate");
        const deBridgeGate = await hre.upgrades.deployProxy(DeBridgeGate, [0, weth.address]) as DeBridgeGate
        await deBridgeGate.deployed();


        // setup callproxy
        const CallProxy = await hre.ethers.getContractFactory("CallProxy");
        const callProxy = await hre.upgrades.deployProxy(CallProxy) as CallProxy;
        await callProxy.deployed();

        await callProxy.grantRole(await callProxy.DEBRIDGE_GATE_ROLE(), deBridgeGate.address)
        await deBridgeGate.setCallProxy(callProxy.address)

        // setup signature verifier
        const Verifier = await hre.ethers.getContractFactory('SignatureVerifier')
        const signatureVerifierMock = await deployMockContract((await hre.ethers.getSigners())[0], [...Verifier.interface.fragments]);
        await signatureVerifierMock.mock.submit.returns()

        await deBridgeGate.setSignatureVerifier(signatureVerifierMock.address)

        // setup chain support (loopback)
        await deBridgeGate.setChainSupport(hre.ethers.provider.network.chainId, true, false);
        await deBridgeGate.setChainSupport(hre.ethers.provider.network.chainId, true, true);

        // setup global fee
        await deBridgeGate.updateGlobalFee(BigNumber.from(0.1e18.toString()), 0)

        STATE.currentGate = deBridgeGate
        return deBridgeGate
    }
}

// getClaimArgs

type ClaimArgs = Parameters<DeBridgeGate['claim']>

interface GetClaimArgsOpts {
    gate?: DeBridgeGate, sendTransactionReceipt?: ContractReceipt
}

export interface GetClaimArgsFunction {
    (opts?: GetClaimArgsOpts): Promise<ClaimArgs>;
}

export function makeGetClaimArgs(hre: HardhatRuntimeEnvironment): GetClaimArgsFunction {
    _check(hre);

    return async function getClaimArgs(opts: GetClaimArgsOpts = {}): Promise<ClaimArgs> {
        opts.gate = opts.gate || STATE.currentGate;
        if (!opts.gate) throw new Error("DeBridgeGate not yet deployed")

        // find the last Sent() event emitted
        const sentEvent = (await opts.gate.queryFilter(opts.gate.filters.Sent()))
            .reverse()
            .find(ev =>
                opts.sendTransactionReceipt
                    ? ev.transactionHash === opts.sendTransactionReceipt.transactionHash
                    : true)
        if (!sentEvent) throw new Error("Sent() event not found")

        // decode SubmissionAutoParamsTo
        const autoParamsToValues = defaultAbiCoder.decode([DeBridgeGateStructs.SubmissionAutoParamsTo], sentEvent.args.autoParams)[0];

        // make SubmissionAutoParamsFrom based on SubmissionAutoParamsTo value
        const autoParamsFromValues = [...autoParamsToValues, sentEvent.args.nativeSender]
        const autoParamsFrom = defaultAbiCoder.encode(
            [DeBridgeGateStructs.SubmissionAutoParamsFrom],
            [autoParamsFromValues]
        )

        return [
            sentEvent.args.debridgeId,
            sentEvent.args.amount,
            hre.ethers.provider.network.chainId,
            sentEvent.args.receiver,
            sentEvent.args.nonce,
            "0x123456",
            autoParamsFrom,
        ]
    }
}