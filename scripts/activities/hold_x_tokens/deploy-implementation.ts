// scripts/activities/hold_x_tokens/deploy-implementation.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Deploying HoldXTokens Implementation ===");
  
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
  
  // HoldXTokens implementation
  const HoldXTokens = await ethers.getContractFactory("HoldXTokens");
  const holdXTokensImpl = await HoldXTokens.deploy();
  await holdXTokensImpl.waitForDeployment();
  const holdXTokensImplAddress = await holdXTokensImpl.getAddress();
  console.log(`HoldXTokens implementation deployed to: ${holdXTokensImplAddress}`);
  
  // TokenAirdropReward implementation
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const tokenAirdropRewardImpl = await TokenAirdropReward.deploy();
  await tokenAirdropRewardImpl.waitForDeployment();
  const tokenAirdropRewardImplAddress = await tokenAirdropRewardImpl.getAddress();
  console.log(`TokenAirdropReward implementation deployed to: ${tokenAirdropRewardImplAddress}`);
  
  // Step 2: Deploy Registry
  console.log("\nDeploying Tim3capRegistry...");
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = await Tim3capRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`Tim3capRegistry deployed to: ${registryAddress}`);
  
  // Register implementations in registry
  await registry.registerActivity("HOLD_X_TOKENS", holdXTokensImplAddress);
  console.log("Registered HoldXTokens activity");
  
  await registry.registerReward("TOKEN_AIRDROP", tokenAirdropRewardImplAddress);
  console.log("Registered TokenAirdropReward reward");
  
  await registry.setValidCombination("HOLD_X_TOKENS", "TOKEN_AIRDROP", true);
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
  
  await factory.updateAuthorizedOrigin(deployer.address, true);
  console.log("Deployer authorized as origin");

  // Step 4: Deploy test tokens for activity
  console.log("\nDeploying test tokens for HoldXTokens activity...");
  
  // Activity token for HoldXTokens
  const TestToken = await ethers.getContractFactory("TestToken");
  const activityToken = await TestToken.deploy("Activity Token", "ACTT", 18);
  await activityToken.waitForDeployment();
  const activityTokenAddress = await activityToken.getAddress();
  console.log(`Activity token deployed to: ${activityTokenAddress}`);
  
  // Reward token for TokenAirdropReward
  const rewardToken = await TestToken.deploy("Reward Token", "REWT", 18);
  await rewardToken.waitForDeployment();
  const rewardTokenAddress = await rewardToken.getAddress();
  console.log(`Reward token deployed to: ${rewardTokenAddress}`);
  
  // Save deployment addresses to a file
  const deploymentData = {
    networkId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      tim3capImpl: tim3capImplAddress,
      holdXTokensImpl: holdXTokensImplAddress,
      tokenAirdropRewardImpl: tokenAirdropRewardImplAddress,
      registry: registryAddress,
      factory: factoryAddress,
      activityToken: activityTokenAddress,
      rewardToken: rewardTokenAddress
    },
    timestamp: new Date().toISOString()
  };
  
  const deploymentFile = path.join(outputDir, "base-deployments.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2));
  console.log(`\nDeployment data saved to ${deploymentFile}`);
  
  console.log("\n=== HoldXTokens Implementation Deployment Completed ===");
  console.log("Summary:");
  console.log(`- Tim3cap Implementation: ${tim3capImplAddress}`);
  console.log(`- HoldXTokens Implementation: ${holdXTokensImplAddress}`);
  console.log(`- TokenAirdropReward Implementation: ${tokenAirdropRewardImplAddress}`);
  console.log(`- Tim3cap Registry: ${registryAddress}`);
  console.log(`- Tim3cap Factory: ${factoryAddress}`);
  console.log(`- Activity Token: ${activityTokenAddress}`);
  console.log(`- Reward Token: ${rewardTokenAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });