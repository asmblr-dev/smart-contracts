// scripts/debug-proof-verification.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed activity address
  const ACTIVITY_ADDRESS = "0x34D244d34361e52ee9937Abb49BF4719eB5CC3Cb";
  
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  
  // Check key settings
  const signingKey = await activity.signingKey();
  const proofDuration = await activity.proofValidityDuration();
  console.log("Current signing key:", signingKey);
  console.log("Proof validity duration:", proofDuration.toString());
  console.log("Signing key matches signer?", signingKey.toLowerCase() === signer.address.toLowerCase());
  
  // Get activity type
  const activityType = await activity.getActivityType();
  console.log("Activity type:", activityType);
  
  // Create proof
  const timestamp = Math.floor(Date.now() / 1000);
  console.log("Current timestamp:", timestamp);
  
  // Create message hash exactly as done in the contract
  console.log("\nCreating message hash...");
  
  // First create the inner hash (user + timestamp + activityType)
  const innerHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "string"],
      [signer.address, timestamp, activityType]
    )
  );
  console.log("Inner hash:", innerHash);
  
  // Then create the Ethereum signed message hash (need to match contract exactly)
  const ethMessagePrefix = "\x19Ethereum Signed Message:\n32";
  const messageHash = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes(ethMessagePrefix),
      innerHash
    ])
  );
  console.log("Final message hash:", messageHash);
  
  // Sign using the wallet
  console.log("\nSigning message...");
  const signature = await signer.signMessage(ethers.getBytes(innerHash));
  console.log("Signature:", signature);
  
  // Verify locally using ecrecover
  const recoveredAddress = ethers.verifyMessage(ethers.getBytes(innerHash), signature);
  console.log("Locally recovered address:", recoveredAddress);
  console.log("Matches signer?", recoveredAddress.toLowerCase() === signer.address.toLowerCase());
  
  // Encode the proof for the contract
  const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  console.log("\nEncoded proof:", eligibilityProof);
  
  // Try contract verification
  console.log("\nVerifying with contract...");
  const isVerified = await activity.verifyEligibilityProof(signer.address, eligibilityProof);
  console.log("Contract verification result:", isVerified);
  
  // Try direct check with onchain eligibility
  console.log("\nChecking direct eligibility...");
  const isEligible = await activity.checkEligibility(signer.address);
  console.log("Direct eligibility check:", isEligible);
  
  // Debug with isEligible as well
  console.log("\nChecking with isEligible...");
  const isEligibleAlias = await activity.isEligible(signer.address);
  console.log("isEligible result:", isEligibleAlias);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });