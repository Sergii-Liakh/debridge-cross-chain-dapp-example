import "@debridge-finance/hardhat-debridge";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";

import "./src/tasks/deployment";
import "./src/tasks/deployment-token";

const accounts = process.env.PRIVATE_KEY ? [`${process.env.PRIVATE_KEY}`] : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    matic: {
      url: "https://rpc-mumbai.maticvigil.com/",
      accounts: accounts,
      timeout: 60000,
    },
    arbitrum: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts: accounts,
      timeout: 60000,
    },
    binance: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: accounts,
      timeout: 60000,
    },
    polygon: {
      url: "https://polygon-rpc.com",
      accounts: accounts,
      timeout: 60000,
    },
    opera: {
      url: "https://rpc.ftm.tools/",
      accounts: accounts,
      timeout: 60000,
    }
  },
  etherscan: {
    apiKey: {
      polygon: `${process.env.ETHERSCAN_POLYGON_API_KEY}`,
      arbitrumOne: `${process.env.ETHERSCAN_ARBITRUMONE_API_KEY}`,
      bsc: `${process.env.ETHERSCAN_BSC_API_KEY}`,
      avalanche: `${process.env.ETHERSCAN_AVAX_API_KEY}`,
      opera: `${process.env.ETHERSCAN_OPERA_API_KEY}`
    },
  },
};

export default config;
