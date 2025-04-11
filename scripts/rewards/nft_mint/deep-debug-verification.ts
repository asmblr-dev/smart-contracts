// scripts/deep-debug-verification.ts
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
  
  // Get activity type
  const activityType = await activity.getActivityType();
  console.log("Activity type:", activityType);
  
  // Create proof - using the EXACT same steps as in the contract
  // See BaseActivity.verifyEligibilityProof
  const timestamp = Math.floor(Date.now() / 1000);
  console.log("Current timestamp:", timestamp);
  
  // IMPORTANT: Let's debug by exactly replicating the contract's signing process
  // The contract does:
  // 1. First creates keccak256(abi.encodePacked(user, timestamp, activityType))
  // 2. Then creates keccak256("\x19Ethereum Signed Message:\n32" + step1)
  // 3. Then recovers the signer from the signature using the step2 hash
  
  console.log("\n=== STEP 1: Create packed hash ===");
  // The contract uses abi.encodePacked, which is different from abi.encode
  // We need to manually pack the data
  const user = signer.address;
  const packedData = ethers.concat([
    ethers.getBytes(user),
    ethers.toBeArray(BigInt(timestamp)),
    ethers.toUtf8Bytes(activityType)
  ]);
  
  console.log("User:", user);
  console.log("Timestamp:", timestamp);
  console.log("Activity type:", activityType);
  console.log("Packed data:", ethers.hexlify(packedData));
  
  const step1Hash = ethers.keccak256(packedData);
  console.log("Step 1 hash:", step1Hash);
  
  console.log("\n=== STEP 2: Create Ethereum signed message hash ===");
  // The contract prefixes with the Ethereum signed message prefix
  const prefix = "\x19Ethereum Signed Message:\n32";
  const ethSignedMsgData = ethers.concat([
    ethers.toUtf8Bytes(prefix),
    ethers.getBytes(step1Hash)
  ]);
  
  const step2Hash = ethers.keccak256(ethSignedMsgData);
  console.log("Step 2 hash (for ECDSA recovery):", step2Hash);
  
  console.log("\n=== STEP 3: Create signature ===");
  // To match the contract, we need to sign the original hash, not the prefixed one
  // The ethers.signMessage already adds the prefix
  const signature = await signer.signMessage(ethers.getBytes(step1Hash));
  console.log("Signature:", signature);
  
  // Let's analyze the signature
  const sigParts = ethers.Signature.from(signature);
  console.log("r:", sigParts.r);
  console.log("s:", sigParts.s);
  console.log("v:", sigParts.v);
  
  console.log("\n=== STEP 4: Verify signature locally ===");
  // Verify the signature directly using ethers (this should succeed)
  const recoveredAddress = ethers.verifyMessage(ethers.getBytes(step1Hash), signature);
  console.log("Locally recovered address:", recoveredAddress);
  console.log("Matches signer account?", recoveredAddress.toLowerCase() === signer.address.toLowerCase());
  console.log("Matches signingKey?", recoveredAddress.toLowerCase() === signingKey.toLowerCase());
  
  console.log("\n=== STEP 5: Build ABI-encoded proof for contract ===");
  // Format the proof exactly as expected by the contract
  const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  console.log("Encoded proof:", eligibilityProof);
  
  console.log("\n=== STEP 6: Verify with contract ===");
  // Try the verification
  const isVerified = await activity.verifyEligibilityProof(signer.address, eligibilityProof);
  console.log("Contract verification result:", isVerified);
  
  if (!isVerified) {
    console.log("\n=== STEP 7: Try alternative encoding approaches ===");
    
    // Try alternative 1: Fully matching the Solidity encoding
    console.log("\nAlternative 1: Solidity-style encoding");
    // In Solidity, abi.encodePacked works differently than ethers.solidityPacked
    // Let's try a different approach to packing
    
    // Use a stringified message hash (this is common in EIP-712 implementations)
    const messageHashBytes = ethers.toUtf8Bytes(
      `I am authorizing activity: ${activityType} at time: ${timestamp} for: ${user}`
    );
    const altMessageHash = ethers.keccak256(messageHashBytes);
    console.log("Alternative message hash:", altMessageHash);
    
    const altSignature = await signer.signMessage(ethers.getBytes(altMessageHash));
    console.log("Alternative signature:", altSignature);
    
    const altEligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "uint256"],
      [altSignature, timestamp]
    );
    
    try {
      const altIsVerified = await activity.verifyEligibilityProof(signer.address, altEligibilityProof);
      console.log("Alternative verification result:", altIsVerified);
    } catch (error) {
      console.log("Alternative verification failed:", error);
    }
    
    // Try direct bypass (if possible) by checking eligibility directly
    console.log("\nTesting direct eligibility check:");
    try {
      const directEligible = await activity.checkEligibility(signer.address);
      console.log("Direct eligibility check:", directEligible);
    } catch (error) {
      console.log("Direct eligibility check failed");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });