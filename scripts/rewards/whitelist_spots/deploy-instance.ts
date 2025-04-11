// scripts/whitelist_spots/deploy-instance.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Creating New Tim3cap Instance with WhitelistSpots ===");
  
  // Get signers - handle case where we might only have a deployer account on live networks
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, "deployments");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Load deployment data - use the exact filename from your deployment
  const deploymentFile = path.join(outputDir, "base-deployments.json");
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    console.error("Please run deploy-implementation.ts first");
    process.exit(1);
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const contracts = deploymentData.contracts;
  
  console.log("Loaded base deployment data:");
  console.log(`- Tim3cap Factory: ${contracts.factory}`);
  
  // Handle different possible field names for the NFT contract
  const testNFTAddress = contracts.testNFT || contracts.activityNFT;
  console.log(`- Test NFT: ${testNFTAddress}`);
  
  // Step 1: Mint test NFTs to the deployer for activity criteria
  console.log("\nMinting test NFTs to deployer...");
  const TestNFT = await ethers.getContractFactory("TestNFT");
  const testNFT = TestNFT.attach(testNFTAddress);
  
  // Check if deployer already has NFTs
  const deployerNFTBalance = await testNFT.balanceOf(deployer.address);
  if (deployerNFTBalance == 0) {
    await testNFT.safeMint(deployer.address);
    console.log("Minted test NFT to deployer");
  } else {
    console.log(`Deployer already has ${deployerNFTBalance} NFTs`);
  }
  
  // Step 2: Create Tim3cap instances for both manual and automatic modes
  console.log("\nSetting up contract factories...");
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const WhitelistSpots = await ethers.getContractFactory("WhitelistSpots");
  const factory = await ethers.getContractFactory("Tim3capFactory");
  const tim3capFactory = factory.attach(contracts.factory);
  
  // Create a set of eligible users - deployer and additional addresses
  console.log("\nSetting up eligible users...");
  
  // Generate a larger set of eligible users for testing
  const eligibleUsers = [deployer.address];
  
  // Create 20 additional random addresses for testing batch functionality
  for (let i = 0; i < 20; i++) {
    const randomAddress = ethers.Wallet.createRandom().address;
    eligibleUsers.push(randomAddress);
  }
  
  console.log(`Created ${eligibleUsers.length} eligible users`);
  console.log(`- ${eligibleUsers[0]} (deployer)`);
  console.log(`- Plus ${eligibleUsers.length - 1} random addresses`);
  
  // Use the correct implementation addresses from your deployment
  const holdXNftsImpl = contracts.holdXNftsImpl;
  
  // For WhitelistSpots, we need to check if it's directly available or needs to be deployed
  let whitelistSpotsImpl = contracts.whitelistSpotsImpl;
  
  // If WhitelistSpots implementation isn't in your deployment file, we need to deploy it
  if (!whitelistSpotsImpl) {
    console.log("WhitelistSpots implementation not found in deployment file, deploying now...");
    const WhitelistSpotsFactory = await ethers.getContractFactory("WhitelistSpots");
    const whitelistSpotsContract = await WhitelistSpotsFactory.deploy();
    await whitelistSpotsContract.waitForDeployment();
    whitelistSpotsImpl = await whitelistSpotsContract.getAddress();
    console.log(`WhitelistSpots implementation deployed to: ${whitelistSpotsImpl}`);
    
    // Register it with the registry
    const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
    const registry = Tim3capRegistry.attach(contracts.registry);
    await registry.registerReward("WHITELIST_SPOTS", whitelistSpotsImpl);
    console.log("Registered WhitelistSpots with registry");
    
    await registry.setValidCombination("HOLD_X_NFTS", "WHITELIST_SPOTS", true);
    console.log("Set combination as valid");
  }
  
  // Test both manual and automatic modes
  const createForMode = async (automatic: boolean) => {
    const mode = automatic ? "Automatic" : "Manual";
    console.log(`\n--- Creating ${mode} Distribution WhitelistSpots ---`);
    
    // Activity config
    const requiredAmount = 1; // Require 1 NFT from this collection
    const now = Math.floor(Date.now() / 1000);
    const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
      [
        [testNFTAddress],
        [requiredAmount],
        now, // start date
        now + 30 * 24 * 60 * 60, // end date (30 days)
        0, // snapshot date (none)
        0 // listing status (any)
      ]
    );
    
    // Reward config - simplified for whitelist spots
    const distributionDate = now + (automatic ? 5 * 60 : 30 * 24 * 60 * 60); // 5 minutes for automatic, 30 days for manual
    const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "bool", "uint256"],
      [
        `Test Whitelist Spots (${mode})`, // whitelist name
        automatic, // automatic distribution flag
        distributionDate // distribution date
      ]
    );
    
    // Eligibility config
    const eligibilityConfig = {
      enabled: true,
      signingKey: deployer.address,
      proofValidityDuration: 86400, // 24 hours
      requireProofForAllClaims: false // Allow on-chain eligibility check (NFT holding)
    };
    
    // Create Tim3cap instance
    console.log(`Creating Tim3cap instance for ${mode} distribution...`);
    const createTx = await tim3capFactory.createTim3cap(
      "HOLD_X_NFTS", // Activity type
      holdXNftsImpl, // Activity implementation
      activityConfig, // Activity config
      "WHITELIST_SPOTS", // Reward type
      whitelistSpotsImpl, // Reward implementation
      rewardConfig, // Reward config
      eligibilityConfig, // Eligibility config
      deployer.address, // Origin
      deployer.address, // Creator/Owner
      ethers.ZeroAddress // No affiliate
    );
    
    console.log(`Create transaction hash: ${createTx.hash}`);
    const receipt = await createTx.wait();
    
    // Find the Tim3cap address from the event
    const creationEvent = receipt?.logs.find((log: any) => {
      try {
        const parsed = tim3capFactory.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        return parsed?.name === "Tim3capDeployed";
      } catch {
        return false;
      }
    });
    
    if (!creationEvent) {
      throw new Error("Couldn't find Tim3capDeployed event in transaction receipt");
    }
    
    const parsedEvent = tim3capFactory.interface.parseLog({
      topics: creationEvent.topics,
      data: creationEvent.data
    });
    
    const tim3capAddress = parsedEvent?.args[0];
    console.log(`New Tim3cap instance deployed to: ${tim3capAddress}`);
    
    // Get contract references
    const tim3cap = Tim3cap.attach(tim3capAddress);
    const activityAddress = await tim3cap.activity();
    const rewardAddress = await tim3cap.reward();
    
    console.log(`Activity: ${activityAddress}`);
    console.log(`Reward: ${rewardAddress}`);
    
    // Return the contract addresses
    return {
      tim3cap: tim3capAddress,
      activity: activityAddress,
      reward: rewardAddress,
      automatic
    };
  };
  
  // Create both manual and automatic instances
  const manualInstance = await createForMode(false);
  const automaticInstance = await createForMode(true);
  
  // Step 3: Set eligible users for both instances
  console.log("\n=== Setting Eligible Users ===");
  
  // Get WhitelistSpots contract instances
  const manualReward = WhitelistSpots.attach(manualInstance.reward);
  const automaticReward = WhitelistSpots.attach(automaticInstance.reward);
  
  // Add eligible users in batches for manual instance
  console.log("\nAdding eligible users to manual instance...");
  // Split into batches of 10 users for demonstration
  const batchSize = 10;
  for (let i = 0; i < eligibleUsers.length; i += batchSize) {
    const batch = eligibleUsers.slice(i, i + batchSize);
    await manualReward.addEligibleBatch(batch);
    console.log(`Added batch of ${batch.length} users (${i} to ${i + batch.length - 1})`);
  }
  console.log(`Set ${eligibleUsers.length} eligible users for manual instance`);
  
  // Add eligible users in batches for automatic instance
  console.log("\nAdding eligible users to automatic instance...");
  for (let i = 0; i < eligibleUsers.length; i += batchSize) {
    const batch = eligibleUsers.slice(i, i + batchSize);
    await automaticReward.addEligibleBatch(batch);
    console.log(`Added batch of ${batch.length} users (${i} to ${i + batch.length - 1})`);
  }
  console.log(`Set ${eligibleUsers.length} eligible users for automatic instance`);
  
  // Verify eligible users count
  const manualEligibleCount = await manualReward.getEligibleCount();
  console.log(`Manual instance has ${manualEligibleCount} eligible users`);
  
  const automaticEligibleCount = await automaticReward.getEligibleCount();
  console.log(`Automatic instance has ${automaticEligibleCount} eligible users`);
  
  // Get whitelist stats
  const manualStats = await manualReward.getWhitelistStats();
  const automaticStats = await automaticReward.getWhitelistStats();
  
  console.log("\nManual Whitelist Stats:");
  console.log(`- Name: ${manualStats[0]}`);
  console.log(`- Eligible Count: ${manualStats[1]}`);
  console.log(`- Assigned Count: ${manualStats[2]}`);
  console.log(`- Claims Count: ${manualStats[3]}`);
  console.log(`- Automatic: ${manualStats[4]}`);
  console.log(`- Distribution Date: ${new Date(Number(manualStats[5]) * 1000).toLocaleString()}`);
  
  console.log("\nAutomatic Whitelist Stats:");
  console.log(`- Name: ${automaticStats[0]}`);
  console.log(`- Eligible Count: ${automaticStats[1]}`);
  console.log(`- Assigned Count: ${automaticStats[2]}`);
  console.log(`- Claims Count: ${automaticStats[3]}`);
  console.log(`- Automatic: ${automaticStats[4]}`);
  console.log(`- Distribution Date: ${new Date(Number(automaticStats[5]) * 1000).toLocaleString()}`);
  
  // Save instance data to a file
  const instanceData = {
    networkId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedBy: deployer.address,
    manualInstance: {
      tim3cap: manualInstance.tim3cap,
      activity: manualInstance.activity,
      reward: manualInstance.reward,
      distributionMode: "manual"
    },
    automaticInstance: {
      tim3cap: automaticInstance.tim3cap,
      activity: automaticInstance.activity,
      reward: automaticInstance.reward,
      distributionMode: "automatic"
    },
    eligibleUsers: eligibleUsers,
    timestamp: new Date().toISOString()
  };
  
  const instanceFile = path.join(outputDir, "wl-spots-instances.json");
  fs.writeFileSync(instanceFile, JSON.stringify(instanceData, null, 2));
  console.log(`\nInstance data saved to ${instanceFile}`);
  
  console.log("\n=== Instance Deployment Summary ===");
  console.log("Manual WhitelistSpots Instance:");
  console.log(`- Tim3cap: ${manualInstance.tim3cap}`);
  console.log(`- Activity: ${manualInstance.activity}`);
  console.log(`- Reward: ${manualInstance.reward}`);
  
  console.log("\nAutomatic WhitelistSpots Instance:");
  console.log(`- Tim3cap: ${automaticInstance.tim3cap}`);
  console.log(`- Activity: ${automaticInstance.activity}`);
  console.log(`- Reward: ${automaticInstance.reward}`);
  
  console.log(`\nNumber of Eligible Users: ${eligibleUsers.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });