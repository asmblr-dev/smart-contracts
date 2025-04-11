import { ethers } from "hardhat";

async function main() {
  console.log("Starting deployment for debugging...");
  
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
  
  // Deploy registry
  console.log("\nDeploying registry...");
  const [signer] = await ethers.getSigners();
  const ownerAddress = await signer.getAddress();
  
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = await Tim3capRegistry.deploy(ownerAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("Tim3capRegistry deployed to:", registryAddress);
  
  // Register implementations
  console.log("\nRegistering implementations in registry...");
  await registry.registerActivity("HOLD_X_NFTS", holdXNftsImplAddress);
  await registry.registerReward("NFT_MINT", nftMintRewardImplAddress);
  await registry.setValidCombination("HOLD_X_NFTS", "NFT_MINT", true);
  console.log("Registered HOLD_X_NFTS activity and NFT_MINT reward");
  console.log("Set HOLD_X_NFTS + NFT_MINT as valid combination");
  
  // Deploy factory
  console.log("\nDeploying factory...");
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
  
  // Create Tim3cap instance with minimal proxy pattern
  console.log("\nCreating Tim3cap instance...");
  
  // Setup current time for activity dates
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Create mock NFT contract for testing
  // For this debug version, we'll use the zero address, which will always return 0 balance
  // when queried, making it a good test case for mocked proofs
  const mockNftContract = "0x0000000000000000000000000000000000000001";
  
  // Encode activity config
  console.log("Encoding Activity configuration...");
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
    // Look for the Tim3capDeployed event
    for (const log of receipt.logs) {
      try {
        // Try to find the event by topic
        const eventSignature = "Tim3capDeployed(address,string,string,(bool,address,uint256,bool))";
        const eventTopic = ethers.id(eventSignature);
        
        if (log.topics && log.topics[0] === eventTopic) {
          // Found our event, decode the first parameter (the address)
          tim3capAddress = ethers.dataSlice(log.topics[1], 12); // Extract the address from the topic
          tim3capAddress = "0x" + tim3capAddress;
          break;
        }
      } catch (e) {
        // Skip errors in parsing
      }
    }
  }
  
  // If we couldn't find the address from the event, try by contract code
  if (!tim3capAddress) {
    console.log("Could not find Tim3capDeployed event, trying to identify by code...");
    // Look at transaction trace to identify contract creation
    // This is simplified and may not work in all cases
    tim3capAddress = receipt?.contractAddress || "";
  }
  
  if (!tim3capAddress) {
    console.log("Could not identify the deployed Tim3cap contract address");
    return;
  }
  
  console.log("Tim3cap instance deployed to:", tim3capAddress);
  
  // Get the activity and reward addresses from the Tim3cap instance
  console.log("\nRetrieving Activity and Reward addresses...");
  const tim3cap = Tim3cap.attach(tim3capAddress);
  
  const activityAddress = await tim3cap.activity();
  console.log("Activity contract address:", activityAddress);
  
  const rewardAddress = await tim3cap.reward();
  console.log("Reward contract address:", rewardAddress);
  
  // Ensure reward is active
  const nftReward = NFTMintReward.attach(rewardAddress);
  const isActive = await nftReward.active();
  
  if (!isActive) {
    console.log("\nActivating reward contract...");
    const activateTx = await nftReward.activate();
    await activateTx.wait();
    console.log("Reward contract activated");
  } else {
    console.log("\nReward contract is already active");
  }
  
  // Check if the controller is set correctly
  const controller = await nftReward.controller();
  if (controller.toLowerCase() !== tim3capAddress.toLowerCase()) {
    console.error("\nWARNING: Controller not set correctly in Reward contract!");
    console.log("  Expected:", tim3capAddress);
    console.log("  Actual:", controller);
    
    // If possible, see if we can fix the controller setting
    const rewardOwner = await nftReward.owner();
    if (rewardOwner.toLowerCase() === ownerAddress.toLowerCase()) {
      console.log("Owner matches the deployer - if needed, could add a method to update controller");
    }
  } else {
    console.log("\nController set correctly in Reward contract");
  }
  
  console.log("\nDeployment summary:");
  console.log({
    Tim3cap: tim3capAddress,
    Activity: activityAddress,
    Reward: rewardAddress,
    Owner: ownerAddress,
    Registry: registryAddress,
    Factory: factoryAddress
  });
  
  // Save addresses to a file that can be used by the debug script
  console.log("\nUpdate your debug script with these addresses:");
  console.log(`const TIM3CAP_ADDRESS = "${tim3capAddress}";`);
  console.log(`const ACTIVITY_ADDRESS = "${activityAddress}";`);
  console.log(`const REWARD_ADDRESS = "${rewardAddress}";`);
  
  console.log("\nDeployment complete!");
  
  return {
    tim3capAddress,
    activityAddress,
    rewardAddress,
    registryAddress,
    factoryAddress
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