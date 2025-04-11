// scripts/simple-deploy.ts
import { ethers } from "hardhat";

async function main() {
  console.log("Starting deployment...");
  
  // Deploy implementation contracts
  console.log("\nDeploying implementation contracts...");
  
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const tim3capImpl = await Tim3cap.deploy();
  await tim3capImpl.waitForDeployment();
  const tim3capImplAddress = await tim3capImpl.getAddress();
  console.log("Tim3cap implementation deployed to:", tim3capImplAddress);
  
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const holdXNftsImpl = await HoldXNfts.deploy();
  await holdXNftsImpl.waitForDeployment();
  const holdXNftsImplAddress = await holdXNftsImpl.getAddress();
  console.log("HoldXNfts implementation deployed to:", holdXNftsImplAddress);
  
  const NFTMintReward = await ethers.getContractFactory("NFTMintReward");
  const nftMintRewardImpl = await NFTMintReward.deploy();
  await nftMintRewardImpl.waitForDeployment();
  const nftMintRewardImplAddress = await nftMintRewardImpl.getAddress();
  console.log("NFTMintReward implementation deployed to:", nftMintRewardImplAddress);
  
  // Get signer info
  const [signer] = await ethers.getSigners();
  const ownerAddress = await signer.getAddress();
  console.log("Deployer/owner address:", ownerAddress);
  
  // Deploy registry
  console.log("\nDeploying Tim3capRegistry...");
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = await Tim3capRegistry.deploy(ownerAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("Tim3capRegistry deployed to:", registryAddress);
  
  // Register implementations
  console.log("Registering activity and reward types...");
  await registry.registerActivity("HOLD_X_NFTS", holdXNftsImplAddress);
  await registry.registerReward("NFT_MINT", nftMintRewardImplAddress);
  await registry.setValidCombination("HOLD_X_NFTS", "NFT_MINT", true);
  console.log("Activity and reward types registered");
  
  // Deploy factory
  console.log("\nDeploying Tim3capFactory...");
  const Tim3capFactory = await ethers.getContractFactory("Tim3capFactory");
  const factory = await Tim3capFactory.deploy(
    tim3capImplAddress,
    registryAddress,
    ownerAddress, // Deployer wallet
    ownerAddress, // Fee recipient
    250 // Fee percentage (2.5%)
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("Tim3capFactory deployed to:", factoryAddress);
  
  // Setup current time for activity dates
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Mock NFT contract for testing
  const mockNftContract = "0x0000000000000000000000000000000000000001";
  
  // Encode activity config
  console.log("\nEncoding Activity configuration...");
  const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
    [
      [mockNftContract], // Contract addresses
      [1], // Required amounts
      currentTime - 3600, // startDate (1 hour ago)
      currentTime + 86400, // endDate (24 hours from now) 
      0, // snapshotDate (0 for no snapshot)
      0 // listingStatus (0 for any)
    ]
  );
  
  // Encode reward config
  console.log("Encoding Reward configuration...");
  const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "uint256", "bool", "address", "uint96"],
    [
      "DebugNFT", // name
      "DBG", // symbol
      "Debug NFT Collection", // description
      100, // maxSupply
      false, // isRandomized
      ownerAddress, // royaltyRecipient
      250 // royaltyPercentage (2.5%)
    ]
  );
  
  // Setup eligibility config
  const eligibilityConfig = {
    enabled: true,
    signingKey: ownerAddress, // Using deployer as signing key for test
    proofValidityDuration: 3600, // 1 hour
    requireProofForAllClaims: false
  };
  
  console.log("Creating Tim3cap instance via factory...");
  const createTx = await factory.createTim3cap(
    "HOLD_X_NFTS", // activityType
    holdXNftsImplAddress, // activityImplementation
    activityConfig, // activityConfig
    "NFT_MINT", // rewardType
    nftMintRewardImplAddress, // rewardImplementation
    rewardConfig, // rewardConfig
    eligibilityConfig, // eligibilityConfig
    ownerAddress, // origin
    ownerAddress, // creator
    ethers.ZeroAddress // affiliate
  );
  
  console.log("Create transaction sent:", createTx.hash);
  console.log("Waiting for transaction confirmation...");
  
  const receipt = await createTx.wait();
  
  // Find Tim3cap deployed address from event
  let tim3capAddress = "";
  if (receipt && receipt.logs) {
    // Log all events for debugging
    console.log("\nFound events in receipt:");
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`Log ${i}:`, {
        address: log.address,
        topics: log.topics,
        data: log.data.slice(0, 66) + (log.data.length > 66 ? '...' : '')
      });
    }
    
    // Look for the Tim3capDeployed event
    for (const log of receipt.logs) {
      try {
        // Try to find the event by topic or signature
        if (log.topics && log.topics.length > 0) {
          const topic = log.topics[0];
          if (topic === ethers.id("Tim3capDeployed(address,string,string,(bool,address,uint256,bool))")) {
            console.log("Found Tim3capDeployed event");
            // Extract address from event data
            const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(
              ['address'], ethers.dataSlice(log.topics[1], 12)
            );
            tim3capAddress = decodedData[0];
            console.log("Extracted Tim3cap address:", tim3capAddress);
            break;
          }
        }
      } catch (e) {
        console.log("Error parsing log:", e.message);
      }
    }
  }
  
  if (!tim3capAddress) {
    console.log("Could not find Tim3capDeployed event, scanning for contract creation");
    
    // If we couldn't find the address from the event, try to get it from transaction receipt
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      // Look for contract creation events - often the first contract created in a transaction
      if (log.topics.length > 0 && log.data && log.data.length >= 66) {
        try {
          // This is a heuristic - the last contract created is likely our Tim3cap
          console.log(`Potential contract address in log ${i}:`, log.address);
          tim3capAddress = log.address;
        } catch (e) {
          // Skip
        }
      }
    }
  }
  
  if (!tim3capAddress) {
    console.error("Could not identify the deployed Tim3cap contract address");
    return;
  }
  
  console.log("\nTim3cap instance deployed to:", tim3capAddress);
  
  // Get the activity and reward addresses from the Tim3cap instance
  console.log("\nRetrieving Activity and Reward addresses...");
  const tim3cap = await ethers.getContractAt("Tim3cap", tim3capAddress);
  
  const tim3capState = await tim3cap.debugState();
  const activityAddress = tim3capState.activityAddr;
  const rewardAddress = tim3capState.rewardAddr;
  
  console.log("Activity contract address:", activityAddress);
  console.log("Reward contract address:", rewardAddress);
  
  // Get the activity and reward contracts
  const activity = await ethers.getContractAt("HoldXNfts", activityAddress);
  const reward = await ethers.getContractAt("NFTMintReward", rewardAddress);
  
  // Set proof validity duration if needed
  console.log("\nChecking proof validity duration...");
  const activityState = await activity.debugActivityState();
  if (activityState.proofDuration.toString() === "0") {
    console.log("Setting proof validity duration to 1 hour...");
    const setProofDurationTx = await activity.setProofValidityDuration(3600);
    await setProofDurationTx.wait();
    console.log("Proof validity duration set");
  } else {
    console.log("Proof validity duration already set to:", activityState.proofDuration.toString());
  }
  
  // Check controller in reward
  console.log("\nChecking controller setting in reward contract...");
  const rewardState = await reward.debugState(ownerAddress);
  console.log("Controller in reward:", rewardState.controllerAddr);
  console.log("Tim3cap address:", tim3capAddress);
  if (rewardState.controllerAddr.toLowerCase() !== tim3capAddress.toLowerCase()) {
    console.warn("⚠️ Controller mismatch detected! This will cause claims to fail.");
  } else {
    console.log("✓ Controller correctly set to Tim3cap address");
  }
  
  // Ensure reward is active
  console.log("\nChecking reward active status...");
  if (!rewardState.isActive) {
    console.log("Activating reward...");
    const activateTx = await reward.activate();
    await activateTx.wait();
    console.log("Reward activated");
  } else {
    console.log("✓ Reward is already active");
  }
  
  console.log("\nDeployment summary:");
  console.log({
    Tim3cap: tim3capAddress,
    Activity: activityAddress,
    Reward: rewardAddress,
    Registry: registryAddress,
    Factory: factoryAddress
  });
  
  console.log("\nUpdate your debug script with these addresses:");
  console.log(`const TIM3CAP_ADDRESS = "${tim3capAddress}";`);
  console.log(`const ACTIVITY_ADDRESS = "${activityAddress}";`);
  console.log(`const REWARD_ADDRESS = "${rewardAddress}";`);
  
  return {
    tim3capAddress,
    activityAddress,
    rewardAddress
  };
}

main()
  .then((addresses) => {
    console.log("Deployment succeeded");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });