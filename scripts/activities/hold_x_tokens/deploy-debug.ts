// scripts/activities/hold_x_tokens/deploy-debug.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing HoldXTokens Deployment ===");
  
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
  
  // Step 1: Check registry settings
  console.log("\n=== Checking Registry Configuration ===");
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = Tim3capRegistry.attach(contracts.registry);
  
  // Verify implementations are registered
  const holdTokensImpl = await registry.getActivityImplementation("HOLD_X_TOKENS");
  console.log(`HOLD_X_TOKENS implementation in registry: ${holdTokensImpl}`);
  console.log(`HOLD_X_TOKENS implementation in deployment data: ${contracts.holdXTokensImpl}`);
  
  const tokenAirdropImpl = await registry.getRewardImplementation("TOKEN_AIRDROP");
  console.log(`TOKEN_AIRDROP implementation in registry: ${tokenAirdropImpl}`);
  console.log(`TOKEN_AIRDROP implementation in deployment data: ${contracts.tokenAirdropRewardImpl}`);
  
  // Verify combination is valid
  const isValidCombo = await registry.isValidCombination("HOLD_X_TOKENS", "TOKEN_AIRDROP");
  console.log(`Is HOLD_X_TOKENS + TOKEN_AIRDROP valid: ${isValidCombo}`);
  
  // If implementations don't match, register them
  if (holdTokensImpl !== contracts.holdXTokensImpl) {
    console.log("Updating HoldXTokens implementation in registry...");
    await registry.registerActivity("HOLD_X_TOKENS", contracts.holdXTokensImpl);
    console.log("HoldXTokens implementation updated");
  }
  
  if (tokenAirdropImpl !== contracts.tokenAirdropRewardImpl) {
    console.log("Updating TokenAirdropReward implementation in registry...");
    await registry.registerReward("TOKEN_AIRDROP", contracts.tokenAirdropRewardImpl);
    console.log("TokenAirdropReward implementation updated");
  }
  
  if (!isValidCombo) {
    console.log("Setting HOLD_X_TOKENS + TOKEN_AIRDROP as valid combination...");
    await registry.setValidCombination("HOLD_X_TOKENS", "TOKEN_AIRDROP", true);
    console.log("Combination set as valid");
  }
  
  // Step 2: Create broker wallet for token rewards
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
  
  // Step 3: Mint activity tokens to the deployer
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
  
  // Step 4: Setup factories and test token activity deployment only
  console.log("\nSetting up contract factories...");
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const HoldXTokens = await ethers.getContractFactory("HoldXTokens");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const factory = await ethers.getContractFactory("Tim3capFactory");
  const tim3capFactory = factory.attach(contracts.factory);
  
  // Check factory authorization
  console.log("Checking factory authorization...");
  const isAuthorizedOrigin = await tim3capFactory.authorizedOrigins(deployer.address);
  console.log(`Is deployer authorized origin: ${isAuthorizedOrigin}`);
  
  if (!isAuthorizedOrigin) {
    console.log("Authorizing deployer as origin...");
    await tim3capFactory.updateAuthorizedOrigin(deployer.address, true);
    console.log("Deployer authorized as origin");
  }
  
  console.log("\n=== Creating Tim3cap Instance with HoldXTokens Activity ===");
  
  // Simplify the activity config for debugging
  const now = Math.floor(Date.now() / 1000);
  
  console.log("Preparing HoldXTokens activity config...");
  console.log(`Activity token address: ${contracts.activityToken}`);
  
  // HoldXTokens activity config
  const requiredTokens = ethers.parseUnits("50", 18); // Require 50 tokens
  try {
    const tokenActivityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "uint256", "uint256", "uint256"],
      [
        [contracts.activityToken],
        [requiredTokens],
        now, // start date
        now + 30 * 24 * 60 * 60, // end date (30 days)
        0 // snapshot date (none)
      ]
    );
    console.log("Activity config encoded successfully");
    
    // TokenAirdropReward config
    console.log("Preparing TokenAirdropReward config...");
    console.log(`Reward token address: ${contracts.rewardToken}`);
    console.log(`Broker wallet address: ${brokerWallet.address}`);
    
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
    console.log("Reward config encoded successfully");
    
    // Eligibility config
    const eligibilityConfig = {
      enabled: true,
      signingKey: deployer.address,
      proofValidityDuration: 86400, // 24 hours
      requireProofForAllClaims: false // Allow on-chain eligibility check
    };
    
    // Attempt to create TimeCap with simplified params and more detailed error tracking
    console.log("Creating Tim3cap instance with HoldXTokens...");
    try {
      console.log(`Using activity implementation: ${contracts.holdXTokensImpl}`);
      console.log(`Using reward implementation: ${contracts.tokenAirdropRewardImpl}`);
      
      const gasEstimate = await tim3capFactory.createTim3cap.estimateGas(
        "HOLD_X_TOKENS", // Activity type
        contracts.holdXTokensImpl, // Activity implementation
        tokenActivityConfig, // Activity config
        "TOKEN_AIRDROP", // Reward type
        contracts.tokenAirdropRewardImpl, // Reward implementation
        tokenRewardConfig, // Reward config
        eligibilityConfig, // Eligibility config
        deployer.address, // Origin
        deployer.address, // Creator/Owner
        ethers.ZeroAddress // No affiliate
      ).catch(error => {
        console.log("❌ Gas estimation failed with error:", error.message);
        return null;
      });
      
      if (gasEstimate === null) {
        console.log("Skipping transaction attempt due to failed gas estimation");
      } else {
        console.log(`Gas estimation successful: ${gasEstimate.toString()}`);
        
        const createTokenTx = await tim3capFactory.createTim3cap(
          "HOLD_X_TOKENS", // Activity type
          contracts.holdXTokensImpl, // Activity implementation
          tokenActivityConfig, // Activity config
          "TOKEN_AIRDROP", // Reward type
          contracts.tokenAirdropRewardImpl, // Reward implementation
          tokenRewardConfig, // Reward config
          eligibilityConfig, // Eligibility config
          deployer.address, // Origin
          deployer.address, // Creator/Owner
          ethers.ZeroAddress, // No affiliate
          { gasLimit: gasEstimate.toString() } // Use estimated gas
        );
        
        console.log(`Create transaction hash: ${createTokenTx.hash}`);
        const tokenReceipt = await createTokenTx.wait();
        console.log("Transaction successful!");
        
        // Find the Tim3cap address from the event
        const tokenCreationEvent = tokenReceipt?.logs.find((log: any) => {
          try {
            const parsed = tim3capFactory.interface.parseLog({
              topics: log.topics,
              data: log.data
            });
            return parsed?.name === "Tim3capDeployed";
          } catch {
            return false;
          }
        });
        
        if (!tokenCreationEvent) {
          throw new Error("Couldn't find Tim3capDeployed event in transaction receipt");
        }
        
        const tokenParsedEvent = tim3capFactory.interface.parseLog({
          topics: tokenCreationEvent.topics,
          data: tokenCreationEvent.data
        });
        
        const tokenTim3capAddress = tokenParsedEvent?.args[0];
        console.log(`HoldXTokens Tim3cap instance deployed to: ${tokenTim3capAddress}`);
        
        // Get contract references
        const tokenTim3cap = Tim3cap.attach(tokenTim3capAddress);
        const tokenActivityAddress = await tokenTim3cap.activity();
        const tokenRewardAddress = await tokenTim3cap.reward();
        
        console.log(`HoldXTokens Activity: ${tokenActivityAddress}`);
        console.log(`Token Airdrop Reward: ${tokenRewardAddress}`);
        
        // Step 5: Setup broker wallet approval
        console.log("\nSetting up broker wallet approval...");
        
        // Connect the reward token using broker wallet
        const rewardTokenWithBroker = rewardToken.connect(brokerWallet);
        
        // Approve tokens for token rewards
        const approveAmount = ethers.parseUnits("1000", 18); // Approve 1000 tokens
        
          // @ts-ignore: TypeScript doesn't know about the claim method
        const approveTokenTx = await rewardTokenWithBroker.approve(tokenRewardAddress, approveAmount);
        await approveTokenTx.wait();
        console.log(`Broker approved ${ethers.formatUnits(approveAmount, 18)} tokens for token activity reward`);
        
        // Save instance data to a file
        const instanceData = {
          networkId: (await ethers.provider.getNetwork()).chainId.toString(),
          deployedBy: deployer.address,
          tokenActivityInstance: {
            tim3cap: tokenTim3capAddress,
            activity: tokenActivityAddress,
            reward: tokenRewardAddress,
            activityType: "HOLD_X_TOKENS"
          },
          brokerWallet: {
            address: brokerWallet.address,
            privateKey: brokerWalletPrivateKey
          },
          timestamp: new Date().toISOString()
        };
        
        const instanceFile = path.join(outputDir, "token-activity-instance.json");
        fs.writeFileSync(instanceFile, JSON.stringify(instanceData, null, 2));
        console.log(`\nInstance data saved to ${instanceFile}`);
      }
    } catch (error: any) {
      console.log("❌ Transaction execution failed with error:", error.message);
      
      // Try to get more details from the error
      if (error.data) {
        console.log("Error data:", error.data);
      }
      
      // Try direct deployment of HoldXTokens for diagnosis
      console.log("\nAttempting direct deployment of HoldXTokens for diagnosis...");
      try {
        const directHoldXTokens = await HoldXTokens.deploy();
        await directHoldXTokens.waitForDeployment();
        const directAddress = await directHoldXTokens.getAddress();
        console.log(`Direct HoldXTokens deployed to: ${directAddress}`);
        
        // Try initializing it directly
        console.log("Attempting direct initialization...");
        const initTx = await directHoldXTokens.initialize(tokenActivityConfig);
        await initTx.wait();
        console.log("Direct initialization successful");
      } catch (directError: any) {
        console.log("❌ Direct deployment/initialization failed:", directError.message);
      }
    }
  } catch (configError: any) {
    console.log("❌ Configuration encoding failed:", configError.message);
  }
  
  console.log("\n=== Debug Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });