// scripts/check-contract-basics.ts
// This script verifies basic contract existence and functions
import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Checking Basic Contract Information ===");
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);

  // Replace with your deployed contract addresses
  const TIM3CAP_ADDRESS = "0x58bb45d627299728BE605FAe21ee300010C89Aa4";
  const ACTIVITY_ADDRESS = "0x5077D8f8D5C783C659BbeE92Ee199cc1E37Af07a";
  const REWARD_ADDRESS = "0xB2aED8262Bf8125849309Bc924fDe6D1D182a62a";

  // Check contract code existence (should return true if deployed)
  console.log("\n--- Checking Contract Code Existence ---");
  const tim3capCode = await ethers.provider.getCode(TIM3CAP_ADDRESS);
  const activityCode = await ethers.provider.getCode(ACTIVITY_ADDRESS);
  const rewardCode = await ethers.provider.getCode(REWARD_ADDRESS);

  console.log(`Tim3cap contract has code: ${tim3capCode !== "0x"}`);
  console.log(`Activity contract has code: ${activityCode !== "0x"}`);
  console.log(`Reward contract has code: ${rewardCode !== "0x"}`);

  // Check contract type by examining the code size
  // Proxies typically have much smaller bytecode than implementations
  console.log("\n--- Checking Contract Code Size ---");
  console.log(`Tim3cap code size: ${(tim3capCode.length - 2) / 2} bytes`);
  console.log(`Activity code size: ${(activityCode.length - 2) / 2} bytes`);
  console.log(`Reward code size: ${(rewardCode.length - 2) / 2} bytes`);
  console.log("Note: Proxy contracts typically have around 50-150 bytes of code");

  // Try to get basic properties using low-level calls
  console.log("\n--- Checking Basic Contract Functions ---");
  
  // Minimal ABIs for basic checks
  const tim3capABI = [
    "function activity() view returns (address)",
    "function reward() view returns (address)",
    "function owner() view returns (address)",
    "function paused() view returns (bool)"
  ];
  
  const activityABI = [
    "function owner() view returns (address)",
    "function getActivityType() pure returns (string memory)"
  ];
  
  const rewardABI = [
    "function owner() view returns (address)",
    "function getRewardType() pure returns (string memory)"
  ];

  // Connect to contracts using minimal ABIs
  const tim3cap = new ethers.Contract(TIM3CAP_ADDRESS, tim3capABI, signer);
  const activity = new ethers.Contract(ACTIVITY_ADDRESS, activityABI, signer);
  const reward = new ethers.Contract(REWARD_ADDRESS, rewardABI, signer);

  // Check basic Tim3cap properties
  try {
    const activityAddress = await tim3cap.activity();
    const rewardAddress = await tim3cap.reward();
    const owner = await tim3cap.owner();
    const paused = await tim3cap.paused();
    
    console.log("Tim3cap contract check:");
    console.log(`- activity(): ${activityAddress}`);
    console.log(`- reward(): ${rewardAddress}`);
    console.log(`- owner(): ${owner}`);
    console.log(`- paused(): ${paused}`);
    console.log(`- References match: ${activityAddress.toLowerCase() === ACTIVITY_ADDRESS.toLowerCase() && 
                                      rewardAddress.toLowerCase() === REWARD_ADDRESS.toLowerCase()}`);
  } catch (error: any) {
    console.log("Error checking Tim3cap contract:", error.message);
  }

  // Try to get activity type
  try {
    const activityType = await activity.getActivityType();
    const activityOwner = await activity.owner();
    
    console.log("\nActivity contract check:");
    console.log(`- getActivityType(): ${activityType}`);
    console.log(`- owner(): ${activityOwner}`);
  } catch (error: any) {
    console.log("Error checking Activity contract:", error.message);
  }

  // Try to get reward type
  try {
    const rewardType = await reward.getRewardType();
    const rewardOwner = await reward.owner();
    
    console.log("\nReward contract check:");
    console.log(`- getRewardType(): ${rewardType}`);
    console.log(`- owner(): ${rewardOwner}`);
  } catch (error: any) {
    console.log("Error checking Reward contract:", error.message);
  }

  // Check if contracts have the expected interfaces
  console.log("\n--- Checking Contract Function Selectors ---");
  
  // Define function selectors (first 4 bytes of keccak hash of function signature)
  const selectors = {
    // Tim3cap
    "claim(bytes,uint256,bytes32[])": "0xbd66528c",
    // Activity 
    "checkEligibility(address)": "0x5865c60c",
    "verifyEligibilityProof(address,bytes)": "0xe0e5ffde",
    // Reward
    "canClaim(address)": "0x4d5f327a",
    "claim(address)": "0x379607f5"
  };

  // Try calling functions with selectors to see if they exist on the contract
  for (const [funcSig, selector] of Object.entries(selectors)) {
    let targetAddress;
    if (funcSig.startsWith("claim(bytes")) {
      targetAddress = TIM3CAP_ADDRESS;
    } else if (funcSig.startsWith("check") || funcSig.startsWith("verify")) {
      targetAddress = ACTIVITY_ADDRESS;
    } else {
      targetAddress = REWARD_ADDRESS;
    }

    try {
      // Call the function with invalid parameters just to see if it exists
      // This should revert, but with a specific error showing the function exists
      await signer.call({
        to: targetAddress,
        data: selector + "0000000000000000000000000000000000000000000000000000000000000000"
      });
      console.log(`${funcSig} call did not revert (unusual)`);
    } catch (error: any) {
      const errorMsg = error.message;
      const exists = !errorMsg.includes("function selector was not recognized") && 
                     !errorMsg.includes("invalid opcode") &&
                     !errorMsg.includes("execution reverted");
      console.log(`${funcSig} exists on contract: ${exists ? "Yes" : "No"}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });