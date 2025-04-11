// scripts/token_raffle/deploy-implementation.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Deploying Tim3cap System Base Implementations ===");
  
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
  
  // TokenRaffleReward implementation
  const TokenRaffleReward = await ethers.getContractFactory("TokenRaffleReward");
  const tokenRaffleRewardImpl = await TokenRaffleReward.deploy();
  await tokenRaffleRewardImpl.waitForDeployment();
  const tokenRaffleRewardImplAddress = await tokenRaffleRewardImpl.getAddress();
  console.log(`TokenRaffleReward implementation deployed to: ${tokenRaffleRewardImplAddress}`);
  
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
  
  await registry.registerReward("TOKEN_RAFFLE", tokenRaffleRewardImplAddress);
  console.log("Registered TokenRaffleReward reward");
  
  await registry.setValidCombination("HOLD_X_NFTS", "TOKEN_RAFFLE", true);
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

  // Step 4: Deploy a test NFT for the activity
  console.log("\nDeploying test NFT for activity...");
  const TestNFT = await ethers.getContractFactory("TestNFT");
  const testNFT = await TestNFT.deploy("Test NFT", "TNFT");
  await testNFT.waitForDeployment();
  const testNFTAddress = await testNFT.getAddress();
  console.log(`Test NFT deployed to: ${testNFTAddress}`);

  // Step 5: Deploy a test ERC20 token for the raffle
  console.log("\nDeploying test ERC20 token...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const testToken = await TestToken.deploy("Test Token", "TEST", 18);
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  console.log(`Test token deployed to: ${testTokenAddress}`);
  
  // Save deployment addresses to a file
  const deploymentData = {
    networkId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      tim3capImpl: tim3capImplAddress,
      holdXNftsImpl: holdXNftsImplAddress,
      tokenRaffleRewardImpl: tokenRaffleRewardImplAddress,
      registry: registryAddress,
      factory: factoryAddress,
      testNFT: testNFTAddress,
      testToken: testTokenAddress
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
  console.log(`- TokenRaffleReward Implementation: ${tokenRaffleRewardImplAddress}`);
  console.log(`- Tim3cap Registry: ${registryAddress}`);
  console.log(`- Tim3cap Factory: ${factoryAddress}`);
  console.log(`- Test NFT: ${testNFTAddress}`);
  console.log(`- Test Token: ${testTokenAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });