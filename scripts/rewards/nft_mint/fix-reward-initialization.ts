// scripts/fix-reward-initialization.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed contracts
  const REWARD_ADDRESS = "0xc5FDE557c3De59923E25E1B288741A8cC5C8c084";
  const reward = await ethers.getContractAt("NFTMintReward", REWARD_ADDRESS);
  
  console.log("\n=== Fixing Reward Contract ===");
  
  // Step 1: Check and fix active status
  try {
    const isActive = await reward.active();
    console.log("Reward active:", isActive);
    
    if (!isActive) {
      console.log("Activating reward...");
      const tx1 = await reward.activate();
      console.log("Transaction hash:", tx1.hash);
      await tx1.wait();
      console.log("Reward activated successfully");
    }
  } catch (error: any) {
    console.log("Could not check or set active status:", error.message);
  }
  
  // Step 2: Check and fix claim period
  try {
    const claimStartDate = await reward.claimStartDate();
    const claimFinishDate = await reward.claimFinishDate();
    
    console.log("Current claim start date:", new Date(Number(claimStartDate) * 1000).toISOString());
    console.log("Current claim finish date:", claimFinishDate.toString() === "0" ? 
      "No end date" : new Date(Number(claimFinishDate) * 1000).toISOString());
    
    // Set claim period to now and 1 year from now if needed
    const now = Math.floor(Date.now() / 1000);
    const oneYearFromNow = now + 365 * 24 * 60 * 60;
    
    // Only update if claim period is invalid
    if (claimStartDate > now || (claimFinishDate !== 0n && claimFinishDate < now)) {
      console.log("Setting claim period...");
      const tx2 = await reward.setClaimPeriod(now, oneYearFromNow);
      console.log("Transaction hash:", tx2.hash);
      await tx2.wait();
      console.log("Claim period updated successfully");
      console.log("New start date:", new Date(now * 1000).toISOString());
      console.log("New finish date:", new Date(oneYearFromNow * 1000).toISOString());
    }
  } catch (error: any) {
    console.log("Could not check or set claim period:", error.message);
  }
  
  // Step 3: Try to debug configuration
  try {
    const config = await reward.config();
    console.log("\nReward configuration:");
    console.log("- Name:", config.name);
    console.log("- Symbol:", config.symbol);
    console.log("- Description:", config.description);
    console.log("- Max supply:", config.maxSupply.toString());
    console.log("- Is randomized:", config.isRandomized);
    console.log("- Royalty recipient:", config.royaltyRecipient);
    console.log("- Royalty percentage:", config.royaltyPercentage.toString());
  } catch (error: any) {
    console.log("Could not get reward configuration:", error.message);
  }
  
  // Step 4: Check available supply
  try {
    const availableSupply = await reward.getAvailableSupply();
    console.log("\nAvailable supply:", availableSupply.toString());
    console.log("Minted count:", await reward.getMintedCount());
    
    if (availableSupply <= 0) {
      console.log("⚠️ No available supply for minting!");
      
      // Try to get more details if supply is zero
      const isRandomized = await reward.isRandomizedDistribution();
      console.log("Is randomized distribution:", isRandomized);
      
      if (isRandomized) {
        const remainingIds = await reward.getRemainingTokenIds();
        console.log("Remaining token IDs:", remainingIds.length === 0 ? "None" : remainingIds);
      } else {
        const nextTokenId = await reward.nextTokenId();
        const maxSupply = await reward.config().then(c => c.maxSupply);
        console.log("Next token ID:", nextTokenId.toString());
        console.log("Max supply:", maxSupply.toString());
      }
    }
  } catch (error: any) {
    console.log("Could not check available supply:", error.message);
  }
  
  // Step 5: Verify canClaim
  try {
    const canClaim = await reward.canClaim(signer.address);
    console.log("\nCan claim now:", canClaim);
    
    // Check each condition separately
    const userHasClaimed = await reward.hasClaimed(signer.address);
    const isActive = await reward.active();
    console.log("- User has claimed:", userHasClaimed);
    console.log("- Reward is active:", isActive);
    
    // Check time window
    const now = Math.floor(Date.now() / 1000);
    const startDate = await reward.claimStartDate();
    const finishDate = await reward.claimFinishDate();
    const inTimeWindow = now >= startDate && (finishDate === 0n || now <= finishDate);
    console.log("- In claim time window:", inTimeWindow);
    
    // Check supply
    const hasSupply = await reward.getAvailableSupply().then(s => s > 0);
    console.log("- Has available supply:", hasSupply);
    
    // If the issue is with claimed status, we can't easily fix that
    if (userHasClaimed) {
      console.log("\n⚠️ User has already claimed. Cannot claim again!");
    }
  } catch (error: any) {
    console.log("Could not check claim eligibility:", error.message);
  }
  
  console.log("\n=== Summary ===");
  console.log("If all values are now properly set and 'Can claim now' is true, you should be able to claim.");
  console.log("If there are still issues, consider redeploying the contracts with proper initialization.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });