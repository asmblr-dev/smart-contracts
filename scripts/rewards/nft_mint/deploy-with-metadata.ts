// scripts/deploy-with-metadata.ts
import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Deploying Tim3cap System with Proper Metadata ===");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

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
  
  // FIXED NFTMintReward implementation with name/symbol fix
  const NFTMintReward = await ethers.getContractFactory("NFTMintReward");
  const nftMintRewardImpl = await NFTMintReward.deploy();
  await nftMintRewardImpl.waitForDeployment();
  const nftMintRewardImplAddress = await nftMintRewardImpl.getAddress();
  console.log(`Fixed NFTMintReward implementation deployed to: ${nftMintRewardImplAddress}`);
  
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
  
  await registry.registerReward("NFT_MINT", nftMintRewardImplAddress);
  console.log("Registered fixed NFTMintReward reward");
  
  await registry.setValidCombination("HOLD_X_NFTS", "NFT_MINT", true);
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
  
  // Step 4: Create a Tim3cap instance with proper configuration
  console.log("\n=== Creating New Tim3cap Instance with Metadata ===");
  
  // NFT details for reward
  const nftName = "Rewards NFT";
  const nftSymbol = "RNFT";
  const nftDescription = "A rewards NFT with proper metadata";
  
  // Activity config - use the real NFT address
  const nftAddress = "0x8bC0D3dd9C5ba24954881106f5db641C5e9aBa00"; // Real NFT address
  const requiredAmount = 1; // Require 1 NFT from this collection
  const now = Math.floor(Date.now() / 1000);
  const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
    [
      [nftAddress],
      [requiredAmount],
      now, // start date
      now + 30 * 24 * 60 * 60, // end date (30 days)
      0, // snapshot date (none)
      0 // listing status (any)
    ]
  );
  
  // Reward config
  const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "uint256", "bool", "address", "uint96"],
    [
      nftName, // name
      nftSymbol, // symbol
      nftDescription, // description
      100, // maxSupply
      false, // isRandomized
      deployer.address, // royaltyRecipient
      500 // royaltyPercentage (5%)
    ]
  );
  
  // Eligibility config - enabled for real testing
  const eligibilityConfig = {
    enabled: true, // Enable eligibility checks to test real NFT holding
    signingKey: deployer.address,
    proofValidityDuration: 86400, // 24 hours
    requireProofForAllClaims: false // Allow on-chain eligibility check (NFT holding)
  };
  
  // Create Tim3cap instance
  console.log("Creating Tim3cap instance via factory...");
  const createTx = await factory.createTim3cap(
    "HOLD_X_NFTS", // Activity type
    holdXNftsImplAddress, // Activity implementation
    activityConfig, // Activity config
    "NFT_MINT", // Reward type
    nftMintRewardImplAddress, // Reward implementation
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
      const parsed = factory.interface.parseLog({
        topics: log.topics as string[],
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
  
  const parsedEvent = factory.interface.parseLog({
    topics: creationEvent.topics as string[],
    data: creationEvent.data
  });
  
  const tim3capAddress = parsedEvent?.args[0];
  console.log(`\n🎉 New Tim3cap instance deployed to: ${tim3capAddress}`);
  
  // Step 5: Get addresses and verify setup
  const tim3cap = Tim3cap.attach(tim3capAddress);
  const activityAddress = await tim3cap.activity();
  const rewardAddress = await tim3cap.reward();
  
  console.log("\n=== Contract Addresses ===");
  console.log(`Tim3cap: ${tim3capAddress}`);
  console.log(`Activity: ${activityAddress}`);
  console.log(`Reward: ${rewardAddress}`);
  
  // Step 6: Set up metadata and controller
  const reward = NFTMintReward.attach(rewardAddress);
  const activity = HoldXNfts.attach(activityAddress);
  
  console.log("\n=== Setting Up Activity, Reward and Metadata ===");
  
  // Set signing key in activity
  await activity.setSigningKey(deployer.address);
  await activity.setProofValidityDuration(86400); // 24 hours
  console.log("Activity signing key and proof validity set");
  
  // Set baseURI and metadata in reward
  // Example baseURI - in production you'd use your own metadata server
  const baseURI = "https://example.com/metadata/"; 
  await reward.setMetadataConfig(
    baseURI,
    nftName,
    nftSymbol,
    nftDescription,
    deployer.address, // royalty recipient
    500 // royalty percentage (5%)
  );
  console.log("Set metadata config with baseURI:", baseURI);
  
  // Check metadata values are set
  try {
    const tokenName = await reward.name();
    const tokenSymbol = await reward.symbol();
    console.log(`Token name: ${tokenName}`);
    console.log(`Token symbol: ${tokenSymbol}`);
  } catch (error: any) {
    console.log("Error getting token name/symbol:", error.message);
  }
  
  // Test claim with direct eligibility
  console.log("\n=== Testing Claim With Proper Metadata ===");
  
  // Create empty proof since direct eligibility should work
  const timestamp = Math.floor(Date.now() / 1000);
  const emptyProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    ["0x", timestamp]
  );
  
  // Try to claim
  try {
    console.log("Attempting claim with direct eligibility...");
    const claimTx = await tim3cap.claim(emptyProof, 0, [], {
      gasLimit: 3000000
    });
    console.log(`Claim transaction hash: ${claimTx.hash}`);
    
    const claimReceipt = await claimTx.wait();
    console.log(`✅ Claim successful! Gas used: ${claimReceipt?.gasUsed.toString()}`);
    
    // Check claim was recorded
    const hasClaimed = await reward.hasClaimed(deployer.address);
    console.log(`Has user claimed: ${hasClaimed}`);
    
    // Get token ID if claimed
    if (hasClaimed) {
      try {
        const userToken = await reward.userTokens(deployer.address);
        console.log(`User's token ID: ${userToken}`);
      } catch (error) {
        console.log("Could not get user token ID");
      }
    }
  } catch (error: any) {
    console.log("❌ Claim failed:", error.message);
  }
  
  console.log("\n=== Deployment Summary ===");
  console.log("Tim3cap System Deployed with Proper Metadata");
  console.log(`- Tim3cap: ${tim3capAddress}`);
  console.log(`- Activity (HoldXNfts): ${activityAddress}`);
  console.log(`- Reward (NFTMintReward): ${rewardAddress}`);
  console.log(`- Token Name: ${nftName}`);
  console.log(`- Token Symbol: ${nftSymbol}`);
  console.log(`- Base URI: ${baseURI}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });