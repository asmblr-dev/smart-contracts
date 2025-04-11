// scripts/deploy-debug.ts
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
  
  // Get signer info
  const [signer] = await ethers.getSigners();
  const ownerAddress = await signer.getAddress();
  console.log("Deployer/owner address:", ownerAddress);
  
  // Use the Clones library correctly
  console.log("\nCreating Tim3cap instance with clones...");
  
  // Get the Clones contract factory
  const Clones = await ethers.getContractFactory("Clones");
  const clones = await Clones.deploy();
  await clones.waitForDeployment();
  const clonesAddress = await clones.getAddress();
  console.log("Clones library deployed to:", clonesAddress);
  
  // Create Activity clone
  console.log("Cloning Activity implementation...");
  const activityCloneTx = await clones.clone(holdXNftsImplAddress);
  const activityCloneReceipt = await activityCloneTx.wait();
  
  // Extract the clone address from the transaction receipt
  let activityCloneAddress = "";
  if (activityCloneReceipt && activityCloneReceipt.logs && activityCloneReceipt.logs.length > 0) {
    // The last log should contain the clone address
    const log = activityCloneReceipt.logs[activityCloneReceipt.logs.length - 1];
    try {
      // The clone address should be in the topics or data
      if (log.data && log.data !== '0x') {
        activityCloneAddress = `0x${log.data.substring(26, 66)}`;
      } else if (log.topics && log.topics.length > 1) {
        activityCloneAddress = `0x${log.topics[1].substring(26)}`;
      }
    } catch (e) {
      console.error("Error extracting clone address:", e);
    }
  }
  
  // If we couldn't extract the address, try another approach
  if (!activityCloneAddress || activityCloneAddress === '0x') {
    // Try to predict the address using CREATE2
    const salt = ethers.solidityPacked(['uint256'], [Date.now()]);
    const predictedAddress = await clones.predictDeterministicAddress(
      holdXNftsImplAddress,
      salt
    );
    console.log("Using cloneDeterministic with salt...");
    const deterministicCloneTx = await clones.cloneDeterministic(
      holdXNftsImplAddress,
      salt
    );
    await deterministicCloneTx.wait();
    activityCloneAddress = predictedAddress;
  }
  
  console.log("Activity clone deployed to:", activityCloneAddress);
  
  // Create Reward clone using the same approach
  console.log("Cloning Reward implementation...");
  const salt2 = ethers.solidityPacked(['uint256'], [Date.now() + 1]);
  const predictedRewardAddress = await clones.predictDeterministicAddress(
    nftMintRewardImplAddress,
    salt2
  );
  const rewardCloneTx = await clones.cloneDeterministic(
    nftMintRewardImplAddress,
    salt2
  );
  await rewardCloneTx.wait();
  const rewardCloneAddress = predictedRewardAddress;
  console.log("Reward clone deployed to:", rewardCloneAddress);
  
  // Create Tim3cap clone
  console.log("Cloning Tim3cap implementation...");
  const salt3 = ethers.solidityPacked(['uint256'], [Date.now() + 2]);
  const predictedTim3capAddress = await clones.predictDeterministicAddress(
    tim3capImplAddress,
    salt3
  );
  const tim3capCloneTx = await clones.cloneDeterministic(
    tim3capImplAddress,
    salt3
  );
  await tim3capCloneTx.wait();
  const tim3capCloneAddress = predictedTim3capAddress;
  console.log("Tim3cap clone deployed to:", tim3capCloneAddress);
  
  // Initialize the Activity clone
  console.log("\nInitializing Activity clone...");
  
  // Setup current time for activity dates
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Mock NFT contract for testing (using a dummy address)
  const mockNftContract = "0x0000000000000000000000000000000000000001";
  
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
  
  // Attach to Activity clone
  const activity = await ethers.getContractAt("HoldXNfts", activityCloneAddress);
  
  // Initialize Activity
  const activityInitTx = await activity.initializeClone(activityConfig, ownerAddress);
  await activityInitTx.wait();
  console.log("Activity clone initialized");
  
  // Initialize the Reward clone
  console.log("\nInitializing Reward clone...");
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
  
  // Attach to Reward clone
  const reward = await ethers.getContractAt("NFTMintReward", rewardCloneAddress);
  
  // Initialize Reward (important: pass Tim3cap address as controller)
  const rewardInitTx = await reward.initializeClone(rewardConfig, ownerAddress, tim3capCloneAddress);
  await rewardInitTx.wait();
  console.log("Reward clone initialized with Tim3cap as controller");
  
  // Ensure reward is active
  const isActive = await reward.active();
  if (!isActive) {
    console.log("Activating reward...");
    const activateTx = await reward.activate();
    await activateTx.wait();
    console.log("Reward activated");
  } else {
    console.log("Reward is already active");
  }
  
  // Initialize the Tim3cap clone
  console.log("\nInitializing Tim3cap clone...");
  
  // Setup eligibility config
  const eligibilityConfig = {
    enabled: true,
    signingKey: ownerAddress, // Using deployer as signing key for testing
    proofValidityDuration: 3600, // 1 hour
    requireProofForAllClaims: false
  };
  
  // Attach to Tim3cap clone
  const tim3cap = await ethers.getContractAt("Tim3cap", tim3capCloneAddress);
  
  // Initialize Tim3cap
  const tim3capInitTx = await tim3cap.initialize(
    activityCloneAddress,
    rewardCloneAddress,
    ownerAddress,
    eligibilityConfig,
    ownerAddress, // fee recipient
    250, // fee percentage (2.5%)
    false, // fees enabled
    ethers.ZeroAddress // affiliate
  );
  await tim3capInitTx.wait();
  console.log("Tim3cap clone initialized");
  
  // Set signing key in Activity contract
  console.log("\nSetting signing key in Activity contract...");
  const setSigningKeyTx = await activity.setSigningKey(ownerAddress);
  await setSigningKeyTx.wait();
  console.log("Signing key set to:", ownerAddress);
  
  // Set proof validity duration
  console.log("Setting proof validity duration...");
  const setProofDurationTx = await activity.setProofValidityDuration(3600);
  await setProofDurationTx.wait();
  console.log("Proof validity duration set to 1 hour");
  
  // Verify deployed contracts
  console.log("\nVerifying contracts are properly connected...");
  
  // Check Tim3cap state
  const tim3capState = await tim3cap.debugState();
  console.log("Activity address in Tim3cap:", tim3capState[1]);
  console.log("Reward address in Tim3cap:", tim3capState[2]);
  
  // Check Reward state for controller
  const rewardState = await reward.debugState(ownerAddress);
  console.log("Controller address in Reward:", rewardState[6]);
  
  // Check Activity state for signing key
  const activityState = await activity.debugActivityState();
  console.log("Signing key in Activity:", activityState[5]);
  
  console.log("\nDeployment summary:");
  console.log(`const TIM3CAP_ADDRESS = "${tim3capCloneAddress}";`);
  console.log(`const ACTIVITY_ADDRESS = "${activityCloneAddress}";`);
  console.log(`const REWARD_ADDRESS = "${rewardCloneAddress}";`);
  
  return {
    tim3capAddress: tim3capCloneAddress,
    activityAddress: activityCloneAddress,
    rewardAddress: rewardCloneAddress
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