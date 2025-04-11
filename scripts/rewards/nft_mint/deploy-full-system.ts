// scripts/deploy-full-system.ts
import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
  console.log("\n=== Deploying Tim3cap Ecosystem ===");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // Step 1: Deploy implementation contracts first
  console.log("🚀 Deploying implementation contracts");
  
  // 1.1: Deploy Tim3cap implementation
  console.log("\n--- Deploying Tim3cap implementation ---");
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const tim3capImpl = await Tim3cap.deploy();
  await tim3capImpl.waitForDeployment();
  const tim3capImplAddress = await tim3capImpl.getAddress();
  console.log(`Tim3cap implementation deployed to: ${tim3capImplAddress}`);

  // 1.2: Deploy HoldXNfts implementation
  console.log("\n--- Deploying HoldXNfts implementation ---");
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const holdXNftsImpl = await HoldXNfts.deploy();
  await holdXNftsImpl.waitForDeployment();
  const holdXNftsImplAddress = await holdXNftsImpl.getAddress();
  console.log(`HoldXNfts implementation deployed to: ${holdXNftsImplAddress}`);

  // 1.3: Deploy NFTMintReward implementation
  console.log("\n--- Deploying NFTMintReward implementation ---");
  const NFTMintReward = await ethers.getContractFactory("NFTMintReward");
  const nftMintRewardImpl = await NFTMintReward.deploy();
  await nftMintRewardImpl.waitForDeployment();
  const nftMintRewardImplAddress = await nftMintRewardImpl.getAddress();
  console.log(`NFTMintReward implementation deployed to: ${nftMintRewardImplAddress}`);

  // Step 2: Deploy Registry
  console.log("\n--- Deploying Tim3capRegistry ---");
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = await Tim3capRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`Tim3capRegistry deployed to: ${registryAddress}`);

  // Step 3: Register implementations in registry
  console.log("\n--- Registering implementations in registry ---");
  await registry.registerActivity("HOLD_X_NFTS", holdXNftsImplAddress);
  console.log("Registered HoldXNfts activity");
  
  await registry.registerReward("NFT_MINT", nftMintRewardImplAddress);
  console.log("Registered NFTMintReward reward");
  
  await registry.setValidCombination("HOLD_X_NFTS", "NFT_MINT", true);
  console.log("Set HOLD_X_NFTS + NFT_MINT as valid combination");

  // Step 4: Deploy Factory
  console.log("\n--- Deploying Tim3capFactory ---");
  const Tim3capFactory = await ethers.getContractFactory("Tim3capFactory");
  
  // Factory constructor parameters
  const deployerWallet = deployer.address;
  const feeRecipient = deployer.address;
  const feePercentage = 250; // 2.5%
  
  const factory = await Tim3capFactory.deploy(
    tim3capImplAddress,
    registryAddress,
    deployerWallet,
    feeRecipient,
    feePercentage
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`Tim3capFactory deployed to: ${factoryAddress}`);

  // Step 5: Authorize factory in registry (if needed based on your implementation)
  // Ensure the factory is an authorized origin
  console.log("\n--- Authorizing factory in system ---");
  await factory.updateAuthorizedOrigin(factoryAddress, true);
  console.log(`Authorized factory ${factoryAddress} as origin`);

  // Step 6: Create a test Tim3cap instance
  console.log("\n=== Creating Test Tim3cap Instance ===");
  
  // 6.1: Prepare Activity config
  const nftAddress = "0x0000000000000000000000000000000000000000"; // Example NFT address
  const requiredAmount = 1;
  const now = Math.floor(Date.now() / 1000);
  const startDate = now;
  const endDate = now + 30 * 24 * 60 * 60; // 30 days from now
  const snapshotDate = 0; // No snapshot
  const listingStatus = 0; // Any
  
  const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
    [
      [nftAddress],
      [requiredAmount],
      startDate,
      endDate,
      snapshotDate,
      listingStatus
    ]
  );
  
  console.log("Prepared HoldXNfts activity config");
  
  // 6.2: Prepare Reward config
  const nftName = "Test NFT";
  const nftSymbol = "TEST";
  const nftDescription = "Test NFT for Tim3cap system";
  const maxSupply = 100;
  const isRandomized = false;
  const royaltyRecipient = deployer.address;
  const royaltyPercentage = 500; // 5%
  
  const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "uint256", "bool", "address", "uint96"],
    [
      nftName,
      nftSymbol,
      nftDescription,
      maxSupply,
      isRandomized,
      royaltyRecipient,
      royaltyPercentage
    ]
  );
  
  console.log("Prepared NFTMintReward config");
  
  // 6.3: Prepare Tim3cap eligibility config
  const eligibilityConfig = {
    enabled: true,
    signingKey: deployer.address,
    proofValidityDuration: 3600, // 1 hour
    requireProofForAllClaims: false
  };
  
  // 6.4: Create Tim3cap instance via factory
  console.log("\n--- Creating Tim3cap instance via factory ---");
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
  console.log("Transaction confirmed");
  
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
  
  // Step 7: Verify the deployment was successful
  const tim3cap = Tim3cap.attach(tim3capAddress) as Contract;
  
  // Get Activity and Reward addresses
  const activityAddress = await tim3cap.activity();
  const rewardAddress = await tim3cap.reward();
  
  console.log("\n--- Deployment Results ---");
  console.log(`Tim3cap address: ${tim3capAddress}`);
  console.log(`Activity address: ${activityAddress}`);
  console.log(`Reward address: ${rewardAddress}`);
  
  // Verify Tim3cap is correctly initialized
  const owner = await tim3cap.owner();
  const isPaused = await tim3cap.paused();
  
  console.log("\n--- Tim3cap State ---");
  console.log(`Owner: ${owner}`);
  console.log(`Is paused: ${isPaused}`);
  
  // Get Activity contract and check its state
  const activity = HoldXNfts.attach(activityAddress) as Contract;
  
  try {
    const activityType = await activity.getActivityType();
    console.log("\n--- Activity State ---");
    console.log(`Activity type: ${activityType}`);
    
    const activityOwner = await activity.owner();
    console.log(`Activity owner: ${activityOwner}`);
    
    const contractAddresses = await activity.contractAddresses(0);
    console.log(`Target NFT contract: ${contractAddresses}`);
    
    const signingKey = await activity.signingKey();
    console.log(`Signing key: ${signingKey}`);
  } catch (error: any) {
    console.log("❌ Could not verify Activity state:", error.message);
  }
  
  // Get Reward contract and check its state
  const reward = NFTMintReward.attach(rewardAddress) as Contract;
  
  try {
    const rewardType = await reward.getRewardType();
    console.log("\n--- Reward State ---");
    console.log(`Reward type: ${rewardType}`);
    
    const rewardOwner = await reward.owner();
    console.log(`Reward owner: ${rewardOwner}`);
    
    const isActive = await reward.active();
    console.log(`Is active: ${isActive}`);
    
    const controller = await reward.controller();
    console.log(`Controller: ${controller}`);
    console.log(`Controller matches Tim3cap: ${controller.toLowerCase() === tim3capAddress.toLowerCase()}`);
  } catch (error: any) {
    console.log("❌ Could not verify Reward state:", error.message);
  }
  
  // Step 8: Verify a user can check eligibility and claim
  console.log("\n=== Testing Claim Flow ===");
  
  try {
    // Create an eligibility proof
    const user = deployer.address;
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Get activity type directly 
    const activityTypeStr = await activity.getActivityType();
    console.log(`Using activity type: ${activityTypeStr}`);
    
    // Create message hash for signing
    const messageToHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "string"],
        [user, timestamp, activityTypeStr]
      )
    );
    
    // Sign the message
    const signature = await deployer.signMessage(ethers.getBytes(messageToHash));
    console.log("Created signature");
    
    // Encode the proof
    const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "uint256"],
      [signature, timestamp]
    );
    
    // Verify the proof directly
    const proofVerified = await activity.verifyEligibilityProof(user, eligibilityProof);
    console.log(`Proof verification result: ${proofVerified}`);
    
    // Check eligibility
    const isEligible = await activity.isEligible(user);
    console.log(`User is eligible: ${isEligible}`);
    
    // Check if user can claim
    const canClaim = await reward.canClaim(user);
    console.log(`User can claim: ${canClaim}`);
    
    // Try to claim
    console.log("\nAttempting to claim reward...");
    const claimTx = await tim3cap.claim(eligibilityProof, 0, []);
    console.log(`Claim transaction hash: ${claimTx.hash}`);
    
    const claimReceipt = await claimTx.wait();
    console.log(`✅ Claim succeeded! Gas used: ${claimReceipt?.gasUsed.toString()}`);
    
    // Verify the claim was successful
    const hasClaimed = await reward.hasClaimed(user);
    console.log(`User has claimed: ${hasClaimed}`);
    
    const totalClaims = await reward.totalClaims();
    console.log(`Total claims: ${totalClaims.toString()}`);
  } catch (error: any) {
    console.log("❌ Claim test failed:", error.message);
  }
  
  console.log("\n=== Deployment Summary ===");
  console.log("Tim3cap Implementation:", tim3capImplAddress);
  console.log("HoldXNfts Implementation:", holdXNftsImplAddress);
  console.log("NFTMintReward Implementation:", nftMintRewardImplAddress);
  console.log("Tim3cap Registry:", registryAddress);
  console.log("Tim3cap Factory:", factoryAddress);
  console.log("Test Tim3cap Instance:", tim3capAddress);
  console.log("Test Activity Instance:", activityAddress);
  console.log("Test Reward Instance:", rewardAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });