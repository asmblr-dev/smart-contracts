// scripts/token_airdrop/deploy-instance.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Creating New Tim3cap Instance with TokenAirdropReward ===");
  
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
  console.log(`- Test NFT: ${contracts.testNFT}`);
  console.log(`- Test Token: ${contracts.testToken}`);
  
  // Step 1: Create a broker wallet
  console.log("\nCreating broker wallet...");
  const brokerWalletPrivateKey = ethers.Wallet.createRandom().privateKey;
  const brokerWallet = new ethers.Wallet(brokerWalletPrivateKey, deployer.provider);
  console.log(`Broker wallet address: ${brokerWallet.address}`);
  console.log(`Broker wallet private key: ${brokerWalletPrivateKey}`);
  
  // Fund the broker wallet with ETH for gas
  const fundTx = await deployer.sendTransaction({
    to: brokerWallet.address,
    value: ethers.parseEther("0.1") // 0.1 ETH for gas
  });
  await fundTx.wait();
  console.log(`Funded broker wallet with 0.1 ETH for gas`);
  
  // Step 2: Mint test tokens to the broker wallet
  console.log("\nMinting test tokens to broker wallet...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const testToken = TestToken.attach(contracts.testToken);
  
  const mintAmount = ethers.parseUnits("1000", 18); // 1000 tokens
  await testToken.mint(brokerWallet.address, mintAmount);
  console.log(`Minted ${ethers.formatUnits(mintAmount, 18)} tokens to broker wallet`);
  
  // Verify token balance of broker wallet
  const brokerBalance = await testToken.balanceOf(brokerWallet.address);
  console.log(`Broker wallet token balance: ${ethers.formatUnits(brokerBalance, 18)}`);
  
  // Step 3: Mint test NFTs to the deployer for activity criteria
  console.log("\nMinting test NFTs to deployer...");
  const TestNFT = await ethers.getContractFactory("TestNFT");
  const testNFT = TestNFT.attach(contracts.testNFT);
  
  // Check if deployer already has NFTs
  const deployerNFTBalance = await testNFT.balanceOf(deployer.address);
  if (deployerNFTBalance == 0) {
    await testNFT.safeMint(deployer.address);
    console.log("Minted test NFT to deployer");
  } else {
    console.log(`Deployer already has ${deployerNFTBalance} NFTs`);
  }
  
  // Step 4: Create Tim3cap instances for both manual and automatic modes
  console.log("\nSetting up contract factories...");
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const factory = await ethers.getContractFactory("Tim3capFactory");
  const tim3capFactory = factory.attach(contracts.factory);
  
  // Create a set of eligible users - deployer and additional addresses
  console.log("\nSetting up eligible users...");
  const eligibleUsers = [deployer.address];
  
  // Create a couple of additional eligible user addresses
  const user1 = ethers.Wallet.createRandom().address;
  const user2 = ethers.Wallet.createRandom().address;
  eligibleUsers.push(user1);
  eligibleUsers.push(user2);
  
  console.log(`Eligible Users:`);
  console.log(`- ${eligibleUsers[0]} (deployer)`);
  console.log(`- ${eligibleUsers[1]} (user1)`);
  console.log(`- ${eligibleUsers[2]} (user2)`);
  
  // Test both manual and automatic modes
  const createForMode = async (automatic: any) => {
    const mode = automatic ? "Automatic" : "Manual";
    console.log(`\n--- Creating ${mode} Distribution TokenAirdropReward ---`);
    
    // Activity config
    const requiredAmount = 1; // Require 1 NFT from this collection
    const now = Math.floor(Date.now() / 1000);
    const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
      [
        [contracts.testNFT],
        [requiredAmount],
        now, // start date
        now + 30 * 24 * 60 * 60, // end date (30 days)
        0, // snapshot date (none)
        0 // listing status (any)
      ]
    );
    
    // Reward config
    const distributionDate = now + (automatic ? 5 * 60 : 30 * 24 * 60 * 60); // 5 minutes for automatic, 30 days for manual
    const tokenAmountPerUser = ethers.parseUnits("10", 18); // 10 tokens per eligible user
    const totalAirdropAmount = tokenAmountPerUser * BigInt(100); // Allow up to 100 eligible users
    
    const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "address", "uint256", "uint256", "address", "bool", "uint256"],
      [
        `Test Token Airdrop (${mode})`, // airdrop name
        contracts.testToken, // token address
        tokenAmountPerUser, // token amount per user
        totalAirdropAmount, // total airdrop amount
        brokerWallet.address, // broker wallet
        automatic, // automatic distribution flag
        distributionDate // distribution date
      ]
    );
    
    // Eligibility config
    const eligibilityConfig = {
      enabled: true,
      signingKey: deployer.address,
      proofValidityDuration: 86400, // 24 hours
      requireProofForAllClaims: false // Allow on-chain eligibility check (NFT holding)
    };
    
    // Create Tim3cap instance
    console.log(`Creating Tim3cap instance for ${mode} distribution...`);
    const createTx = await tim3capFactory.createTim3cap(
      "HOLD_X_NFTS", // Activity type
      contracts.holdXNftsImpl, // Activity implementation
      activityConfig, // Activity config
      "TOKEN_AIRDROP", // Reward type
      contracts.tokenAirdropRewardImpl, // Reward implementation
      rewardConfig, // Reward config
      eligibilityConfig, // Eligibility config
      deployer.address, // Origin
      deployer.address, // Creator/Owner
      ethers.ZeroAddress // No affiliate
    );
    
    console.log(`Create transaction hash: ${createTx.hash}`);
    const receipt = await createTx.wait();
    
    // Find the Tim3cap address from the event
    const creationEvent = receipt?.logs.find((log: any) => {
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
    
    if (!creationEvent) {
      throw new Error("Couldn't find Tim3capDeployed event in transaction receipt");
    }
    
    const parsedEvent = tim3capFactory.interface.parseLog({
      topics: creationEvent.topics,
      data: creationEvent.data
    });
    
    const tim3capAddress = parsedEvent?.args[0];
    console.log(`New Tim3cap instance deployed to: ${tim3capAddress}`);
    
    // Get contract references
    const tim3cap = Tim3cap.attach(tim3capAddress);
    const activityAddress = await tim3cap.activity();
    const rewardAddress = await tim3cap.reward();
    
    console.log(`Activity: ${activityAddress}`);
    console.log(`Reward: ${rewardAddress}`);
    
    // Return the contract addresses
    return {
      tim3cap: tim3capAddress,
      activity: activityAddress,
      reward: rewardAddress,
      automatic
    };
  };
  
  // Create both manual and automatic instances
  const manualInstance = await createForMode(false);
  const automaticInstance = await createForMode(true);
  
  // Step 5: Setup broker wallet to approve tokens for both instances
  console.log("\n=== Setting Up Broker Wallet Approvals ===");
  
  // Create connected instances using broker wallet
  const tokenWithBroker = testToken.connect(brokerWallet);
  
  // Approve tokens for both reward contracts
  const approveAmount = ethers.parseUnits("1000", 18); // Approve 1000 tokens
  
  // Approve for manual instance
        // @ts-ignore: TypeScript doesn't know about the claim method

  const approveTx1 = await tokenWithBroker.approve(
    manualInstance.reward,
    approveAmount
  );
  await approveTx1.wait();
  console.log(`Broker approved ${ethers.formatUnits(approveAmount, 18)} tokens for manual reward contract`);
  
  // Approve for automatic instance
        // @ts-ignore: TypeScript doesn't know about the claim method

  const approveTx2 = await tokenWithBroker.approve(
    automaticInstance.reward,
    approveAmount
  );
  await approveTx2.wait();
  console.log(`Broker approved ${ethers.formatUnits(approveAmount, 18)} tokens for automatic reward contract`);
  
  // Save instance data to a file
  const instanceData = {
    networkId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedBy: deployer.address,
    manualInstance: {
      tim3cap: manualInstance.tim3cap,
      activity: manualInstance.activity,
      reward: manualInstance.reward,
      distributionMode: "manual"
    },
    automaticInstance: {
      tim3cap: automaticInstance.tim3cap,
      activity: automaticInstance.activity,
      reward: automaticInstance.reward,
      distributionMode: "automatic"
    },
    brokerWallet: {
      address: brokerWallet.address,
      privateKey: brokerWalletPrivateKey
    },
    eligibleUsers: eligibleUsers,
    timestamp: new Date().toISOString()
  };
  
  const instanceFile = path.join(outputDir, "airdrop-instances.json");
  fs.writeFileSync(instanceFile, JSON.stringify(instanceData, null, 2));
  console.log(`\nInstance data saved to ${instanceFile}`);
  
  console.log("\n=== Instance Deployment Summary ===");
  console.log("Manual TokenAirdropReward Instance:");
  console.log(`- Tim3cap: ${manualInstance.tim3cap}`);
  console.log(`- Activity: ${manualInstance.activity}`);
  console.log(`- Reward: ${manualInstance.reward}`);
  
  console.log("\nAutomatic TokenAirdropReward Instance:");
  console.log(`- Tim3cap: ${automaticInstance.tim3cap}`);
  console.log(`- Activity: ${automaticInstance.activity}`);
  console.log(`- Reward: ${automaticInstance.reward}`);
  
  console.log("\nBroker Wallet:");
  console.log(`- Address: ${brokerWallet.address}`);
  console.log(`- Private Key: ${brokerWalletPrivateKey}`);
  
  console.log("\nEligible Users:");
  for (let i = 0; i < eligibleUsers.length; i++) {
    console.log(`- User ${i+1}: ${eligibleUsers[i]}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });