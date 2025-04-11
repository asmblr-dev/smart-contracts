// scripts/token_raffle/deploy-token-raffle-manual-fixed-v2.ts
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Helper function to create claim proof
async function createClaimProof(signer: SignerWithAddress, signingKey: string) {
  // For testing purposes, we'll create a simplified proof
  // In production, this would be signed by the activity contract's signing key
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Create an empty proof for testing - this works when eligibility is disabled
  const emptyProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    ["0x", timestamp]
  );
  
  return emptyProof;
}

async function main() {
  console.log("\n=== Deploying Tim3cap System with Token Raffle Reward (Manual Claims) ===");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // Create broker wallet (separate from deployer)
  const brokerWalletPrivateKey = ethers.Wallet.createRandom().privateKey;
  const brokerWallet = new ethers.Wallet(brokerWalletPrivateKey, deployer.provider);
  console.log(`Created broker wallet: ${brokerWallet.address}`);
  
  // Send some ETH to broker wallet for gas
  await deployer.sendTransaction({
    to: brokerWallet.address,
    value: ethers.parseEther("0.001") // 0.001 ETH for gas
  });
  console.log(`Sent 0.001 ETH to broker wallet for gas`);

  // Step 1: Deploy Test Token
  console.log("\nDeploying Test Token...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const testToken = await TestToken.deploy(deployer.address);
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  console.log(`Test Token deployed to: ${testTokenAddress}`);
  
  // Transfer 500 tokens to broker wallet
  const transferAmount = ethers.parseUnits("500", 18);
  await testToken.transfer(brokerWallet.address, transferAmount);
  console.log(`Transferred 500 TEST tokens to broker wallet`);
  
  // Step 2: Deploy implementation contracts
  console.log("\nDeploying implementation contracts...");
  
  // Tim3cap implementation
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const tim3capImpl = await Tim3cap.deploy();
  await tim3capImpl.waitForDeployment();
  const tim3capImplAddress = await tim3capImpl.getAddress();
  console.log(`Tim3cap implementation deployed to: ${tim3capImplAddress}`);
  
  // HoldXNfts implementation
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const holdXNftsImpl = await HoldXNfts.deploy();
  await holdXNftsImpl.waitForDeployment();
  const holdXNftsImplAddress = await holdXNftsImpl.getAddress();
  console.log(`HoldXNfts implementation deployed to: ${holdXNftsImplAddress}`);
  
  // TokenRaffleReward implementation
  const TokenRaffleReward = await ethers.getContractFactory("TokenRaffleReward");
  const tokenRaffleRewardImpl = await TokenRaffleReward.deploy();
  await tokenRaffleRewardImpl.waitForDeployment();
  const tokenRaffleRewardImplAddress = await tokenRaffleRewardImpl.getAddress();
  console.log(`TokenRaffleReward implementation deployed to: ${tokenRaffleRewardImplAddress}`);
  
  // Step 3: Deploy Registry
  console.log("\nDeploying Tim3capRegistry...");
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = await Tim3capRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`Tim3capRegistry deployed to: ${registryAddress}`);
  
  // Register implementations in registry
  await registry.registerActivity("HOLD_X_NFTS", holdXNftsImplAddress);
  console.log("Registered HoldXNfts activity");
  
  await registry.registerReward("TOKEN_RAFFLE", tokenRaffleRewardImplAddress);
  console.log("Registered TokenRaffleReward reward");
  
  await registry.setValidCombination("HOLD_X_NFTS", "TOKEN_RAFFLE", true);
  console.log("Set combination as valid");
  
  // Step 4: Deploy Factory
  console.log("\nDeploying Tim3capFactory...");
  const Tim3capFactory = await ethers.getContractFactory("Tim3capFactory");
  const factory = await Tim3capFactory.deploy(
    tim3capImplAddress,
    registryAddress,
    deployer.address, // deployer wallet
    deployer.address, // fee recipient
    250 // 2.5% fee
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`Tim3capFactory deployed to: ${factoryAddress}`);
  
  await factory.updateAuthorizedOrigin(factoryAddress, true);
  console.log("Factory authorized as origin");
  
  // Step 5: Create a Tim3cap instance with proper configuration
  console.log("\n=== Creating New Tim3cap Instance with Token Raffle Reward (Manual Claims) ===");
  
  // Activity config - use a test NFT address (could be replaced with a real one)
  const nftAddress = "0x8bC0D3dd9C5ba24954881106f5db641C5e9aBa00"; // Test NFT address
  const requiredAmount = 1; // Require 1 NFT from this collection
  const now = Math.floor(Date.now() / 1000);
  const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
    [
      [nftAddress],
      [requiredAmount],
      now, // start date
      now + 30 * 24 * 60 * 60, // end date (30 days)
      0, // snapshot date (none)
      0 // listing status (any)
    ]
  );
  
  // Reward config for manual token raffle
  const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "address", "uint256", "uint256", "address", "bool", "uint256"],
    [
      "Test Token Raffle", // raffle name
      testTokenAddress, // token address
      ethers.parseUnits("10", 18), // token amount per winner (10 tokens)
      10, // expected number of winners
      brokerWallet.address, // broker wallet
      false, // automatic distribution (false for manual)
      0 // distribution date (not used for manual)
    ]
  );
  
  // Eligibility config - disabled for testing to allow direct claims
  const eligibilityConfig = {
    enabled: false, // Disable eligibility checks for testing
    signingKey: deployer.address,
    proofValidityDuration: 86400, // 24 hours
    requireProofForAllClaims: false // Allow on-chain eligibility check (NFT holding)
  };
  
  // Create Tim3cap instance
  console.log("Creating Tim3cap instance via factory...");
  const createTx = await factory.createTim3cap(
    "HOLD_X_NFTS", // Activity type
    holdXNftsImplAddress, // Activity implementation
    activityConfig, // Activity config
    "TOKEN_RAFFLE", // Reward type
    tokenRaffleRewardImplAddress, // Reward implementation
    rewardConfig, // Reward config
    eligibilityConfig, // Eligibility config (disabled for testing)
    deployer.address, // Origin
    deployer.address, // Creator/Owner
    ethers.ZeroAddress // No affiliate
  );
  
  console.log(`Create transaction hash: ${createTx.hash}`);
  const receipt = await createTx.wait();
  
  // Find the Tim3cap address from the event
  const creationEvent = receipt?.logs.find((log: any) => {
    try {
      const parsed = factory.interface.parseLog({
        topics: log.topics as string[],
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
    topics: creationEvent.topics as string[],
    data: creationEvent.data
  });
  
  const tim3capAddress = parsedEvent?.args[0];
  console.log(`\n🎉 New Tim3cap instance deployed to: ${tim3capAddress}`);
  
  // Get addresses and verify setup
  const tim3cap = Tim3cap.attach(tim3capAddress);
  const activityAddress = await tim3cap.activity();
  const rewardAddress = await tim3cap.reward();
  
  console.log("\n=== Contract Addresses ===");
  console.log(`Tim3cap: ${tim3capAddress}`);
  console.log(`Activity: ${activityAddress}`);
  console.log(`Reward: ${rewardAddress}`);
  console.log(`Test Token: ${testTokenAddress}`);
  console.log(`Broker Wallet: ${brokerWallet.address}`);
  
  // Connect broker wallet to contracts for approvals
  const brokerTokenContract = new ethers.Contract(
    testTokenAddress,
    [
      "function approve(address spender, uint256 amount) external returns (bool)"
    ],
    brokerWallet
  );
  
  // Step 6: Initialize activity and reward setup
  console.log("\n=== Setting Up Activity and Reward ===");
  
  // Set signing key in activity
  const activity = HoldXNfts.attach(activityAddress);
  await activity.setSigningKey(deployer.address);
  await activity.setProofValidityDuration(86400); // 24 hours
  console.log("Activity signing key and proof validity set");
  
  // Connect to the reward contract
  const reward = TokenRaffleReward.attach(rewardAddress);
  
  // Approve tokens for the reward contract
  const approvalAmount = ethers.parseUnits("500", 18);
  await brokerTokenContract.approve(rewardAddress, approvalAmount);
  console.log(`Broker approved ${ethers.formatUnits(approvalAmount, 18)} TEST tokens for the reward contract`);
  
  // Check broker token balance
  const brokerBalance = await testToken.balanceOf(brokerWallet.address);
  console.log(`Broker wallet token balance: ${ethers.formatUnits(brokerBalance, 18)} TEST`);
  
  // Step 7: Set some winners for the raffle
  console.log("\n=== Setting Winners for the Raffle ===");
  
  // Add deployer as a winner
  await reward.addWinner(deployer.address);
  console.log(`Added deployer (${deployer.address}) as a winner`);
  
  // Create a few more test wallets and add them as winners
  const testWallets = [];
  for (let i = 0; i < 3; i++) {
    const testWallet = ethers.Wallet.createRandom().connect(deployer.provider);
    testWallets.push(testWallet);
    await reward.addWinner(testWallet.address);
    console.log(`Added test wallet ${i + 1} (${testWallet.address}) as a winner`);
  }
  
  // Step 8: Test claim functionality through the Tim3cap core contract
  console.log("\n=== Testing Token Raffle Reward (Manual Claim) ===");
  
  // Check initial balances
  const deployerInitialBalance = await testToken.balanceOf(deployer.address);
  console.log(`Deployer initial token balance: ${ethers.formatUnits(deployerInitialBalance, 18)} TEST`);
  
  // Check if deployer is a winner
  const isWinner = await reward.checkWinnerStatus(deployer.address);
  console.log(`Deployer is a winner: ${isWinner[0]}`);
  console.log(`Deployer has claimed: ${isWinner[1]}`);
  
  // Create proof for the TimeCap claim
  const deployerProof = await createClaimProof(deployer, deployer.address);
  
  console.log("\n=== Testing claim through Tim3cap core contract ===");
  try {
    // Claim through the Tim3cap core contract
    console.log("Calling Tim3cap claim function...");
    
    // Make sure gas limit is set high enough
    const claimTx = await tim3cap.claim(deployerProof, 0, [], {
      gasLimit: 3000000
    });
    console.log(`Claim transaction hash: ${claimTx.hash}`);
    
    const claimReceipt = await claimTx.wait();
    console.log(`Claim transaction successful! Gas used: ${claimReceipt?.gasUsed.toString()}`);
    
    // Check new balances
    const deployerNewBalance = await testToken.balanceOf(deployer.address);
    console.log(`\nDeployer new token balance: ${ethers.formatUnits(deployerNewBalance, 18)} TEST`);
    console.log(`Tokens received: ${ethers.formatUnits(deployerNewBalance - deployerInitialBalance, 18)} TEST`);
    
    // Verify claim status
    const updatedStatus = await reward.checkWinnerStatus(deployer.address);
    console.log(`Deployer has claimed: ${updatedStatus[1]}`);
  } catch (error: any) {
    console.log(`\nError during Tim3cap claim: ${error.message}`);
    
    // If claim fails, check if eligibility is the issue
    try {
      const isEligible = await activity.checkEligibility(deployer.address);
      console.log(`Deployer is eligible according to activity: ${isEligible}`);
    } catch (eligibilityError: any) {
      console.log(`Error checking eligibility: ${eligibilityError.message}`);
    }
    
    // Try with disabled eligibility if it failed
    if (await tim3cap.eligibilityEnabled()) {
      console.log("\n=== Trying with eligibility disabled ===");
      
      // Disable eligibility
      await tim3cap.setEligibilityConfig({
        enabled: false,
        signingKey: deployer.address,
        proofValidityDuration: 86400,
        requireProofForAllClaims: false
      });
      console.log("Eligibility disabled");
      
      // Try claim again
      try {
        const claimTx = await tim3cap.claim(deployerProof, 0, [], {
          gasLimit: 3000000
        });
        console.log(`Claim transaction hash: ${claimTx.hash}`);
        
        const claimReceipt = await claimTx.wait();
        console.log(`Claim transaction successful! Gas used: ${claimReceipt?.gasUsed.toString()}`);
        
        // Check new balances
        const deployerNewBalance = await testToken.balanceOf(deployer.address);
        console.log(`\nDeployer new token balance: ${ethers.formatUnits(deployerNewBalance, 18)} TEST`);
        console.log(`Tokens received: ${ethers.formatUnits(deployerNewBalance - deployerInitialBalance, 18)} TEST`);
        
        // Verify claim status
        const updatedStatus = await reward.checkWinnerStatus(deployer.address);
        console.log(`Deployer has claimed: ${updatedStatus[1]}`);
      } catch (retryError: any) {
        console.log(`Error during retry claim: ${retryError.message}`);
      }
    }
  }
  
  // Check raffle stats
  const raffleStats = await reward.getRaffleStats();
  console.log("\n=== Raffle Stats ===");
  console.log(`Raffle name: ${raffleStats[0]}`);
  console.log(`Token address: ${raffleStats[1]}`);
  console.log(`Token amount per winner: ${ethers.formatUnits(raffleStats[2], 18)} TEST`);
  console.log(`Total winners: ${raffleStats[3]}`);
  console.log(`Winners claimed: ${raffleStats[4]}`);
  console.log(`Automatic distribution: ${raffleStats[5]}`);
  
  // Optionally try claiming for a test wallet
  if (testWallets.length > 0) {
    console.log("\n=== Testing claim for test wallet ===");
    
    // Fund test wallet with ETH for gas
    await deployer.sendTransaction({
      to: testWallets[0].address,
      value: ethers.parseEther("0.001")
    });
    console.log(`Sent 0.001 ETH to test wallet for gas`);
    
    // Check initial balance
    const testWalletInitialBalance = await testToken.balanceOf(testWallets[0].address);
    console.log(`Test wallet initial token balance: ${ethers.formatUnits(testWalletInitialBalance, 18)} TEST`);
    
    // Create a proof for the test wallet
    const testWalletProof = await createClaimProof(deployer, deployer.address);
    
    // Try claiming with test wallet
    try {
      // Create contract instance connected to test wallet with ABI
      const testWalletTim3cap = new ethers.Contract(
        tim3capAddress,
        [
          "function claim(bytes calldata proof, uint256 feeIndex, bytes32[] calldata merkleProof) external",
          "function eligibilityEnabled() external view returns (bool)"
        ],
        testWallets[0]
      );
      
      // Make sure eligibility is disabled for test wallet too
      const eligibilityEnabled = await testWalletTim3cap.eligibilityEnabled();
      console.log(`Eligibility enabled for test wallet: ${eligibilityEnabled}`);
      
      console.log("Calling claim from test wallet...");
      // Call claim with explicit arguments to ensure correct encoding
      const claimTx = await testWalletTim3cap.claim(
        testWalletProof, // proof
        0, // feeIndex 
        [], // merkleProof (empty array)
        { gasLimit: 3000000 }
      );
      console.log(`Test wallet claim transaction hash: ${claimTx.hash}`);
      
      const claimReceipt = await claimTx.wait();
      console.log(`Test wallet claim successful! Gas used: ${claimReceipt?.gasUsed.toString()}`);
      
      // Check new balance
      const testWalletNewBalance = await testToken.balanceOf(testWallets[0].address);
      console.log(`\nTest wallet new token balance: ${ethers.formatUnits(testWalletNewBalance, 18)} TEST`);
      console.log(`Tokens received: ${ethers.formatUnits(testWalletNewBalance - testWalletInitialBalance, 18)} TEST`);
      
      // Verify claim status
      const updatedStatus = await reward.checkWinnerStatus(testWallets[0].address);
      console.log(`Test wallet has claimed: ${updatedStatus[1]}`);
    } catch (error: any) {
      console.log(`Error during test wallet claim: ${error.message}`);
      
      // Try to log more detailed error info
      console.log("\nAttempting to log detailed error info:");
      try {
        console.log(`Error name: ${error.name}`);
        console.log(`Error code: ${error.code}`);
        if (error.transaction) {
          console.log(`Transaction data: ${error.transaction.data || "none"}`);
          console.log(`Transaction to: ${error.transaction.to}`);
          console.log(`Transaction from: ${error.transaction.from}`);
        }
        if (error.receipt) {
          console.log(`Receipt status: ${error.receipt.status}`);
        }
      } catch (e) {
        console.log("Could not extract detailed error info");
      }
    }
  }
  
  // Final stats
  const finalRaffleStats = await reward.getRaffleStats();
  console.log("\n=== Final Raffle Stats ===");
  console.log(`Total winners: ${finalRaffleStats[3]}`);
  console.log(`Winners claimed: ${finalRaffleStats[4]}`);
  
  console.log("\n=== Deployment Summary ===");
  console.log("Tim3cap System Deployed with Token Raffle Reward (Manual Claims)");
  console.log(`- Tim3cap: ${tim3capAddress}`);
  console.log(`- Activity (HoldXNfts): ${activityAddress}`);
  console.log(`- Reward (TokenRaffleReward): ${rewardAddress}`);
  console.log(`- Target NFT Address: ${nftAddress}`);
  console.log(`- Test Token: ${testTokenAddress}`);
  console.log(`- Broker Wallet: ${brokerWallet.address}`);
  console.log(`- Broker Private Key: ${brokerWalletPrivateKey}`);
  console.log(`- Factory: ${factoryAddress}`);
  console.log(`- Registry: ${registryAddress}`);
  
  console.log("\n✅ Deployment Complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });