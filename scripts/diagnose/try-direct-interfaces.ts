// scripts/try-direct-interfaces.ts
// This script attempts to call contract functions using custom ABIs and ethers directly
import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Testing Direct Interface Calls ===");
  const [signer] = await ethers.getSigners();
  const user = signer.address;
  console.log("Using account:", user);

  // Replace with your deployed contract addresses
  const TIM3CAP_ADDRESS = "0x58bb45d627299728BE605FAe21ee300010C89Aa4";
  const ACTIVITY_ADDRESS = "0x5077D8f8D5C783C659BbeE92Ee199cc1E37Af07a";
  const REWARD_ADDRESS = "0xB2aED8262Bf8125849309Bc924fDe6D1D182a62a";
  
  // Create direct interfaces based on contract signatures
  console.log("\n--- Testing Tim3cap Interface ---");
  const tim3capFunctions = [
    "function activity() view returns (address)",
    "function reward() view returns (address)",
    "function owner() view returns (address)",
    "function paused() view returns (bool)",
    "function eligibilityConfig() view returns (bool, address, uint256, bool)",
    "function claim(bytes calldata proof, uint256 discountRate, bytes32[] calldata discountProof) external",
    "function debugState() view returns (bool, address, address, bool, bool, address, uint256)"
  ];
  
  const tim3cap = new ethers.Contract(
    TIM3CAP_ADDRESS,
    tim3capFunctions,
    signer
  );
  
  // Test each Tim3cap function
  for (const func of tim3capFunctions) {
    const name = func.split('(')[0].split(' ').pop();
    if (!name) continue;
    
    // Skip functions with parameters for now
    if (name === "claim") continue;
    
    try {
      const result = await tim3cap[name]();
      console.log(`Tim3cap.${name}() succeeded:`, Array.isArray(result) ? result : result.toString());
    } catch (error: any) {
      console.log(`Tim3cap.${name}() failed:`, error.message);
    }
  }
  
  console.log("\n--- Testing Activity Interface ---");
  const activityFunctions = [
    "function owner() view returns (address)",
    "function signingKey() view returns (address)",
    "function proofValidityDuration() view returns (uint256)",
    "function getActivityType() pure returns (string memory)",
    "function checkEligibility(address user) view returns (bool)",
    "function isEligible(address user) view returns (bool)",
    "function verifyEligibilityProof(address user, bytes calldata proof) view returns (bool)"
  ];
  
  const activity = new ethers.Contract(
    ACTIVITY_ADDRESS,
    activityFunctions,
    signer
  );
  
  // Test each Activity function
  for (const func of activityFunctions) {
    const name = func.split('(')[0].split(' ').pop();
    if (!name) continue;
    
    if (name === "checkEligibility" || name === "isEligible") {
      try {
        const result = await activity[name](user);
        console.log(`Activity.${name}(${user}) succeeded:`, result);
      } catch (error: any) {
        console.log(`Activity.${name}(${user}) failed:`, error.message);
      }
    } 
    else if (name === "verifyEligibilityProof") {
      // Skip for now
      continue;
    }
    else {
      try {
        const result = await activity[name]();
        console.log(`Activity.${name}() succeeded:`, result?.toString ? result.toString() : result);
      } catch (error: any) {
        console.log(`Activity.${name}() failed:`, error.message);
      }
    }
  }
  
  console.log("\n--- Testing Reward Interface ---");
  const rewardFunctions = [
    "function owner() view returns (address)",
    "function active() view returns (bool)",
    "function claimStartDate() view returns (uint256)",
    "function claimFinishDate() view returns (uint256)",
    "function totalClaims() view returns (uint256)",
    "function hasClaimed(address user) view returns (bool)",
    "function controller() view returns (address)",
    "function canClaim(address user) view returns (bool)",
    "function getRewardType() pure returns (string memory)",
    "function isClaimPeriodActive() view returns (bool)"
  ];
  
  const reward = new ethers.Contract(
    REWARD_ADDRESS,
    rewardFunctions,
    signer
  );
  
  // Test each Reward function
  for (const func of rewardFunctions) {
    const name = func.split('(')[0].split(' ').pop();
    if (!name) continue;
    
    if (name === "canClaim" || name === "hasClaimed") {
      try {
        const result = await reward[name](user);
        console.log(`Reward.${name}(${user}) succeeded:`, result);
      } catch (error: any) {
        console.log(`Reward.${name}(${user}) failed:`, error.message);
      }
    } else {
      try {
        const result = await reward[name]();
        console.log(`Reward.${name}() succeeded:`, result?.toString ? result.toString() : result);
      } catch (error: any) {
        console.log(`Reward.${name}() failed:`, error.message);
      }
    }
  }
  
  // Try to create a properly formatted claim proof
  console.log("\n--- Creating and Verifying Eligibility Proof ---");
  try {
    // Default activity type if we couldn't get it
    let activityType = "HOLD_X_NFTS";
    try {
      activityType = await activity.getActivityType();
    } catch (error) {
      console.log("Could not get activity type, using default:", activityType);
    }
    
    // Prepare proof components
    const timestamp = Math.floor(Date.now() / 1000);
    console.log("Timestamp for proof:", timestamp);
    
    // Create message hash
    const messageToHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "string"],
        [user, timestamp, activityType]
      )
    );
    
    // Get private key from env
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (!PRIVATE_KEY) {
      throw new Error("PRIVATE_KEY not found in environment variables");
    }
    
    // Sign message
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log("Signing wallet address:", wallet.address);
    const signature = await wallet.signMessage(ethers.getBytes(messageToHash));
    
    // Encode proof
    const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "uint256"],
      [signature, timestamp]
    );
    
    console.log("Created proof successfully");
    
    // Try verifying with direct method call using callStatic (raw)
    console.log("\n--- Testing Raw Verification Call ---");
    const verifyData = ethers.concat([
      ethers.zeroPadValue(ethers.hexlify(ethers.id("verifyEligibilityProof(address,bytes)").slice(0, 10)), 4),
      ethers.zeroPadValue(user, 32),
      ethers.zeroPadValue(ethers.hexlify(ethers.toBeHex(64)), 32), // offset to bytes
      ethers.zeroPadValue(ethers.hexlify(ethers.toBeHex(eligibilityProof.length - 2)), 32), // length of bytes (minus 0x)
      eligibilityProof.slice(2) // bytes data without 0x
    ]);
    
    try {
      const rawResult = await signer.call({
        to: ACTIVITY_ADDRESS,
        data: verifyData
      });
      console.log("Raw verification result:", rawResult);
    } catch (error: any) {
      console.log("Raw verification failed:", error.message);
    }
    
    // Try claim with direct method call
    console.log("\n--- Testing Raw Claim Call ---");
    const discountRate = 0;
    const discountProof: string[] = [];
    
    // Encode claim call
    const claimData = ethers.concat([
      ethers.zeroPadValue(ethers.hexlify(ethers.id("claim(bytes,uint256,bytes32[])").slice(0, 10)), 4),
      ethers.zeroPadValue(ethers.hexlify(ethers.toBeHex(96)), 32), // offset to bytes
      ethers.zeroPadValue(ethers.hexlify(ethers.toBeHex(discountRate)), 32), // discount rate
      ethers.zeroPadValue(ethers.hexlify(ethers.toBeHex(128)), 32), // offset to discount proof array
      ethers.zeroPadValue(ethers.hexlify(ethers.toBeHex(eligibilityProof.length - 2)), 32), // length of bytes (minus 0x)
      eligibilityProof.slice(2), // bytes data without 0x
      ethers.zeroPadValue(ethers.hexlify(ethers.toBeHex(0)), 32) // empty array length
    ]);
    
    try {
      // Estimate gas first to see if it will revert
      const gasEstimate = await signer.estimateGas({
        to: TIM3CAP_ADDRESS,
        data: claimData
      });
      
      console.log("Gas estimate for claim:", gasEstimate.toString());
      console.log("Claim should succeed");
      
      // Actual transaction
      const tx = await signer.sendTransaction({
        to: TIM3CAP_ADDRESS,
        data: claimData,
        gasLimit: gasEstimate * 12n / 10n // Add 20% buffer
      });
      
      console.log("Claim transaction hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("Claim succeeded! Gas used:", receipt?.gasUsed.toString());
    } catch (error: any) {
      console.log("Claim failed:", error.message);
      
      // Try to extract more detailed error
      try {
        await signer.call({
          to: TIM3CAP_ADDRESS,
          data: claimData
        });
      } catch (callError: any) {
        console.log("Detailed error:", callError.message);
      }
    }
  } catch (error: any) {
    console.log("Error in proof creation:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });