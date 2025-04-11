// scripts/direct-claim-attempt.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);
  
  // Your deployed contract addresses
  const TIM3CAP_ADDRESS = "0xe5381Afe61AD365dB85E6a2D9684024E1bAf69eA";
  const REWARD_ADDRESS = "0xc5FDE557c3De59923E25E1B288741A8cC5C8c084";
  
  const tim3cap = await ethers.getContractAt("Tim3cap", TIM3CAP_ADDRESS);
  const reward = await ethers.getContractAt("NFTMintReward", REWARD_ADDRESS);
  
  // Check basic reward state without calling complex functions
  try {
    console.log("Reward owner:", await reward.owner());
    console.log("Reward active:", await reward.active());
  } catch (error: any) {
    console.log("Error checking basic reward state:", error.message);
  }
  
  // Create empty proof for claim attempt
  const timestamp = Math.floor(Date.now() / 1000);
  const emptyProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    ["0x", timestamp]
  );
  
  // Skip all checks and go straight to claim
  console.log("\n=== Attempting direct claim ===");
  console.log("Bypassing all pre-checks and attempting claim directly...");
  
  try {
    const tx = await tim3cap.claim(emptyProof, 0, [], {
      gasLimit: 3000000 // Use higher gas limit for safety
    });
    console.log("Claim transaction submitted. Hash:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction successful! Gas used:", receipt.gasUsed.toString());
    
    // Check claim status
    const hasClaimed = await reward.hasClaimed(signer.address);
    console.log("Has user claimed now:", hasClaimed);
  } catch (error) {
    console.log("Claim transaction failed");
    console.error(error);
    
    // Try direct reward claim as a last resort
    console.log("\n=== Attempting direct reward contract claim ===");
    console.log("This will only work if your address is authorized in the reward contract");
    
    try {
      const rewardTx = await reward.claim(signer.address, {
        gasLimit: 3000000
      });
      console.log("Direct reward claim submitted. Hash:", rewardTx.hash);
      
      const rewardReceipt = await rewardTx.wait();
      console.log("Direct reward claim successful! Gas used:", rewardReceipt.gasUsed.toString());
    } catch (rewardError) {
      console.log("Direct reward claim failed");
      console.error(rewardError);
      
      // One final attempt: activate the reward if not active
      try {
        console.log("\n=== Checking if reward needs activation ===");
        const isActive = await reward.active();
        console.log("Reward active:", isActive);
        
        if (!isActive) {
          console.log("Activating reward contract...");
          const activateTx = await reward.activate();
          console.log("Activation transaction hash:", activateTx.hash);
          await activateTx.wait();
          console.log("Reward activated successfully");
          
          // Try claim again after activation
          console.log("Trying claim again after activation...");
          const claimTx = await tim3cap.claim(emptyProof, 0, [], {
            gasLimit: 3000000
          });
          console.log("Claim transaction hash:", claimTx.hash);
          await claimTx.wait();
          console.log("Claim successful after activation!");
        }
      } catch (activationError) {
        console.log("Activation or subsequent claim failed");
        console.error(activationError);
        
        console.log("\n=== Final diagnosis ===");
        console.log("The NFTMintReward contract appears to have initialization or configuration issues.");
        console.log("For production, you may need to redeploy with updated parameters.");
        console.log("For testing, consider using a more simplified reward mechanism.");
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });