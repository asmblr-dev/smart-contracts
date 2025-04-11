// scripts/deploy-prod-like.ts

import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Deploying Production-Like Tim3cap Instance ===\n");

  const [signer] = await ethers.getSigners();
  const deployer = signer.address;
  console.log("Deployer address:", deployer);

  const FACTORY_ADDRESS = "0x3192aA8c87Ba3E7D1ecb173382107E371bc6a116";
  const REGISTRY_ADDRESS = "0x6EF11c51624c0C786dC8F34cd4A92e75059B028b";

  const factory = await ethers.getContractAt("Tim3capFactory", FACTORY_ADDRESS);

  const now = Math.floor(Date.now() / 1000);
  const startDate = now - 3600;
  const endDate = now + 86400;

  const mockNftContract = "0x0000000000000000000000000000000000000001";

  const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
    [
      [mockNftContract],
      [1],
      startDate,
      endDate,
      0,
      0
    ]
  );

  const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "uint256", "bool", "address", "uint96"],
    [
      "DebugNFT",
      "DBG",
      "Debug NFT Collection",
      100,
      false,
      deployer,
      250
    ]
  );

  const eligibilityConfig = {
    enabled: true,
    signingKey: deployer,
    proofValidityDuration: 3600,
    requireProofForAllClaims: false
  };

  const tx = await factory.createTim3cap(
    "HOLD_X_NFTS",
    ethers.ZeroAddress,
    activityConfig,
    "NFT_MINT",
    ethers.ZeroAddress,
    rewardConfig,
    eligibilityConfig,
    deployer,
    deployer,
    ethers.ZeroAddress
  );

  console.log("Sent createTim3cap tx:", tx.hash);
  const receipt = await tx.wait();

  // Use factory interface for robust parsing
  const factoryIface = factory.interface;

  const event = receipt.logs
    .map((log: any) => {
      try {
        return factoryIface.parseLog(log);
      } catch (_) {
        return null;
      }
    })
    .find((e: any) => e && e.name === "Tim3capDeployed");

  if (!event) {
    console.warn("❌ Tim3capDeployed event not found. Scanning all logs for debug:");
    for (const log of receipt.logs) {
      try {
        const parsed = factoryIface.parseLog(log);
        console.log(`Found: ${parsed?.name}`, parsed?.args);
      } catch (_) {
        // skip
      }
    }
    throw new Error("Tim3capDeployed event not found in transaction logs");
  }
  console.log("Tim3capDeployed event args:", event.args);

  const tim3cap = event.args[0]; // positional: address tim3cap
  console.log("\n✅ Tim3cap deployed at:", tim3cap);

  const tim3capInstance = await ethers.getContractAt("Tim3cap", tim3cap);
  const state = await tim3capInstance.debugState();

  console.log("Activity:", state.activityAddr);
  console.log("Reward:", state.rewardAddr);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });