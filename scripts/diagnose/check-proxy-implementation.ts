// scripts/check-proxy-implementation.ts
// This script checks if your contracts are proxies and tries to identify the implementation
import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Checking Proxy Implementation Details ===");
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);

  // Replace with your deployed contract addresses
  const TIM3CAP_ADDRESS = "0x58bb45d627299728BE605FAe21ee300010C89Aa4";
  const ACTIVITY_ADDRESS = "0x5077D8f8D5C783C659BbeE92Ee199cc1E37Af07a";
  const REWARD_ADDRESS = "0xB2aED8262Bf8125849309Bc924fDe6D1D182a62a";

  // Contracts to check
  const contracts = [
    { name: "Tim3cap", address: TIM3CAP_ADDRESS },
    { name: "Activity", address: ACTIVITY_ADDRESS },
    { name: "Reward", address: REWARD_ADDRESS }
  ];

  for (const contract of contracts) {
    console.log(`\n--- Analyzing ${contract.name} Contract at ${contract.address} ---`);
    
    // Get the bytecode
    const bytecode = await ethers.provider.getCode(contract.address);
    console.log(`Bytecode size: ${(bytecode.length - 2) / 2} bytes`);
    
    // Check if it's a minimal proxy (EIP-1167)
    const isMinimalProxy = bytecode.startsWith("0x363d3d373d3d3d363d73");
    if (isMinimalProxy) {
      console.log("Contract appears to be a minimal proxy (EIP-1167)");
      
      // Extract the implementation address from the bytecode
      // Format: 0x363d3d373d3d3d363d73[implementation address]5af43d82803e903d91602b57fd5bf3
      const implAddress = "0x" + bytecode.slice(22, 62);
      console.log(`Implementation address from bytecode: ${implAddress}`);
      
      // Check if the implementation has code
      const implCode = await ethers.provider.getCode(implAddress);
      console.log(`Implementation has code: ${implCode !== "0x"}`);
      console.log(`Implementation code size: ${(implCode.length - 2) / 2} bytes`);
      
      // Try to get the implementation type by checking common function selectors
      await checkImplementationType(implAddress, signer);
    } else {
      console.log("Contract does not appear to be a minimal proxy");
      // Check if it might be another type of proxy (e.g. transparent proxy)
      await checkForOtherProxyTypes(contract.address, signer);
    }
    
    // Try to check initialization status
    await checkInitializationStatus(contract.address, signer);
  }
}

async function checkImplementationType(implAddress: string, signer: any) {
  console.log("\nChecking implementation contract type...");
  
  // Common function selectors for each contract type
  const typeSignatures = {
    "Tim3cap": ["activity()", "reward()", "claim(bytes,uint256,bytes32[])"],
    "HoldXNfts": ["getActivityType()", "checkEligibility(address)", "verifyEligibilityProof(address,bytes)"],
    "NFTMintReward": ["getRewardType()", "canClaim(address)", "claim(address)"]
  };
  
  // Convert to selectors
  const typeSelectors: Record<string, string[]> = {};
  for (const [type, sigs] of Object.entries(typeSignatures)) {
    typeSelectors[type] = sigs.map(sig => 
      ethers.keccak256(ethers.toUtf8Bytes(sig)).substring(0, 10)
    );
  }
  
  // Count matches for each type
  const counts: Record<string, number> = {
    "Tim3cap": 0,
    "HoldXNfts": 0,
    "NFTMintReward": 0
  };
  
  for (const [type, selectors] of Object.entries(typeSelectors)) {
    for (const selector of selectors) {
      try {
        await signer.call({
          to: implAddress,
          data: selector
        });
        // If call doesn't throw, the function likely exists
        counts[type]++;
      } catch (error: any) {
        // We expect an error, but we want to check if it's due to the function existing but reverting
        const errorMsg = error.message;
        if (!errorMsg.includes("function selector was not recognized") && 
            !errorMsg.includes("invalid opcode")) {
          // Function likely exists but reverted for other reasons
          counts[type]++;
        }
      }
    }
  }
  
  // Determine most likely contract type
  let mostLikelyType = "";
  let highestCount = 0;
  
  for (const [type, count] of Object.entries(counts)) {
    console.log(`- ${type} match score: ${count}/${typeSelectors[type].length}`);
    if (count > highestCount) {
      highestCount = count;
      mostLikelyType = type;
    }
  }
  
  console.log(`Most likely implementation type: ${mostLikelyType}`);
}

async function checkForOtherProxyTypes(address: string, signer: any) {
  console.log("\nChecking for other proxy patterns...");
  
  // Check for common implementation slots in various proxy patterns
  const implementationSlots = [
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", // EIP-1967 implementation slot
    "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"  // OpenZeppelin TransparentUpgradeableProxy
  ];
  
  for (const slot of implementationSlots) {
    try {
      const storage = await ethers.provider.getStorage(address, slot);
      const implAddress = ethers.getAddress("0x" + storage.slice(26));
      
      if (implAddress !== ethers.ZeroAddress) {
        console.log(`Found potential implementation at ${implAddress} using slot ${slot}`);
        
        // Check if the implementation has code
        const implCode = await ethers.provider.getCode(implAddress);
        console.log(`Implementation has code: ${implCode !== "0x"}`);
        console.log(`Implementation code size: ${(implCode.length - 2) / 2} bytes`);
        
        // Try to identify the implementation type
        await checkImplementationType(implAddress, signer);
        return;
      }
    } catch (error) {
      console.log(`Error checking slot ${slot}:`, error);
    }
  }
  
  console.log("Could not identify as a proxy using common storage slots");
}

async function checkInitializationStatus(address: string, signer: any) {
  console.log("\nChecking initialization status...");
  
  // Common initialization slots
  const initializationSlots = [
    "0x0000000000000000000000000000000000000000000000000000000000000000", // Common slot for _initialized
    "0x0000000000000000000000000000000000000000000000000000000000000001", // Another common slot
    "0x0000000000000000000000000000000000000000000000000000000000000002"  // Another possibility
  ];
  
  for (const slot of initializationSlots) {
    try {
      const storage = await ethers.provider.getStorage(address, slot);
      console.log(`Storage at slot ${slot}: ${storage}`);
      
      // Check if the last byte is 1 (often indicates initialized)
      if (storage.endsWith("1")) {
        console.log(`Contract may be initialized (found '1' in storage slot ${slot})`);
      } else if (storage === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        console.log(`Storage slot ${slot} is empty (may indicate not initialized)`);
      }
    } catch (error) {
      console.log(`Error checking slot ${slot}:`, error);
    }
  }
  
  // Try to call initializer functions to see if they fail (as they should if already initialized)
  const initFunctions = [
    "0x8129fc1c", // initialize()
    "0xc4d66de8", // initialize(address)
    "0xf8c8765e"  // initialize(bytes)
  ];
  
  for (const selector of initFunctions) {
    try {
      // Call with a dummy value that will almost certainly revert
      await signer.call({
        to: address,
        data: selector + "000000000000000000000000" + signer.address.slice(2)
      });
      console.log(`Init function ${selector} did not revert - contract might not be initialized!`);
    } catch (error: any) {
      if (error.message.includes("already initialized") || 
          error.message.includes("initialization")) {
        console.log(`Init function ${selector} reverted with 'already initialized' - good sign`);
      } else if (error.message.includes("function selector was not recognized")) {
        console.log(`Init function ${selector} not found on contract`);
      } else {
        console.log(`Init function ${selector} reverted with other error:`, error.message);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });