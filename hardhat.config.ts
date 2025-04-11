import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-toolbox-viem";
import "hardhat-contract-sizer";
import dotenv from "dotenv";

dotenv.config();

// Private key from environment variable
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0b18e0fe7000ac7e967f71cd2b9479892c32fbccd5635de5cc97a8a8752d01e1";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    // Apechain mainnet configuration
    apechainMainnet: {
      url: "https://rpc.apechain.com/http",
      chainId: 33139,
      accounts: [PRIVATE_KEY],
      gasPrice: 40000000000,  // Adjust as needed (20 gwei)
      timeout: 60000  // 60 seconds
    },
    // Apechain testnet configuration
    hardhat: {
      chainId: 31337,
      gas: 30000000,
      blockGasLimit: 30000000,
      allowUnlimitedContractSize: true,
      loggingEnabled: true
    },
    apechainTestnet: {
      url: "https://curtis.rpc.caldera.xyz/http",
      accounts: [PRIVATE_KEY],
      chainId: 33111,
      gasPrice: 40000000000 // 40 gwei
    },
  },
  etherscan: {
    apiKey: {
      apechain_testnet: process.env.APESCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "apechain_testnet",
        chainId: 33111,
        urls: {
          apiURL: "https://curtis-explorer.calderachain.xyz/api",
          browserURL: "https://curtis-explorer.calderachain.xyz"
        }
      }
    ]
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: []  // optional: Array of contract names to only include
  }
};

export default config;