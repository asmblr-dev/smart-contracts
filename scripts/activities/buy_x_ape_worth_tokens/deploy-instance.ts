// scripts/activities/buy_x_apecoin_worth_of_tokens/deploy-instance.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Creating Tim3cap Instance with BuyXApecoinWorthOfTokens Activity ===");
  
  // Get signers
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
  console.log(`- BuyXApecoinWorthOfTokens Implementation: ${contracts.buyXApecoinWorthOfTokensImpl}`);
  console.log(`- TokenAirdropReward Implementation: ${contracts.tokenAirdropRewardImpl}`);
  console.log(`- Token: ${contracts.token}`);
  console.log(`- APE Coin: ${contracts.apeCoin}`);
  console.log(`- Reward Token: ${contracts.rewardToken}`);
  
  // Create broker wallet for token rewards
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
  
  // Mint APE and tokens to the deployer
  console.log("\nMinting tokens...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const token = TestToken.attach(contracts.token);
  const apeCoin = TestToken.attach(contracts.apeCoin);
  const rewardToken = TestToken.attach(contracts.rewardToken);
  
  // Mint some APE to the deployer
  const apeAmount = ethers.parseUnits("1000", 18); // 1000 APE
  await apeCoin.mint(deployer.address, apeAmount);
  console.log(`Minted ${ethers.formatUnits(apeAmount, 18)} APE to deployer`);
  
  // Mint some purchase tokens to the deployer
  const tokenAmount = ethers.parseUnits("1000", 18); // 1000 tokens
  await token.mint(deployer.address, tokenAmount);
  console.log(`Minted ${ethers.formatUnits(tokenAmount, 18)} tokens to deployer`);
  
  // Mint reward tokens to the broker wallet
  const rewardAmount = ethers.parseUnits("1000", 18); // 1000 tokens for rewards
  await rewardToken.mint(brokerWallet.address, rewardAmount);
  console.log(`Minted ${ethers.formatUnits(rewardAmount, 18)} reward tokens to broker wallet`);
  
  // Setup contract factories
  console.log("\nSetting up contract factories...");
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const BuyXApecoinWorthOfTokens = await ethers.getContractFactory("BuyXApecoinWorthOfTokens");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const factory = await ethers.getContractFactory("Tim3capFactory");
  const tim3capFactory = factory.attach(contracts.factory);
  
  // Prepare config data
  const now = Math.floor(Date.now() / 1000);
  const requiredApecoinAmount = ethers.parseUnits("50", 18); // Require 50 APE spent
  
  // Prepare activity config - 6 parameter structure for BuyXApecoinWorthOfTokens
  const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256", "uint256", "uint256"],
    [
      contracts.token,             // token address
      contracts.apeCoin,           // APE Coin address
      requiredApecoinAmount,       // required APE amount
      now,                         // start date
      now + 30 * 24 * 60 * 60,     // end date (30 days)
      ethers.parseUnits("5", 18)   // min purchase amount (5 APE)
    ]
  );
  
  // Prepare token airdrop reward config (7 parameters for TokenAirdropReward)
  const tokenPerUser = ethers.parseUnits("20", 18); // 20 tokens per user
  const totalAmount = ethers.parseUnits("2000", 18); // Total amount for all rewards
  
  const tokenRewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "address", "uint256", "uint256", "address", "bool", "uint256"],
    [
      "APE Purchase Rewards",       // reward name
      contracts.rewardToken,        // reward token address
      tokenPerUser,                 // tokens per claim
      totalAmount,                  // total amount reserved for all claims
      brokerWallet.address,         // broker wallet
      false,                        // manual claims (not automatic)
      now + 30 * 24 * 60 * 60       // claim end date (30 days)
    ]
  );
  
  // Eligibility config
  const eligibilityConfig = {
    enabled: true,
    signingKey: deployer.address,
    proofValidityDuration: 86400, // 24 hours
    requireProofForAllClaims: false // Allow on-chain eligibility check
  };
  
  // Create Tim3cap instance with BuyXApecoinWorthOfTokens via Factory
  console.log("\nCreating Tim3cap instance with BuyXApecoinWorthOfTokens activity via Factory...");
  
  try {
    const createTokenTx = await tim3capFactory.createTim3cap(
      "BUY_X_APECOIN_WORTH_OF_TOKENS",   // Activity type
      contracts.buyXApecoinWorthOfTokensImpl, // Activity implementation
      activityConfig,                    // Activity config
      "TOKEN_AIRDROP",                   // Reward type
      contracts.tokenAirdropRewardImpl,  // Reward implementation
      tokenRewardConfig,                 // Reward config
      eligibilityConfig,                 // Eligibility config
      deployer.address,                  // Origin
      deployer.address,                  // Creator/Owner
      ethers.ZeroAddress,                // No affiliate
      { gasLimit: 10000000 }             // High gas limit to avoid estimation issues
    );
    
    console.log(`Create transaction hash: ${createTokenTx.hash}`);
    console.log("Waiting for transaction confirmation...");
    const tokenReceipt = await createTokenTx.wait();
    console.log("✅ Transaction successful!");
    
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
    console.log(`BuyXApecoinWorthOfTokens Tim3cap instance deployed to: ${tokenTim3capAddress}`);
    
    // Get contract references
    const tokenTim3cap = Tim3cap.attach(tokenTim3capAddress);
    const tokenActivityAddress = await tokenTim3cap.activity();
    const tokenRewardAddress = await tokenTim3cap.reward();
    
    console.log(`BuyXApecoinWorthOfTokens Activity: ${tokenActivityAddress}`);
    console.log(`Token Airdrop Reward: ${tokenRewardAddress}`);
    
    // Setup broker wallet approval
    console.log("\nSetting up broker wallet approval...");
    
    // Connect the reward token using broker wallet
    const rewardTokenWithBroker = rewardToken.connect(brokerWallet);
    
    // Approve tokens for reward
    const approveAmount = ethers.parseUnits("1000", 18); // Approve 1000 tokens
    // @ts-ignore: TypeScript doesn't know about the claim method
    const approveTx = await rewardTokenWithBroker.approve(tokenRewardAddress, approveAmount);
    await approveTx.wait();
    console.log(`Broker approved ${ethers.formatUnits(approveAmount, 18)} tokens for APE purchase activity reward`);
    
    // Save instance data to a file
    const instanceData = {
      networkId: (await ethers.provider.getNetwork()).chainId.toString(),
      apePurchaseInstance: {
        tim3cap: tokenTim3capAddress,
        activity: tokenActivityAddress,
        reward: tokenRewardAddress,
        activityType: "BUY_X_APECOIN_WORTH_OF_TOKENS"
      },
      brokerWallet: {
        address: brokerWallet.address,
        privateKey: brokerWalletPrivateKey
      },
      timestamp: new Date().toISOString()
    };
    
    const instanceFile = path.join(outputDir, "ape-token-purchase-instance.json");
    fs.writeFileSync(instanceFile, JSON.stringify(instanceData, null, 2));
    console.log(`\nInstance data saved to ${instanceFile}`);
    
    console.log("\n=== BuyXApecoinWorthOfTokens Instance Deployment Completed Successfully ===");
    
  } catch (error: any) {
    console.log("❌ Tim3cap deployment failed:", error.message);
    console.log("This suggests an issue with the factory or the activity/reward contract interaction.");
    
    // Additional debugging information
    console.log("\nAttempting to get more debugging information...");
    try {
      // Check if the BuyXApecoinWorthOfTokens implementation is correctly registered
      const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
      const registry = Tim3capRegistry.attach(contracts.registry);
      
      const buyXApeTokensImpl = await registry.getActivityImplementation("BUY_X_APECOIN_WORTH_OF_TOKENS");
      console.log(`BUY_X_APECOIN_WORTH_OF_TOKENS implementation in registry: ${buyXApeTokensImpl}`);
      
      const tokenAirdropImpl = await registry.getRewardImplementation("TOKEN_AIRDROP");
      console.log(`TOKEN_AIRDROP implementation in registry: ${tokenAirdropImpl}`);
      
      const isValidCombo = await registry.isValidCombination("BUY_X_APECOIN_WORTH_OF_TOKENS", "TOKEN_AIRDROP");
      console.log(`Is BUY_X_APECOIN_WORTH_OF_TOKENS + TOKEN_AIRDROP valid: ${isValidCombo}`);
      
      // Check if the deployer is authorized
      const isAuthorizedOrigin = await tim3capFactory.authorizedOrigins(deployer.address);
      console.log(`Is deployer authorized origin: ${isAuthorizedOrigin}`);
      
      // Try to validate the config data with BuyXApecoinWorthOfTokens contract
      try {
        const buyXApeTokensContract = BuyXApecoinWorthOfTokens.attach(contracts.buyXApecoinWorthOfTokensImpl);
        const isConfigValid = await buyXApeTokensContract.validateConfig(activityConfig);
        console.log(`Is activity config valid according to contract: ${isConfigValid}`);
      } catch (validateError: any) {
        console.log(`Config validation check failed: ${validateError.message}`);
      }
    } catch (debugError: any) {
      console.log(`Debug information gathering failed: ${debugError.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });