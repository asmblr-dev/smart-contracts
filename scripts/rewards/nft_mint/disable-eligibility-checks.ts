// scripts/disable-eligibility-checks.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed contract addresses
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  
  // Check current eligibility config
  const currentConfig = await tim3cap.eligibilityConfig();
  console.log("Current eligibility config:");
  console.log("- Enabled:", currentConfig[0]);
  console.log("- Signing key:", currentConfig[1]);
  console.log("- Proof validity duration:", currentConfig[2].toString());
  console.log("- Require proof for all claims:", currentConfig[3]);
  
  // Update eligibility config to disable checks
  console.log("\nDisabling eligibility checks...");
  const newConfig = {
    enabled: false, // Disable eligibility service
    signingKey: signer.address, // Keep signing key the same
    proofValidityDuration: 86400, // Keep proof validity the same
    requireProofForAllClaims: false // Don't require proof for claims
  };
  
  const tx = await tim3cap.setEligibilityConfig(newConfig);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  console.log("Eligibility checks disabled successfully");
  
  // Verify the new config
  const updatedConfig = await tim3cap.eligibilityConfig();
  console.log("\nUpdated eligibility config:");
  console.log("- Enabled:", updatedConfig[0]);
  console.log("- Signing key:", updatedConfig[1]);
  console.log("- Proof validity duration:", updatedConfig[2].toString());
  console.log("- Require proof for all claims:", updatedConfig[3]);
  
  console.log("\nNow try claiming with an empty proof!");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });