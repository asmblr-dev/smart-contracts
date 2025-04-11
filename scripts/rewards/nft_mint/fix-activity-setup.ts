// scripts/fix-activity-setup.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed activity address
  const ACTIVITY_ADDRESS = "0x34D244d34361e52ee9937Abb49BF4719eB5CC3Cb";
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  
  // Check current configuration
  console.log("\n=== Current Activity Configuration ===");
  console.log("Activity owner:", await activity.owner());
  console.log("Signing key:", await activity.signingKey());
  console.log("Proof validity duration:", await activity.proofValidityDuration());
  
  // Check Tim3cap configuration
  console.log("\n=== Current Tim3cap Configuration ===");
  const eligibilityConfig = await tim3cap.eligibilityConfig();
  console.log("Eligibility enabled:", eligibilityConfig[0]);
  console.log("Eligibility signing key:", eligibilityConfig[1]);
  console.log("Proof validity duration:", eligibilityConfig[2].toString());
  console.log("Require proof for all claims:", eligibilityConfig[3]);
  
  // 1. Set the proof validity duration in HoldXNfts
  console.log("\n=== Setting Proof Validity Duration ===");
  const validityDuration = 86400; // 24 hours in seconds
  console.log(`Setting proof validity duration to ${validityDuration} seconds (24 hours)`);
  
  const tx1 = await activity.setProofValidityDuration(validityDuration);
  console.log("Transaction hash:", tx1.hash);
  await tx1.wait();
  console.log("New proof validity duration:", (await activity.proofValidityDuration()).toString());
  
  // 2. Create and test a proof with the new validity duration
  console.log("\n=== Testing Proof Verification ===");
  
  // Get activity type
  const activityType = await activity.getActivityType();
  console.log("Activity type:", activityType);
  
  // Generate a timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  console.log("Current timestamp:", timestamp);
  
  // Create message hash for signing (exactly as done in the contract)
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
  
  if (!isVerified) {
    console.log("\n⚠️ Proof still not verifying. Checking signature recovery...");
    
    // Check if we can recover the correct address locally
    const recoveredAddress = ethers.verifyMessage(ethers.getBytes(innerHash), signature);
    console.log("Locally recovered address:", recoveredAddress);
    console.log("Matches signer?", recoveredAddress.toLowerCase() === signer.address.toLowerCase());
    
    // Let's try hardcoding a simple test signature
    console.log("\n=== Creating Simple Test Signature ===");
    const testMessage = "test message";
    const testSignature = await signer.signMessage(testMessage);
    console.log("Test message:", testMessage);
    console.log("Test signature:", testSignature);
    const testRecovered = ethers.verifyMessage(testMessage, testSignature);
    console.log("Test recovered address:", testRecovered);
  }
  
  // 3. Try to directly set eligibility in Tim3cap (if needed)
  console.log("\n=== Updating Tim3cap Eligibility Config ===");
  
  // Update eligibility config to match activity
  const newEligibilityConfig = {
    enabled: true,
    signingKey: signer.address,
    proofValidityDuration: validityDuration,
    requireProofForAllClaims: false
  };
  
  const tx2 = await tim3cap.setEligibilityConfig(newEligibilityConfig);
  console.log("Transaction hash:", tx2.hash);
  await tx2.wait();
  
  // Verify new configuration
  const updatedConfig = await tim3cap.eligibilityConfig();
  console.log("Updated eligibility enabled:", updatedConfig[0]);
  console.log("Updated eligibility signing key:", updatedConfig[1]);
  console.log("Updated proof validity duration:", updatedConfig[2].toString());
  console.log("Updated require proof for all claims:", updatedConfig[3]);
  
  console.log("\nSetup complete. Now test the claim flow with the updated configuration.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });