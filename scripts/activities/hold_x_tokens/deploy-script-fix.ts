// scripts/activities/hold_x_tokens/deploy-script-fix.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing HoldXTokens Deployment with Fixed Config ===");
  
  // Get signers - handle case where we might only have a deployer account on live networks
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, "deployments");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Load deployment data
  const deploymentFile = path.join(outputDir, "base-deployments.json");
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    console.error("Please run deploy-implementation.ts first");
    process.exit(1);
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const contracts = deploymentData.contracts;
  
  console.log("Loaded base deployment data:");
  console.log(`- Tim3cap Factory: ${contracts.factory}`);
  console.log(`- Activity Token: ${contracts.activityToken}`);
  console.log(`- Reward Token: ${contracts.rewardToken}`);
  
  // Step 1: Create broker wallet for token rewards
  console.log("\nCreating broker wallet...");
  const brokerWalletPrivateKey = ethers.Wallet.createRandom().privateKey;
  const brokerWallet = new ethers.Wallet(brokerWalletPrivateKey, deployer.provider);
  console.log(`Broker wallet address: ${brokerWallet.address}`);
  
  // Fund the broker wallet with ETH for gas
  const fundTx = await deployer.sendTransaction({
    to: brokerWallet.address,
    value: ethers.parseEther("0.1") // 0.1 ETH for gas
  });
  await fundTx.wait();
  console.log(`Funded broker wallet with 0.1 ETH for gas`);
  
  // Step 2: Mint activity tokens to the deployer
  console.log("\nMinting activity tokens...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const activityToken = TestToken.attach(contracts.activityToken);
  const rewardToken = TestToken.attach(contracts.rewardToken);
  
  const requiredTokenAmount = ethers.parseUnits("100", 18); // 100 tokens for activity
  await activityToken.mint(deployer.address, requiredTokenAmount);
  console.log(`Minted ${ethers.formatUnits(requiredTokenAmount, 18)} activity tokens to deployer`);
  
  // Mint reward tokens to the broker wallet
  const rewardAmount = ethers.parseUnits("1000", 18); // 1000 tokens for rewards
  await rewardToken.mint(brokerWallet.address, rewardAmount);
  console.log(`Minted ${ethers.formatUnits(rewardAmount, 18)} reward tokens to broker wallet`);
  
  // Step 3: Setup factories
  console.log("\nSetting up contract factories...");
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const factory = await ethers.getContractFactory("Tim3capFactory");
  const tim3capFactory = factory.attach(contracts.factory);
  
  // Step 4: Try deploying with modified activity config structure
  console.log("\n=== Creating Tim3cap Instance with HoldXTokens Activity ===");
  
  const now = Math.floor(Date.now() / 1000);
  
  console.log("Preparing modified activity config...");
  
  // First, let's try by directly retrieving the HoldXTokens source code
  const HoldXTokens = await ethers.getContractFactory("HoldXTokens");
  const holdXTokensImpl = contracts.holdXTokensImpl;
  console.log(`HoldXTokens implementation: ${holdXTokensImpl}`);
  
  // Get the code from the implementation contract
  const code = await deployer.provider.getCode(holdXTokensImpl);
  console.log(`Implementation contract has code: ${code.length > 2 ? "Yes" : "No"}`);
  
  // Experiment with different config structures
  console.log("Testing different token activity config structures...");
  
  // Option 1: Try with exactly 5 parameters as originally designed
  const requiredTokens = ethers.parseUnits("50", 18);
  const tokenConfigOption1 = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256"],
    [
      [contracts.activityToken], // token addresses
      [requiredTokens], // required amounts
      now, // start date
      now + 30 * 24 * 60 * 60, // end date (30 days)
      0 // snapshot date (none)
    ]
  );
  console.log("Option 1 encoded successfully - 5 parameters");
  
  // Option 2: Try with a dummy parameter at the end in case there's a mismatch
  const tokenConfigOption2 = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
    [
      [contracts.activityToken], // token addresses
      [requiredTokens], // required amounts
      now, // start date
      now + 30 * 24 * 60 * 60, // end date (30 days)
      0, // snapshot date (none)
      0 // dummy listing status
    ]
  );
  console.log("Option 2 encoded successfully - 6 parameters with dummy");
  
  // TokenAirdropReward config (unchanged)
  const tokenRewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "address", "uint256", "address", "bool", "uint256"],
    [
      "Token Holder Rewards", // reward name
      contracts.rewardToken, // reward token address
      ethers.parseUnits("20", 18), // 20 tokens per claim
      brokerWallet.address, // broker wallet
      false, // manual claims
      now + 30 * 24 * 60 * 60 // claim end date (30 days)
    ]
  );
  
  // Eligibility config (unchanged)
  const eligibilityConfig = {
    enabled: true,
    signingKey: deployer.address,
    proofValidityDuration: 86400, // 24 hours
    requireProofForAllClaims: false // Allow on-chain eligibility check
  };
  
  // Try deployment with both config options
  console.log("Attempting deployment with 5-parameter structure...");
  try {
    // First try with option 1 (5 parameters)
    const createTx1 = await tim3capFactory.createTim3cap(
      "HOLD_X_TOKENS", // Activity type
      holdXTokensImpl, // Activity implementation
      tokenConfigOption1, // Activity config (5 parameters)
      "TOKEN_AIRDROP", // Reward type
      contracts.tokenAirdropRewardImpl, // Reward implementation
      tokenRewardConfig, // Reward config
      eligibilityConfig, // Eligibility config
      deployer.address, // Origin
      deployer.address, // Creator/Owner
      ethers.ZeroAddress, // No affiliate
      { gasLimit: 10000000 } // High gas limit to avoid estimation issues
    );
    
    console.log(`Create transaction hash (Option 1): ${createTx1.hash}`);
    const receipt1 = await createTx1.wait();
    console.log("Transaction successful with 5 parameters!");
    
    // Process the successful deployment
    processSuccessfulDeployment(receipt1, tim3capFactory, Tim3cap, rewardToken, brokerWallet, outputDir);
    return;
  } catch (error: any) {
    console.log("❌ Deployment with 5 parameters failed:", error.message);
  }
  
  console.log("\nAttempting deployment with 6-parameter structure (with dummy value)...");
  try {
    // Try with option 2 (6 parameters)
    const createTx2 = await tim3capFactory.createTim3cap(
      "HOLD_X_TOKENS", // Activity type
      holdXTokensImpl, // Activity implementation
      tokenConfigOption2, // Activity config (6 parameters with dummy)
      "TOKEN_AIRDROP", // Reward type
      contracts.tokenAirdropRewardImpl, // Reward implementation
      tokenRewardConfig, // Reward config
      eligibilityConfig, // Eligibility config
      deployer.address, // Origin
      deployer.address, // Creator/Owner
      ethers.ZeroAddress, // No affiliate
      { gasLimit: 10000000 } // High gas limit to avoid estimation issues
    );
    
    console.log(`Create transaction hash (Option 2): ${createTx2.hash}`);
    const receipt2 = await createTx2.wait();
    console.log("Transaction successful with 6 parameters!");
    
    // Process the successful deployment
    processSuccessfulDeployment(receipt2, tim3capFactory, Tim3cap, rewardToken, brokerWallet, outputDir);
    return;
  } catch (error: any) {
    console.log("❌ Deployment with 6 parameters failed:", error.message);
  }
  
  console.log("\n=== Neither config option worked ===");
  console.log("Please review the HoldXTokens implementation contract and ensure it's compatible with your factory.");
}

// Helper function to process successful deployment
async function processSuccessfulDeployment(receipt: any, factory: any, Tim3cap: any, rewardToken: any, brokerWallet: any, outputDir: string) {
  // Find the Tim3cap address from the event
  const creationEvent = receipt?.logs.find((log: any) => {
    try {
      const parsed = factory.interface.parseLog({
        topics: log.topics,
        data: log.data
      });
      return parsed?.name === "Tim3capDeployed";
    } catch {
      return false;
    }
  });
  
  if (!creationEvent) {
    throw new Error("Couldn't find Tim3capDeployed event in transaction receipt");
  }
  
  const parsedEvent = factory.interface.parseLog({
    topics: creationEvent.topics,
    data: creationEvent.data
  });
  
  const tim3capAddress = parsedEvent?.args[0];
  console.log(`HoldXTokens Tim3cap instance deployed to: ${tim3capAddress}`);
  
  // Get contract references
  const tim3cap = Tim3cap.attach(tim3capAddress);
  const activityAddress = await tim3cap.activity();
  const rewardAddress = await tim3cap.reward();
  
  console.log(`HoldXTokens Activity: ${activityAddress}`);
  console.log(`Token Airdrop Reward: ${rewardAddress}`);
  
  // Setup broker wallet approval
  console.log("\nSetting up broker wallet approval...");
  
  // Connect the reward token using broker wallet
  const rewardTokenWithBroker = rewardToken.connect(brokerWallet);
  
  // Approve tokens for token rewards
  const approveAmount = ethers.parseUnits("1000", 18); // Approve 1000 tokens
  
  const approveTx = await rewardTokenWithBroker.approve(rewardAddress, approveAmount);
  await approveTx.wait();
  console.log(`Broker approved ${ethers.formatUnits(approveAmount, 18)} tokens for token activity reward`);
  
  // Save instance data to a file
  const instanceData = {
    networkId: (await ethers.provider.getNetwork()).chainId.toString(),
    tokenActivityInstance: {
      tim3cap: tim3capAddress,
      activity: activityAddress,
      reward: rewardAddress,
      activityType: "HOLD_X_TOKENS"
    },
    brokerWallet: {
      address: brokerWallet.address,
      privateKey: brokerWallet.privateKey
    },
    timestamp: new Date().toISOString()
  };
  
  const instanceFile = path.join(outputDir, "token-activity-instance.json");
  fs.writeFileSync(instanceFile, JSON.stringify(instanceData, null, 2));
  console.log(`\nInstance data saved to ${instanceFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });