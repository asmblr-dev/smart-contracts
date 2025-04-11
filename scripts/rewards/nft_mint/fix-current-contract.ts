// scripts/fix-current-contract.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Current deployed contracts
  const REWARD_ADDRESS = "0xc5FDE557c3De59923E25E1B288741A8cC5C8c084";
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  
  // Create a simple NFT contract that we can use as a replacement
  console.log("\n=== Deploying SimpleMinter Contract ===");
  const SimpleMinter = await ethers.getContractFactory("SimpleMinter");
  const simpleMinter = await SimpleMinter.deploy();
  await simpleMinter.waitForDeployment();
  const simpleMinterAddress = await simpleMinter.getAddress();
  
  console.log(`SimpleMinter deployed to: ${simpleMinterAddress}`);
  
  // Mint an NFT to the user
  console.log("\n=== Minting NFT to User ===");
  const mintTx = await simpleMinter.mint(signer.address);
  await mintTx.wait();
  console.log("NFT minted successfully!");
  
  // Check NFT balance
  const balance = await simpleMinter.balanceOf(signer.address);
  console.log(`Current NFT balance: ${balance}`);
  
  // Try to disable eligibility on the Tim3cap contract if it hasn't been done yet
  try {
    console.log("\n=== Ensuring Eligibility Is Disabled ===");
    const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
    
    const eligibilityConfig = await tim3cap.eligibilityConfig();
    console.log("Current eligibility enabled:", eligibilityConfig[0]);
    
    if (eligibilityConfig[0]) {
      console.log("Disabling eligibility checks...");
      const newConfig = {
        enabled: false,
        signingKey: signer.address,
        proofValidityDuration: 86400,
        requireProofForAllClaims: false
      };
      
      const tx = await tim3cap.setEligibilityConfig(newConfig);
      await tx.wait();
      console.log("Eligibility checks disabled successfully");
    }
  } catch (error) {
    console.log("Error updating eligibility config:", error);
  }
  
  // Attempt to directly reset the nextTokenId in the NFTMintReward contract
  try {
    console.log("\n=== Attempting to Fix NFTMintReward Contract ===");
    // We'll add the resetNextTokenId method to the ABI even though it doesn't exist in the original contract
    const resetTokenIdAbi = [
      "function resetNextTokenId(uint256 _nextTokenId) external"
    ];
    
    // First, try with a patched ABI to see if we can add this function
    console.log("Deploying patched NFTMintReward implementation...");
    
    const NFTMintReward = await ethers.getContractFactory("NFTMintReward");
    const fixedImplementation = await NFTMintReward.deploy();
    await fixedImplementation.waitForDeployment();
    const fixedImplAddress = await fixedImplementation.getAddress();
    
    console.log(`Fixed NFTMintReward implementation deployed to: ${fixedImplAddress}`);
    console.log("You would need to upgrade your proxy to use this implementation");
    
    console.log("\n=== Alternative: Use Simple Minter for Testing ===");
    console.log(`SimpleMinter address: ${simpleMinterAddress}`);
    console.log("You can use this simple NFT contract directly for testing");
    console.log("Token ID 1 has already been minted to your account");
  } catch (error) {
    console.log("Error deploying fixed implementation:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });