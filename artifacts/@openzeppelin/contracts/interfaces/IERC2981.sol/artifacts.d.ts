// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import "hardhat/types/artifacts";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import { IERC2981$Type } from "./IERC2981";

declare module "hardhat/types/artifacts" {
  interface ArtifactsMap {
    ["IERC2981"]: IERC2981$Type;
    ["@openzeppelin/contracts/interfaces/IERC2981.sol:IERC2981"]: IERC2981$Type;
  }

  interface ContractTypesMap {
    ["IERC2981"]: GetContractReturnType<IERC2981$Type["abi"]>;
    ["@openzeppelin/contracts/interfaces/IERC2981.sol:IERC2981"]: GetContractReturnType<IERC2981$Type["abi"]>;
  }
}
