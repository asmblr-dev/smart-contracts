// scripts/test-hardhat-contracts.ts
// This script tests the contract behavior in a clean Hardhat environment
// to identify discrepancies between local and deployed contracts
import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Testing Contract Deployment in Local Hardhat Environment ===");
  
  // Deploy contracts from scratch to test
  console.log("\n--- Deploying Test Contracts ---");
  
  // Deploy Implementation Contracts
  console.log("Deploying implementation contracts...");
  
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const tim3capImpl = await Tim3cap.deploy();
  console.log(`Tim3cap implementation deployed to: ${tim3capImpl.target}`);
  
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const holdXNftsImpl = await HoldXNfts.deploy();
  console.log(`HoldXNfts implementation deployed to: ${holdXNftsImpl.target}`);
  
  const NFTMintReward = await ethers.getContractFactory("NFTMintReward");
  const nftMintRewardImpl = await NFTMintReward.deploy();
  console.log(`NFTMintReward implementation deployed to: ${nftMintRewardImpl.target}`);
  
  // Deploy Factory
  console.log("\nDeploying factory...");
  const Tim3capFactory = await ethers.getContractFactory("Tim3capFactory");
  const registry = ethers.ZeroAddress; // Mock registry for testing
  const [signer] = await ethers.getSigners();
  const deployerWallet = signer.address;
  const feeRecipient = signer.address;
  const feePercentage = 250; // 2.5%
  
  const factory = await Tim3capFactory.deploy(
    tim3capImpl.target,
    registry,
    deployerWallet,
    feeRecipient,
    feePercentage
  );
  
  console.log(`Tim3capFactory deployed to: ${factory.target}`);
  
  // Create a new instance using the factory
  console.log("\n--- Creating Contract Instance via Factory ---");
  
  // Prepare config for Activity (HoldXNfts)
  const activityType = "HOLD_X_NFTS";
  const nftAddress = ethers.ZeroAddress; // Mock NFT address
  const requiredAmount = 1;
  const startDate = Math.floor(Date.now() / 1000);
  const endDate = startDate + 30 * 24 * 60 * 60; // 30 days
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
  
  // Prepare config for Reward (NFTMintReward)
  const rewardType = "NFT_MINT";
  const nftName = "Test NFT";
  const nftSymbol = "TEST";
  const nftDescription = "Test NFT Description";
  const maxSupply = 100;
  const isRandomized = false;
  const royaltyRecipient = signer.address;
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
  
  // Eligibility config
  const eligibilityConfig = {
    enabled: true,
    signingKey: signer.address,
    proofValidityDuration: 3600,
    requireProofForAllClaims: false
  };
  
  // Create new Tim3cap instance
  const tx = await factory.createTim3cap(
    activityType,
    holdXNftsImpl.target,
    activityConfig,
    rewardType,
    nftMintRewardImpl.target,
    rewardConfig,
    eligibilityConfig,
    signer.address, // origin
    signer.address, // creator
    ethers.ZeroAddress // affiliate
  );
  
  const receipt = await tx.wait();
  console.log("Factory creation transaction hash:", tx.hash);
  
  // Find the Tim3cap address from the event
  const eventData = receipt?.logs.filter((log: any) => {
    try {
      const parsed = factory.interface.parseLog(log);
      return parsed?.name === "Tim3capDeployed";
    } catch {
      return false;
    }
  })[0];
  
  const parsedEvent = factory.interface.parseLog(eventData);
  const tim3capAddress = parsedEvent?.args[0];
  console.log(`New Tim3cap instance deployed to: ${tim3capAddress}`);
  
  // Connect to the new Tim3cap instance
  const tim3cap = Tim3cap.attach(tim3capAddress);
  
  // Get referenced contracts
  console.log("\n--- Checking Created Contracts ---");
  const activityAddress = await tim3cap.activity();
  const rewardAddress = await tim3cap.reward();
  console.log("Activity contract:", activityAddress);
  console.log("Reward contract:", rewardAddress);
  
  // Connect to activity and reward contracts
  const activity = HoldXNfts.attach(activityAddress);
  const reward = NFTMintReward.attach(rewardAddress);
  
  // Test basic functions
  try {
    const activityTypeResult = await activity.getActivityType();
    console.log("Activity type:", activityTypeResult);
  } catch (error: any) {
    console.log("Error getting activity type:", error.message);
  }
  
  try {
    const rewardTypeResult = await reward.getRewardType();
    console.log("Reward type:", rewardTypeResult);
  } catch (error: any) {
    console.log("Error getting reward type:", error.message);
  }
  
  // Verify controller is set correctly
  try {
    const controller = await reward.controller();
    console.log("Reward controller:", controller);
    console.log("Controller matches Tim3cap?", controller === tim3capAddress);
  } catch (error: any) {
    console.log("Error getting controller:", error.message);
  }
  
  // Test eligibility and claim
  console.log("\n--- Testing Claim Flow ---");
  
  // Create proof
  const user = signer.address;
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Sign message for eligibility
  const messageToHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "string"],
      [user, timestamp, activityType]
    )
  );
  
  const signature = await signer.signMessage(ethers.getBytes(messageToHash));
  
  // Encode eligibility proof
  const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  
  console.log("Created eligibility proof");
  
  // Test eligibility verification
  try {
    const isValid = await activity.verifyEligibilityProof(user, eligibilityProof);
    console.log("Proof verification result:", isValid);
  } catch (error: any) {
    console.log("Error verifying proof:", error.message);
  }
  
  // Test on-chain eligibility
  try {
    const isEligible = await activity.checkEligibility(user);
    console.log("On-chain eligibility check result:", isEligible);
  } catch (error: any) {
    console.log("Error checking eligibility:", error.message);
  }
  
  // Test if user can claim
  try {
    const canClaim = await reward.canClaim(user);
    console.log("Can user claim reward?", canClaim);
  } catch (error: any) {
    console.log("Error checking if user can claim:", error.message);
  }
  
  // Try to claim
  try {
    const claimTx = await tim3cap.claim(eligibilityProof, 0, []);
    console.log("Claim transaction hash:", claimTx.hash);
    const claimReceipt = await claimTx.wait();
    console.log("Claim succeeded! Gas used:", claimReceipt?.gasUsed.toString());
  } catch (error: any) {
    console.log("Claim failed:", error.message);
    
    // Try to get a more specific error
    try {
        // @ts-ignore: TypeScript doesn't know about the claim method
      await tim3cap.callStatic.claim(eligibilityProof, 0, []);
    } catch (callError: any) {
      console.log("Detailed error:", callError.message);
    }
  }
  
  // Compare the successful flow here with your deployed contracts
  console.log("\n--- Summary ---");
  console.log("If the local deployment works but your production deployment fails, the issue is likely:");
  console.log("1. Incorrect initialization parameters in production");
  console.log("2. Missing function implementations in the deployed proxies");
  console.log("3. Mismatched contract versions between local and deployed code");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });