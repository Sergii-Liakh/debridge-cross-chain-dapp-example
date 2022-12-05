import { DeBridgeGate__factory } from "@debridge-finance/hardhat-debridge/dist/typechain";
import chalk from "chalk";
import { BigNumber, constants } from "ethers";
import { task } from "hardhat/config";

import {
  CrossChainToken,
  CrossChainToken__factory,
} from "../../typechain";
import { SentEvent } from "../../typechain/IDeBridgeGate";

const DEFAULT_DEBRIDGE_ADDRESS = "0x43dE2d77BF8027e25dBD179B491e8d64f38398aA";

task("deploy-token", "Deploys CrossChainToken").setAction(
  async (args, hre) => {
    const Counter = (await hre.ethers.getContractFactory(
      "CrossChainToken"
    )) as CrossChainToken__factory;
    const counter = (await Counter.deploy('Test', 'TST', "0x43dE2d77BF8027e25dBD179B491e8d64f38398aA")) as CrossChainToken;
    await counter.deployed();

    console.log(
      chalk.green("CrossChainToken"),
      `has been deployed at ${chalk.red(counter.address)}`,
      `on the chain ${hre.network.name} (chainId: ${chalk.red(
        hre.ethers.provider.network.chainId
      )})`
    );
  }
);

task(
  "configure-token",
  "Configures CrossChainToken by setting the deBridgeGate contract address as well as the target Token contract and chainId"
)
  .addParam(
    "currentAddress",
    "Address of the CrossChainToken contract on the current chain"
  )
  .addParam(
    "remoteAddress",
    "Address of the CrossChainToken contract on the given chain"
  )
  .addParam(
    "remoteChainId",
    "The chain ID where CrossChainToken has been deployed"
  )
  .addOptionalParam(
    "deBridgeGateAddress",
    "Address of the deBridgeGate contract on the current chain (default value represents the mainnet address)",
    DEFAULT_DEBRIDGE_ADDRESS
  )
  .setAction(async (args, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const token = CrossChainToken__factory.connect(
      args.currentAddress,
      signer
    );

    const tx1 = await token.setDeBridgeGate(args.deBridgeGateAddress);
    await tx1.wait();

    const tx2 = await token.addRemote(
      args.remoteChainId,
      args.remoteAddress
    );
    await tx2.wait();

    console.log(
      chalk.blue("CrossChainToken"),
      `has been configured to call CrossChainToken (${args.remoteAddress}, chainId: ${args.remoteChainId})`,
      `via the deBridgeGate contract (${args.deBridgeGateAddress})`
    );

  });


task(
  "send-token",
  "Calls the CrossChainToken contract on the given chain to construct and broadcast a call to increment remote CrossChainToken's value by the given amount"
)
  .addParam(
    "tokenAddress",
    "Address of the CrossChainToken contract on the current chain"
  )
  .addOptionalParam(
    "incrementBy",
    "Amount to increment CrossChainCounter's value by",
    "10"
  )
  .addOptionalParam(
    "executionFeeAmount",
    "Amount of ethers to bridge along with the message to incetivize a third party to execute a transaction on the destination chain",
    "0"
  )
  .setAction(async (args, hre) => {
    const [signer] = await hre.ethers.getSigners();

    const incrementor = CrossChainToken__factory.connect(
      args.tokenAddress,
      signer
    );

    const gate = DeBridgeGate__factory.connect(
      await incrementor.deBridgeGate(),
      signer
    );
    const protocolFee = await gate.globalFixedNativeFee();
    console.log('protocolFee', protocolFee.toString());
    const value = protocolFee.add(BigNumber.from(args.executionFeeAmount));
    console.log({value, protocolFee, fee: args.executionFeeAmount})
    const tx = await incrementor.sendRemote(
      args.incrementBy,
      args.executionFeeAmount,
      {
        value,
      }
    );
    const receipt = await tx.wait();

    console.log(
      `Tx has been included in the blockchain: ${chalk.red(
        receipt.transactionHash
      )}`
    );
    console.log("Looking for deBridgeGate submission id...");

    const events = (await gate.queryFilter(gate.filters.Sent())) as SentEvent[];
    const sentEvent = events
      .reverse()
      .find((ev) => ev.transactionHash === receipt.transactionHash);
    console.log("SubmissionID:", chalk.red(sentEvent?.args.submissionId));
  });

task(
  "read-token-balance",
  "Prints the current state value of the given CrossChainCounter"
)
  .addParam(
    "tokenAddress",
    "The address of the CrossChainToken on the current chain"
  )
  .setAction(async (args, hre) => {
    const [signer] = await hre.ethers.getSigners();

    const counter = CrossChainToken__factory.connect(
      args.tokenAddress,
      signer
    );
    const currentValue = (await counter.balanceOf(signer.address)) as BigNumber;

    console.log(
      "Current CrossChainToken balance:",
      chalk.green(currentValue.toString())
    );
  });

  task(
    "call-gateway"
  )
  .setAction(async (args, hre) => {
    const [signer] = await hre.ethers.getSigners();
    const gate = DeBridgeGate__factory.connect(
      DEFAULT_DEBRIDGE_ADDRESS,
      signer
    );

    const tx = await gate.send(
      constants.AddressZero,
      BigNumber.from("120000000000000000"),
      97,
      signer.address,
      [],
      false,
      0,
      "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000002386f26fc100000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000014e1021cc1e78da8ed9026189e8244fbab1dd59ec50000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    );
    const receipt = await tx.wait();
  });
