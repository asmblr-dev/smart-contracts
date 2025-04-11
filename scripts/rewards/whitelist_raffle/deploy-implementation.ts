// scripts/whitelist_raffle/deploy-implementation.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Deploying Tim3cap System Base Implementations for Whitelist Raffle ===");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, "deployments");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: Deploy implementation contracts
  console.log("Deploying implementation contracts...");
  
  // Tim3cap implementation
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const tim3capImpl = await Tim3cap.deploy();
  await tim3capImpl.waitForDeployment();
  const tim3capImplAddress = await tim3capImpl.getAddress();
  console.log(`Tim3cap implementation deployed to: ${tim3capImplAddress}`);
  
  // HoldXNfts implementation
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const holdXNftsImpl = await HoldXNfts.deploy();
  await holdXNftsImpl.waitForDeployment();
  const holdXNftsImplAddress = await holdXNftsImpl.getAddress();
  console.log(`HoldXNfts implementation deployed to: ${holdXNftsImplAddress}`);
  
  // WhitelistRaffleReward implementation
  const WhitelistRaffleReward = await ethers.getContractFactory("WhitelistRaffleReward");
  const whitelistRaffleRewardImpl = await WhitelistRaffleReward.deploy();
  await whitelistRaffleRewardImpl.waitForDeployment();
  const whitelistRaffleRewardImplAddress = await whitelistRaffleRewardImpl.getAddress();
  console.log(`WhitelistRaffleReward implementation deployed to: ${whitelistRaffleRewardImplAddress}`);
  
  // Step 2: Deploy Registry
  console.log("\nDeploying Tim3capRegistry...");
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = await Tim3capRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`Tim3capRegistry deployed to: ${registryAddress}`);
  
  // Register implementations in registry
  await registry.registerActivity("HOLD_X_NFTS", holdXNftsImplAddress);
  console.log("Registered HoldXNfts activity");
  
  await registry.registerReward("WHITELIST_RAFFLE", whitelistRaffleRewardImplAddress);
  console.log("Registered WhitelistRaffleReward reward");
  
  await registry.setValidCombination("HOLD_X_NFTS", "WHITELIST_RAFFLE", true);
  console.log("Set combination as valid");
  
  // Step 3: Deploy Factory
  console.log("\nDeploying Tim3capFactory...");
  const Tim3capFactory = await ethers.getContractFactory("Tim3capFactory");
  const factory = await Tim3capFactory.deploy(
    tim3capImplAddress,
    registryAddress,
    deployer.address, // deployer wallet
    deployer.address, // fee recipient
    250 // 2.5% fee
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`Tim3capFactory deployed to: ${factoryAddress}`);
  
  await factory.updateAuthorizedOrigin(factoryAddress, true);
  console.log("Factory authorized as origin");

  // Step 4: Deploy a test NFT for the activity (eligibility)
  let activityNFTAddress;
  try {
    console.log("\nDeploying test NFT for activity criteria...");
    const TestNFT = await ethers.getContractFactory("TestNFT");
    const activityNFT = await TestNFT.deploy("Activity Test NFT", "ATNFT");
    await activityNFT.waitForDeployment();
    activityNFTAddress = await activityNFT.getAddress();
    console.log(`Activity test NFT deployed to: ${activityNFTAddress}`);
  } catch (error: any) {
    console.log("Warning: Could not deploy TestNFT contract for activity. Using a placeholder address.");
    activityNFTAddress = ethers.ZeroAddress;
  }
  
  // Save deployment addresses to a file
  const deploymentData = {
    networkId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      tim3capImpl: tim3capImplAddress,
      holdXNftsImpl: holdXNftsImplAddress,
      whitelistRaffleRewardImpl: whitelistRaffleRewardImplAddress,
      registry: registryAddress,
      factory: factoryAddress,
      activityNFT: activityNFTAddress
    },
    timestamp: new Date().toISOString()
  };
  
  const deploymentFile = path.join(outputDir, "base-deployments.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
  console.log(`\nDeployment data saved to ${deploymentFile}`);
  
  console.log("\n=== Base Implementation Deployment Completed ===");
  console.log("Summary:");
  console.log(`- Tim3cap Implementation: ${tim3capImplAddress}`);
  console.log(`- HoldXNfts Implementation: ${holdXNftsImplAddress}`);
  console.log(`- WhitelistRaffleReward Implementation: ${whitelistRaffleRewardImplAddress}`);
  console.log(`- Tim3cap Registry: ${registryAddress}`);
  console.log(`- Tim3cap Factory: ${factoryAddress}`);
  console.log(`- Activity NFT: ${activityNFTAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });