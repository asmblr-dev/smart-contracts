// scripts/claim-with-disabled-checks.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed contract addresses
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  const REWARD_ADDRESS = "0xc5FDE557c3De59923E25E1B288741A8cC5C8c084";
  
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  const reward = await ethers.getContractAt("NFTMintReward", REWARD_ADDRESS);
  
  // Check if user has already claimed
  const hasClaimed = await reward.hasClaimed(signer.address);
  console.log("Has user already claimed?", hasClaimed);
  
  if (hasClaimed) {
    console.log("User has already claimed. Exiting.");
    return;
  }
  
  // Verify the eligibility config is disabled
  const eligibilityConfig = await tim3cap.eligibilityConfig();
  console.log("Eligibility enabled:", eligibilityConfig[0]);
  
  if (eligibilityConfig[0]) {
    console.log("⚠️ Warning: Eligibility is still enabled. Run disable-eligibility-checks.ts first.");
    return;
  }
  
  // Create empty proof
  const timestamp = Math.floor(Date.now() / 1000);
  const emptyProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    ["0x", timestamp]
  );
  
  // Check if user can claim
  console.log("\nChecking if user can claim...");
  const canClaim = await reward.canClaim(signer.address);
  console.log("Can claim?", canClaim);
  
  // Check reward state
  console.log("\nReward state:");
  console.log("- Active:", await reward.active());
  console.log("- Claim start date:", await reward.claimStartDate());
  console.log("- Claim finish date:", await reward.claimFinishDate());
  console.log("- Total claims:", await reward.totalClaims());
  
  // Attempt to claim
  console.log("\nAttempting to claim with empty proof...");
  try {
    const tx = await tim3cap.claim(emptyProof, 0, [], {
      gasLimit: 2000000
    });
    console.log("Claim transaction hash:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Claim successful! Gas used:", receipt.gasUsed.toString());
    
    // Verify user has now claimed
    const hasClaimedNow = await reward.hasClaimed(signer.address);
    console.log("Has user claimed now?", hasClaimedNow);
    console.log("Total claims:", await reward.totalClaims());
    
    // Get user's token info if possible
    try {
      const userToken = await reward.userTokens(signer.address);
      console.log("User's token ID:", userToken.toString());
    } catch (error) {
      console.log("Couldn't get user token information");
    }
  } catch (error) {
    console.log("Claim failed");
    console.error(error);
    
    // Try to get more details
    try {
              // @ts-ignore: TypeScript doesn't know about the claim method
      await tim3cap.callStatic.claim(emptyProof, 0, []);
    } catch (staticError) {
      console.log("\nStatic call error details:");
      console.error(staticError);
    }
    
    // Additional checks for specific issues
    console.log("\nChecking for additional issues...");
    const isPaused = await tim3cap.paused();
    console.log("- Tim3cap is paused:", isPaused);
    
    try {
      const isClaimPeriodActive = await reward.isClaimPeriodActive();
      console.log("- Claim period is active:", isClaimPeriodActive);
    } catch (error) {
      console.log("- Couldn't check if claim period is active");
    }
    
    // Alternative approach: try direct claim via reward contract
    console.log("\nTrying direct claim via reward contract...");
    try {
      // This will only work if your account is authorized
      await reward.claim(signer.address, {
        gasLimit: 1000000
      });
      console.log("Direct claim successful!");
    } catch (directClaimError) {
      console.log("Direct claim failed");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });