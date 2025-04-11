// scripts/bypass-verification-test.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed contract addresses
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  const ACTIVITY_ADDRESS = "0x34D244d34361e52ee9937Abb49BF4719eB5CC3Cb";
  
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  
  // Check the eligibility config
  const eligibilityConfig = await tim3cap.eligibilityConfig();
  console.log("Eligibility enabled:", eligibilityConfig[0]);
  console.log("Require proof for all claims:", eligibilityConfig[3]);
  
  // If eligibility is enabled but proofs aren't required for all claims,
  // then a user who meets the on-chain criteria can claim without a proof
  console.log("\nChecking if we meet on-chain eligibility...");
  
  // Analyze the HoldXNfts activity parameters
  const activityParams = await activity.debugActivityState();
  console.log("Activity parameters:");
  console.log("- NFT contracts:", activityParams[0]);
  console.log("- Start date:", new Date(Number(activityParams[1]) * 1000).toISOString());
  console.log("- End date:", new Date(Number(activityParams[2]) * 1000).toISOString());
  console.log("- Snapshot date:", Number(activityParams[3]));
  console.log("- Listing status:", Number(activityParams[4]));
  
  // Get the required amount for the NFT
  if (activityParams[0].length > 0) {
    const nftContract = activityParams[0][0];
    const requiredAmount = await activity.getRequiredAmount(nftContract);
    console.log("- Required amount for NFT:", requiredAmount.toString());
  }
  
  // Check current time against activity window
  const now = Math.floor(Date.now() / 1000);
  console.log("\nCurrent time:", new Date(now * 1000).toISOString());
  console.log("In activity window?", 
    now >= Number(activityParams[1]) && 
    (Number(activityParams[2]) === 0 || now <= Number(activityParams[2])));
  
  // Attempt to check eligibility directly (should work if on-chain eligibility passes)
  console.log("\nAttempting direct eligibility check...");
  try {
    const isEligible = await activity.isEligible(signer.address);
    console.log("Is eligible:", isEligible);
  } catch (error) {
    console.log("Eligibility check failed:", error);
  }
  
  // Create empty proof data
  console.log("\nCreating minimal proof...");
  const timestamp = Math.floor(Date.now() / 1000);
  const minimalProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    ["0x", timestamp]
  );
  
  // Try claim with minimal proof (will only work if on-chain eligibility passes)
  console.log("\nAttempting claim with minimal proof...");
  try {
    const tx = await tim3cap.claim(minimalProof, 0, [], {
      gasLimit: 2000000
    });
    console.log("Claim transaction hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction successful!");
  } catch (error) {
    console.log("Claim failed. Try enabling direct claim without proof verification.");
    
    // Let's get more info
    try {
              // @ts-ignore: TypeScript doesn't know about the claim method
      await tim3cap.callStatic.claim(minimalProof, 0, []);
    } catch (staticError) {
      console.log("\nDetails from static call:", staticError);
    }
  }
  
  // Suggestion for fixing
  console.log("\n=== Suggested Fixes ===");
  console.log("1. Try updating the Tim3cap eligibility config to disable proof requirements");
  console.log("   await tim3cap.setEligibilityConfig({enabled: false, signingKey: signer.address, proofValidityDuration: 86400, requireProofForAllClaims: false})");
  console.log("2. Or, make sure your user has the NFT required by the activity");
  console.log("3. Check the activity dates to ensure we're in the valid time window");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });