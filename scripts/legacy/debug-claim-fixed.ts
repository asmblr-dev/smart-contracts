// scripts/debug-claim-fixed.ts
import { ethers } from "hardhat";

// Use the addresses we identified earlier
const TIM3CAP_ADDRESS = "0xfAA32bC63d18B6657564f3d88B3cdb926e8eC678";
const ACTIVITY_ADDRESS = "0x38f6D3AAE8FB2adFF3B97d601544B826d09e39a5";
const REWARD_ADDRESS = "0x9fB4bF9d1cb7e8edD7a9Ff15E7cA6e7BD2fA0356";

async function main() {
  console.log("Starting debug claim process...");
  
  // Get signer
  const [signer] = await ethers.getSigners();
  const userAddress = await signer.getAddress();
  console.log("User address:", userAddress);
  
  // Connect to contracts directly
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  const reward = await ethers.getContractAt("NFTMintReward", REWARD_ADDRESS);
  
  // Check state of contracts
  console.log("\n==== Checking Tim3cap State ====");
  const tim3capState = await tim3cap.debugState();
  console.log("Tim3cap initialized:", tim3capState.isInitialized);
  console.log("Activity address:", tim3capState.activityAddr);
  console.log("Reward address:", tim3capState.rewardAddr);
  console.log("Is paused:", tim3capState.isPaused);
  console.log("Eligibility enabled:", tim3capState.eligibilityEnabled);
  console.log("Eligibility signing key:", tim3capState.eligibilitySigningKey);
  console.log("Proof validity duration:", tim3capState.proofValidity);
  
  // Check if addresses match expected values
  if (tim3capState.activityAddr.toLowerCase() !== ACTIVITY_ADDRESS.toLowerCase()) {
    console.warn("⚠️ Activity address mismatch!");
    console.log("  Expected:", ACTIVITY_ADDRESS);
    console.log("  Actual:", tim3capState.activityAddr);
  }
  
  if (tim3capState.rewardAddr.toLowerCase() !== REWARD_ADDRESS.toLowerCase()) {
    console.warn("⚠️ Reward address mismatch!");
    console.log("  Expected:", REWARD_ADDRESS);
    console.log("  Actual:", tim3capState.rewardAddr);
  }
  
  console.log("\n==== Checking NFTMintReward State ====");
  const rewardState = await reward.debugState(userAddress);
  console.log("Reward initialized:", rewardState.isInitialized);
  console.log("Is active:", rewardState.isActive);
  console.log("Total claims:", rewardState.totalClaimsCount.toString());
  console.log("Claim start date:", new Date(Number(rewardState.claimStart) * 1000).toISOString());
  console.log("Claim end date:", rewardState.claimEnd > 0 ? new Date(Number(rewardState.claimEnd) * 1000).toISOString() : "No end date");
  console.log("Has user claimed:", rewardState.userHasClaimed);
  console.log("Controller address:", rewardState.controllerAddr);
  console.log("Owner address:", rewardState.ownerAddr);
  console.log("Is randomized:", rewardState.isRandomized);
  console.log("Available supply:", rewardState.availableSupply.toString());
  console.log("Max supply:", rewardState.maxSupply.toString());
  console.log("Next token ID:", rewardState.nextId.toString());
  
  // ⭐ Critical check: Verify controller is set to Tim3cap address
  if (rewardState.controllerAddr.toLowerCase() !== TIM3CAP_ADDRESS.toLowerCase()) {
    console.warn("⚠️ Controller address mismatch in NFTMintReward!");
    console.log("  Expected:", TIM3CAP_ADDRESS);
    console.log("  Actual:", rewardState.controllerAddr);
    console.log("  This will cause claim to fail due to 'Not authorized' check");
  }
  
  console.log("\n==== Checking Activity State ====");
  const activityState = await activity.debugActivityState();
  console.log("NFT Contracts:", activityState.nftContracts);
  console.log("Start date:", new Date(Number(activityState.activityStartDate) * 1000).toISOString());
  console.log("End date:", activityState.activityEndDate > 0 ? new Date(Number(activityState.activityEndDate) * 1000).toISOString() : "No end date");
  console.log("Snapshot date:", activityState.activitySnapshotDate > 0 ? new Date(Number(activityState.activitySnapshotDate) * 1000).toISOString() : "No snapshot");
  console.log("Listing status:", activityState.activityListingStatus);
  console.log("Signing key:", activityState.activitySigningKey);
  console.log("Proof duration:", activityState.proofDuration.toString());
  
  // ⭐ Critical check: Verify signing key is set
  if (activityState.activitySigningKey === ethers.ZeroAddress) {
    console.warn("⚠️ Signing key not set in Activity contract!");
    console.log("  This will cause eligibility proof verification to fail");
  }

  console.log("\n==== Checking Eligibility ====");
  console.log("Direct eligibility check:", await activity.checkEligibility(userAddress));
  console.log("Can claim check:", await reward.canClaim(userAddress));
  
  // Create a proper eligibility proof
  console.log("\n==== Creating Eligibility Proof ====");
  const timestamp = Math.floor(Date.now() / 1000);
  console.log("Proof timestamp:", timestamp);
  
  const activityType = await activity.getActivityType();
  console.log("Activity type:", activityType);
  
  // Get the signing key from the activity contract
  const signingKey = activityState.activitySigningKey;
  console.log("Signing key for proof:", signingKey);
  
  // Create message hash as per the contract's verification logic
  // First create the inner hash (user + timestamp + activityType)
  const innerHash = ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "string"],
      [userAddress, timestamp, activityType]
    )
  );
  console.log("Inner hash:", innerHash);
  
  // Sign the message with the signer
  const signature = await signer.signMessage(ethers.getBytes(innerHash));
  console.log("Signature:", signature);
  
  // Encode the proof
  const proof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  console.log("Encoded proof:", proof);
  
  // Manually verify the proof before attempting the claim
  console.log("\n==== Verifying Proof Manually ====");
  try {
    const isProofValid = await activity.verifyEligibilityProof(userAddress, proof);
    console.log("Proof verification result:", isProofValid);
    
    if (!isProofValid) {
      console.warn("⚠️ Proof verification failed!");
      
      // Check if the recovered signer matches the expected signing key
      // This is a simulation of what happens inside the contract
      const recoveredAddress = ethers.verifyMessage(ethers.getBytes(innerHash), signature);
      console.log("Expected signing key:", signingKey);
      console.log("Recovered address from signature:", recoveredAddress);
      
      if (recoveredAddress.toLowerCase() !== signingKey.toLowerCase()) {
        console.error("❌ Recovered signer doesn't match the signing key!");
        console.log("This is likely the root cause of the verification failure.");
        
        // Potential fix if we control the signer
        console.log("\nPotential fixes:");
        console.log("1. Update the signing key in the activity contract to match the signer");
        console.log("   await activity.setSigningKey('" + recoveredAddress + "')");
        
        // Let's check if we're the owner and can update the signing key
        const activityOwner = await activity.owner();
        console.log("Activity owner:", activityOwner);
        console.log("Current signer:", userAddress);
        
        if (activityOwner.toLowerCase() === userAddress.toLowerCase()) {
          console.log("You are the owner and can update the signing key");
        } else {
          console.log("You are not the owner and cannot update the signing key");
        }
      }
    }
  } catch (error) {
    console.error("Error verifying proof:", error);
  }
  
  // Attempt to claim
  console.log("\n==== Attempting to Claim ====");
  try {
    // No discount in this test case
    const tx = await tim3cap.claim(proof, 0, []);
    console.log("Claim transaction sent:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Claim transaction successful!");
    console.log("Gas used:", receipt?.gasUsed);
    
    // Check if user has claimed
    const hasClaimedAfter = await reward.hasClaimed(userAddress);
    console.log("Has user claimed after transaction:", hasClaimedAfter);
    
    // Get the token ID if claim was successful
    if (hasClaimedAfter) {
      const userToken = await reward.userTokens(userAddress);
      console.log("User received token ID:", userToken);
    }
  } catch (error: any) {
    console.error("Claim transaction failed:", error);
    if (error.message) {
      console.error("Error message:", error.message);
    }
    
    // Check state again after failure
    console.log("\n==== Checking State After Failure ====");
    const canClaimAfter = await reward.canClaim(userAddress);
    console.log("Can user claim after failure:", canClaimAfter);
    
    const hasClaimedAfter = await reward.hasClaimed(userAddress);
    console.log("Has user claimed after failure:", hasClaimedAfter);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });