// scripts/fix-signing-key.ts
import { ethers } from "hardhat";

const ACTIVITY_ADDRESS = "0x38f6D3AAE8FB2adFF3B97d601544B826d09e39a5";

async function main() {
  const [signer] = await ethers.getSigners();
  const userAddress = await signer.getAddress();
  console.log("Setting signing key to:", userAddress);
  
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  
  // Set signing key
  const tx = await activity.setSigningKey(userAddress);
  await tx.wait();
  
  // Verify it was set
  const state = await activity.debugActivityState();
  console.log("New signing key:", state.activitySigningKey);
  
  // Set proof validity duration if needed
  if (state.proofDuration.toString() === "0") {
    console.log("Setting proof validity duration to 1 hour");
    const durationTx = await activity.setProofValidityDuration(3600);
    await durationTx.wait();
    console.log("Proof validity duration set");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });