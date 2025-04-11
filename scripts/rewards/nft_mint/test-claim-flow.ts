// scripts/test-claim-flow.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed contract addresses
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  const ACTIVITY_ADDRESS = "0x34D244d34361e52ee9937Abb49BF4719eB5CC3Cb";
  const REWARD_ADDRESS = "0xc5FDE557c3De59923E25E1B288741A8cC5C8c084";
  
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  const reward = await ethers.getContractAt("NFTMintReward", REWARD_ADDRESS);
  
  // Check contract status before attempting to claim
  console.log("\n=== Contract State Before Claim ===");
  
  // Tim3cap status
  console.log("Tim3cap paused:", await tim3cap.paused());
  const eligibilityConfig = await tim3cap.eligibilityConfig();
  console.log("Eligibility enabled:", eligibilityConfig[0]);
  console.log("Eligibility signing key:", eligibilityConfig[1]);
  console.log("Proof validity duration:", eligibilityConfig[2].toString());
  console.log("Require proof for all claims:", eligibilityConfig[3]);
  
  // Activity status
  console.log("\nActivity signing key:", await activity.signingKey());
  console.log("Activity owner:", await activity.owner());
  
  // Reward status
  console.log("\nReward active:", await reward.active());
  console.log("Reward claim start date:", await reward.claimStartDate());
  console.log("Reward claim finish date:", await reward.claimFinishDate());
  console.log("Has user claimed:", await reward.hasClaimed(signer.address));
  console.log("Can user claim:", await reward.canClaim(signer.address));
  
  // Bypass eligibility check by modifying the activity contract if necessary
  console.log("\n=== Setting Up Required Conditions ===");
  
  // Create proof
  const timestamp = Math.floor(Date.now() / 1000);
  const activityType = await activity.getActivityType();
  
  // Create message hash for signing - use the exact same method as in the contract
  const innerHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "string"],
      [signer.address, timestamp, activityType]
    )
  );
  
  // Sign the message hash
  const signature = await signer.signMessage(ethers.getBytes(innerHash));
  
  // Encode the proof
  const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  
  // Verify the proof
  const isVerified = await activity.verifyEligibilityProof(signer.address, eligibilityProof);
  console.log("Proof verification result:", isVerified);
  
  // Attempt to claim
  console.log("\n=== Attempting to Claim ===");
  try {
    // Add more gas to transaction to ensure it doesn't fail due to gas limit
    const tx = await tim3cap.claim(eligibilityProof, 0, [], {
      gasLimit: 2000000
    });
    console.log("Claim transaction hash:", tx.hash);
    
    // Wait for confirmation with more details
    const receipt = await tx.wait();
    console.log("Transaction successful");
    console.log("Gas used:", receipt.gasUsed.toString());
    
    // Check if the claim was recorded
    console.log("\n=== Checking Claim Status ===");
    console.log("Has user claimed now:", await reward.hasClaimed(signer.address));
    console.log("Total claims:", await reward.totalClaims());
    console.log("Can user claim now:", await reward.canClaim(signer.address));
  } catch (error) {
    console.log("Claim transaction failed");
    console.error(error);
    
    // Try to get more detailed error with static call
    try {
    // @ts-ignore: TypeScript doesn't know about the claim method
      await tim3cap.callStatic.claim(eligibilityProof, 0, []);
    } catch (staticError) {
      console.log("\nStatic call error details:");
      console.error(staticError);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });