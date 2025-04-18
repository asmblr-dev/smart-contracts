// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import "hardhat/types/artifacts";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import { BaseActivity$Type } from "./BaseActivity";

declare module "hardhat/types/artifacts" {
  interface ArtifactsMap {
    ["BaseActivity"]: BaseActivity$Type;
    ["contracts/BaseActivity.sol:BaseActivity"]: BaseActivity$Type;
  }

  interface ContractTypesMap {
    ["BaseActivity"]: GetContractReturnType<BaseActivity$Type["abi"]>;
    ["contracts/BaseActivity.sol:BaseActivity"]: GetContractReturnType<BaseActivity$Type["abi"]>;
  }
}
