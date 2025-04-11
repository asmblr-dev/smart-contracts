// scripts/nft_airdrop/deploy-implementation.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Deploying Tim3cap System Base Implementations for NFT Airdrop ===");
  
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
  
  // NFTAirdropReward implementation
  const NFTAirdropReward = await ethers.getContractFactory("NFTAirdropReward");
  const nftAirdropRewardImpl = await NFTAirdropReward.deploy();
  await nftAirdropRewardImpl.waitForDeployment();
  const nftAirdropRewardImplAddress = await nftAirdropRewardImpl.getAddress();
  console.log(`NFTAirdropReward implementation deployed to: ${nftAirdropRewardImplAddress}`);
  
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
  
  await registry.registerReward("NFT_AIRDROP", nftAirdropRewardImplAddress);
  console.log("Registered NFTAirdropReward reward");
  
  await registry.setValidCombination("HOLD_X_NFTS", "NFT_AIRDROP", true);
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

  // Step 5: Deploy a test NFT for the airdrop (rewards)
  let airdropNFTAddress;
  try {
    console.log("\nDeploying test NFT for airdrop rewards...");
    const TestNFT = await ethers.getContractFactory("TestNFT");
    const airdropNFT = await TestNFT.deploy("Airdrop Reward NFT", "ARNFT");
    await airdropNFT.waitForDeployment();
    airdropNFTAddress = await airdropNFT.getAddress();
    console.log(`Airdrop reward NFT deployed to: ${airdropNFTAddress}`);
  } catch (error: any) {
    console.log("Warning: Could not deploy TestNFT contract for airdrop. Using a placeholder address.");
    airdropNFTAddress = ethers.ZeroAddress;
  }
  
  // Save deployment addresses to a file
  const deploymentData = {
    networkId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      tim3capImpl: tim3capImplAddress,
      holdXNftsImpl: holdXNftsImplAddress,
      nftAirdropRewardImpl: nftAirdropRewardImplAddress,
      registry: registryAddress,
      factory: factoryAddress,
      activityNFT: activityNFTAddress,
      airdropNFT: airdropNFTAddress
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
  console.log(`- NFTAirdropReward Implementation: ${nftAirdropRewardImplAddress}`);
  console.log(`- Tim3cap Registry: ${registryAddress}`);
  console.log(`- Tim3cap Factory: ${factoryAddress}`);
  console.log(`- Activity NFT: ${activityNFTAddress}`);
  console.log(`- Airdrop NFT: ${airdropNFTAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });