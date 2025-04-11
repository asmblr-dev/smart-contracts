// scripts/set-proof-validity-duration.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed activity address
  const ACTIVITY_ADDRESS = "0x34D244d34361e52ee9937Abb49BF4719eB5CC3Cb";
  
  const activity = await ethers.getContractAt("HoldXNfts", ACTIVITY_ADDRESS);
  
  console.log("Current proof validity duration:", await activity.proofValidityDuration());
  
  // Set a longer proof validity duration (24 hours)
  const tx = await activity.setProofValidityDuration(86400);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  
  console.log("New proof validity duration:", await activity.proofValidityDuration());
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });