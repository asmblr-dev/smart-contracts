// scripts/test-claim.ts

import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
  console.log("\n=== Testing Claim Flow via Tim3cap ===");

  const [signer] = await ethers.getSigners();
  const user = signer.address;
  console.log("User address:", user);

  // Replace with your deployed Tim3cap contract address
  const TIM3CAP_ADDRESS = "0x58bb45d627299728BE605FAe21ee300010C89Aa4";

  // Connect to main contracts
  console.log("\nConnecting to Tim3cap contract...");
  const tim3cap: Contract = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);

  // Get referenced contracts
  const activityAddress = await tim3cap.activity();
  const rewardAddress = await tim3cap.reward();
  console.log("Activity contract:", activityAddress);
  console.log("Reward contract:", rewardAddress);

  // Connect to activity and reward contracts
  const activity: Contract = await ethers.getContractAt("HoldXNfts", activityAddress);
  const reward: Contract = await ethers.getContractAt("NFTMintReward", rewardAddress);

  // Debugging contract state - using safer approach
  console.log("\n=== Current Contract State ===");
  
  try {
    const tim3capState = await tim3cap.debugState();
    console.log("Tim3cap state:", {
      isInitialized: tim3capState[0],
      activityAddr: tim3capState[1],
      rewardAddr: tim3capState[2],
      isPaused: tim3capState[3],
      eligibilityEnabled: tim3capState[4],
      eligibilitySigningKey: tim3capState[5],
      proofValidity: tim3capState[6].toString()
    });

    // Check if eligibility service is enabled
    const eligibilityEnabled = tim3capState[4];
    console.log("Eligibility service enabled:", eligibilityEnabled);
  } catch (error: any) {
    console.log("Could not get Tim3cap debug state:", error.message);
    
    // Alternative approach
    const isPaused = await tim3cap.paused();
    console.log("Is Tim3cap paused:", isPaused);
    
    const eligibilityConfig = await tim3cap.eligibilityConfig();
    console.log("Eligibility config:", eligibilityConfig);
  }

  // Safely get the signing key if possible
  let signingKey;
  try {
    // Try to get the signing key from the activity contract directly
    signingKey = await activity.signingKey();
    console.log("Signing key from activity:", signingKey);
  } catch (error: any) {
    console.log("Could not get signing key directly, using alternative approach");
    signingKey = user; // Fallback to the current user as the signing key
    console.log("Using current user as signing key:", signingKey);
  }

  // Check reward status safely
  try {
    const canClaimReward = await reward.canClaim(user);
    console.log("Can user claim reward?", canClaimReward);
  } catch (error: any) {
    console.log("Could not check if user can claim reward:", error.message);
  }

  // Try to get reward state
  try {
    const isActive = await reward.active();
    const claimStartDate = await reward.claimStartDate();
    const claimFinishDate = await reward.claimFinishDate();
    const hasClaimed = await reward.hasClaimed(user);
    
    console.log("Reward basic state:", {
      isActive,
      claimStartDate: claimStartDate.toString(),
      claimFinishDate: claimFinishDate.toString(),
      hasClaimed
    });
  } catch (error: any) {
    console.log("Could not get basic reward state:", error.message);
  }

  // Check controller relationship
  try {
    const controller = await reward.controller();
    console.log("Reward controller address:", controller);
    console.log("Controller matches Tim3cap?", controller.toLowerCase() === TIM3CAP_ADDRESS.toLowerCase());
  } catch (error: any) {
    console.log("Could not get controller address:", error.message);
  }

  // Check direct eligibility from activity
  try {
    const directEligibility = await activity.checkEligibility(user);
    console.log("Direct eligibility check result:", directEligibility);
  } catch (error: any) {
    console.log("Could not check direct eligibility:", error.message);
  }

  // === CREATE ELIGIBILITY PROOF ===
  console.log("\n=== Creating Eligibility Proof ===");

  // Use the current signer as the signing key for tests
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  
  if (!PRIVATE_KEY) {
    console.error("❌ PRIVATE_KEY not found in environment variables");
    return;
  }
  
  // Try to get activity type
  let activityType = "HOLD_X_NFTS"; // Default value
  try {
    activityType = await activity.getActivityType();
    console.log("Activity type:", activityType);
  } catch (error: any) {
    console.log("Could not get activity type, using default:", activityType);
  }

  // Prepare proof components
  const timestamp = Math.floor(Date.now() / 1000);
  console.log("Timestamp for proof:", timestamp);

  // Create the message hash that will be signed
  // This must match the logic in your verifyEligibilityProof function
  const messageToHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "string"],
      [user, timestamp, activityType]
    )
  );
  
  // Create the Ethereum signed message
  const messageHashBytes = ethers.toUtf8Bytes("\x19Ethereum Signed Message:\n32");
  const ethSignedMessageHash = ethers.keccak256(
    ethers.concat([messageHashBytes, messageToHash])
  );
  
  console.log("Message hash:", ethSignedMessageHash);

  // Sign the message using the private key
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signature = await wallet.signMessage(ethers.getBytes(messageToHash));
  console.log("Signer address:", wallet.address);
  console.log("Signature:", signature);

  // Encode the proof as expected by the contract
  const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  
  console.log("Encoded eligibility proof:", eligibilityProof);

  // Verify the proof manually
  try {
    const proofVerified = await activity.verifyEligibilityProof(user, eligibilityProof);
    console.log("Proof verification result:", proofVerified);
    
    if (!proofVerified) {
      console.log("❌ Proof verification failed. Check signing key and message format.");
    }
  } catch (error: any) {
    console.error("Error verifying proof:", error.message);
  }

  // No discount in this test
  const discountRate = 0;
  const discountProof: string[] = []; // Empty array for no discount

  console.log("\n=== Calling claim with correctly formatted proof ===");
  try {
    // Call claim with the proper parameters
    // @ts-ignore: TypeScript doesn't know about the claim method
    const tx = await tim3cap.claim(eligibilityProof, discountRate, discountProof);
    console.log("Transaction hash:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("✅ Claim succeeded! Gas used:", receipt.gasUsed.toString());
  } catch (err: any) {
    console.error("❌ Claim failed.");

    try {
      // Try to get more specific error with static call
      // @ts-ignore: TypeScript doesn't know about the claim method
      await tim3cap.callStatic.claim(eligibilityProof, discountRate, discountProof);
    } catch (staticErr: any) {
      console.error("Revert reason (static call):", staticErr.reason || staticErr.message);
    }

    console.error("Error message:", err.message);
    
    // Try to debug specific aspects of the flow
    console.log("\n=== Debug Steps ===");
    
    // Check if Tim3cap contract is paused
    try {
      const isPaused = await tim3cap.paused();
      console.log("Is Tim3cap paused?", isPaused);
    } catch (error: any) {
      console.log("Could not check if Tim3cap is paused:", error.message);
    }
    
    // Check if reward contract is active
    try {
      const isRewardActive = await reward.isClaimPeriodActive();
      console.log("Is reward period active?", isRewardActive);
    } catch (error: any) {
      console.log("Could not check if reward period is active:", error.message);
    }
    
    // Check if user has already claimed
    try {
      const hasUserClaimed = await reward.hasClaimed(user);
      console.log("Has user already claimed?", hasUserClaimed);
    } catch (error: any) {
      console.log("Could not check if user has claimed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Script error:", err);
    process.exit(1);
  });