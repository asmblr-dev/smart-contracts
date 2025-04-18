// This file was autogenerated by hardhat-viem, do not edit it.
// prettier-ignore
// tslint:disable
// eslint-disable

import type { Address } from "viem";
import type { GetContractReturnType } from "@nomicfoundation/hardhat-viem/types";
import "@nomicfoundation/hardhat-viem/types";

export interface Math$Type {
  "_format": "hh-sol-artifact-1",
  "contractName": "Math",
  "sourceName": "@openzeppelin/contracts/utils/math/Math.sol",
  "abi": [],
  "bytecode": "0x60808060405234601757603a9081601d823930815050f35b600080fdfe600080fdfea26469706673582212202c61f610e9c1d5dd1dbeab6d1c20fa76cb476724e8847172e46a6a98b671477564736f6c63430008140033",
  "deployedBytecode": "0x600080fdfea26469706673582212202c61f610e9c1d5dd1dbeab6d1c20fa76cb476724e8847172e46a6a98b671477564736f6c63430008140033",
  "linkReferences": {},
  "deployedLinkReferences": {}
}

declare module "@nomicfoundation/hardhat-viem/types" {
  export function deployContract(
    contractName: "Math",
    constructorArgs?: [],
    config?: DeployContractConfig
  ): Promise<GetContractReturnType<Math$Type["abi"]>>;
  export function deployContract(
    contractName: "@openzeppelin/contracts/utils/math/Math.sol:Math",
    constructorArgs?: [],
    config?: DeployContractConfig
  ): Promise<GetContractReturnType<Math$Type["abi"]>>;

  export function sendDeploymentTransaction(
    contractName: "Math",
    constructorArgs?: [],
    config?: SendDeploymentTransactionConfig
  ): Promise<{
    contract: GetContractReturnType<Math$Type["abi"]>;
    deploymentTransaction: GetTransactionReturnType;
  }>;
  export function sendDeploymentTransaction(
    contractName: "@openzeppelin/contracts/utils/math/Math.sol:Math",
    constructorArgs?: [],
    config?: SendDeploymentTransactionConfig
  ): Promise<{
    contract: GetContractReturnType<Math$Type["abi"]>;
    deploymentTransaction: GetTransactionReturnType;
  }>;

  export function getContractAt(
    contractName: "Math",
    address: Address,
    config?: GetContractAtConfig
  ): Promise<GetContractReturnType<Math$Type["abi"]>>;
  export function getContractAt(
    contractName: "@openzeppelin/contracts/utils/math/Math.sol:Math",
    address: Address,
    config?: GetContractAtConfig
  ): Promise<GetContractReturnType<Math$Type["abi"]>>;
}
