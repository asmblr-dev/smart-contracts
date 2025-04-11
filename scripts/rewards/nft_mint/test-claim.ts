// scripts/test-claim.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed contract addresses
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  const ACTIVITY_ADDRESS = "0x34D244d34361e52ee9937Abb49BF4719eB5CC3Cb";
  
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  
  // Create an eligibility proof
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
  
  // Try to claim
  console.log("Attempting to claim...");
  const tx = await tim3cap.claim(eligibilityProof, 0, []);
  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Claim successful! Gas used:", receipt.gasUsed.toString());
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });