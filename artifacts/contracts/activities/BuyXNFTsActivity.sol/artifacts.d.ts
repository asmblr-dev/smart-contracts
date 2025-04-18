// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import "hardhat/types/artifacts";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import { BuyXNFTs$Type } from "./BuyXNFTs";

declare module "hardhat/types/artifacts" {
  interface ArtifactsMap {
    ["BuyXNFTs"]: BuyXNFTs$Type;
    ["contracts/activities/BuyXNFTsActivity.sol:BuyXNFTs"]: BuyXNFTs$Type;
  }

  interface ContractTypesMap {
    ["BuyXNFTs"]: GetContractReturnType<BuyXNFTs$Type["abi"]>;
    ["contracts/activities/BuyXNFTsActivity.sol:BuyXNFTs"]: GetContractReturnType<BuyXNFTs$Type["abi"]>;
  }
}
