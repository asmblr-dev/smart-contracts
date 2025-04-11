// scripts/set-signing-key.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed activity address
  const ACTIVITY_ADDRESS = "0x34D244d34361e52ee9937Abb49BF4719eB5CC3Cb";
  
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  
  console.log("Current signing key:", await activity.signingKey());
  
  // Set signing key to your wallet address
  const tx = await activity.setSigningKey(signer.address);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  
  console.log("New signing key:", await activity.signingKey());
  
  // Verify if proof works now
  const timestamp = Math.floor(Date.now() / 1000);
  const activityType = await activity.getActivityType();
  
  // Create message hash for signing
  const messageToHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "string"],
      [signer.address, timestamp, activityType]
    )
  );
  
  // Sign the message
  const signature = await signer.signMessage(ethers.getBytes(messageToHash));
  
  // Encode the proof
  const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  
  // Verify the proof
  const isVerified = await activity.verifyEligibilityProof(signer.address, eligibilityProof);
  console.log("Proof verification result:", isVerified);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });