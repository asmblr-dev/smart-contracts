// scripts/find-deployed-addresses.ts
import { ethers } from "hardhat";

// The factory address from your previous deployment
const FACTORY_ADDRESS = "0x3192aA8c87Ba3E7D1ecb173382107E371bc6a116";

// Transaction hash where the Tim3cap was created
const TX_HASH = "0xdb763294cd1101257c91fcdf7bd2c6cde3457c9a5c73ea94a5145a77b1ee2706";

async function main() {
  console.log("Looking for deployed contract addresses...");
  
  const [signer] = await ethers.getSigners();
  const userAddress = await signer.getAddress();
  console.log("User address:", userAddress);
  
  // Get the transaction receipt
  console.log(`Getting receipt for transaction ${TX_HASH}...`);
  const receipt = await ethers.provider.getTransactionReceipt(TX_HASH);
  
  if (!receipt) {
    console.error("Transaction receipt not found");
    return;
  }
  
  console.log("Transaction receipt found. Logs count:", receipt.logs.length);
  
  // Extract created contract addresses
  const addresses = [];
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    if (log && log.address) {
      addresses.push(log.address);
    }
  }
  
  // Remove duplicates
  const uniqueAddresses = [...new Set(addresses)];
  console.log("Found unique addresses:", uniqueAddresses);
  
  // Identify Tim3cap, Activity and Reward contracts
  console.log("\nTrying to identify the deployed contracts...");
  
  // We'll try each address to see if it works as a Tim3cap, Activity or Reward contract
  const possibleTim3caps = [];
  const possibleActivities = [];
  const possibleRewards = [];
  
  for (const address of uniqueAddresses) {
    console.log(`\nChecking ${address}...`);
    
    // Try as Tim3cap
    try {
      const tim3cap = await ethers.getContractAt("Tim3cap", address);
      // Just check owner to see if it's a valid contract
      const owner = await tim3cap.owner();
      console.log("- Successfully connected as Tim3cap");
      console.log("- Owner:", owner);
      possibleTim3caps.push(address);
      
      try {
        // Try to get the activity and reward addresses
        const state = await tim3cap.debugState();
        console.log("- debugState successful");
        console.log("- Activity:", state.activityAddr);
        console.log("- Reward:", state.rewardAddr);
        
        // If we got here, this is definitely a Tim3cap
        console.log("\n✓ Confirmed Tim3cap address:", address);
        console.log("✓ Activity address:", state.activityAddr);
        console.log("✓ Reward address:", state.rewardAddr);
        
        // Add these addresses to our lists
        if (!possibleActivities.includes(state.activityAddr)) {
          possibleActivities.push(state.activityAddr);
        }
        if (!possibleRewards.includes(state.rewardAddr)) {
          possibleRewards.push(state.rewardAddr);
        }
      } catch (error) {
        console.log("- debugState failed:", error.message);
      }
    } catch (error) {
      // Not a Tim3cap or error connecting
      console.log("- Not a Tim3cap:", error.message);
    }
    
    // Try as Activity (HoldXNfts)
    try {
      const activity = await ethers.getContractAt("HoldXNfts", address);
      // Check activity type
      const activityType = await activity.getActivityType();
      console.log("- Successfully connected as Activity");
      console.log("- Activity type:", activityType);
      possibleActivities.push(address);
      
      // Try to get signing key
      try {
        const state = await activity.debugActivityState();
        console.log("- Signing key:", state.activitySigningKey);
      } catch (error) {
        console.log("- debugActivityState failed:", error.message);
      }
    } catch (error) {
      // Not an Activity or error connecting
      console.log("- Not an Activity:", error.message);
    }
    
    // Try as Reward (NFTMintReward)
    try {
      const reward = await ethers.getContractAt("NFTMintReward", address);
      // Check reward type
      const rewardType = await reward.getRewardType();
      console.log("- Successfully connected as Reward");
      console.log("- Reward type:", rewardType);
      possibleRewards.push(address);
      
      // Try to get controller
      try {
        const state = await reward.debugState(userAddress);
        console.log("- Controller:", state.controllerAddr);
      } catch (error) {
        console.log("- debugState failed:", error.message);
      }
    } catch (error) {
      // Not a Reward or error connecting
      console.log("- Not a Reward:", error.message);
    }
  }
  
  console.log("\nSummary of identified contracts:");
  console.log("Possible Tim3cap addresses:", possibleTim3caps);
  console.log("Possible Activity addresses:", possibleActivities);
  console.log("Possible Reward addresses:", possibleRewards);
  
  // Save addresses for use in debug-claim.ts
  if (possibleTim3caps.length > 0 && possibleActivities.length > 0 && possibleRewards.length > 0) {
    console.log("\nUpdate your debug script with these addresses:");
    console.log(`const TIM3CAP_ADDRESS = "${possibleTim3caps[0]}";`);
    console.log(`const ACTIVITY_ADDRESS = "${possibleActivities[0]}";`);
    console.log(`const REWARD_ADDRESS = "${possibleRewards[0]}";`);
  } else {
    console.log("\nCould not identify all required contracts. Manual inspection needed.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });