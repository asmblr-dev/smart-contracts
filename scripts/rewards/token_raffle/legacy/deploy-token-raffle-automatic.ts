// scripts/deploy-token-raffle-automatic.ts
import { ethers } from "hardhat";

async function main() {
  console.log("\n=== Deploying Tim3cap System with Token Raffle Reward (Automatic Distribution) ===");
  
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
    value: ethers.parseEther("0.1") // 0.1 ETH for gas
  });
  console.log(`Sent 0.1 ETH to broker wallet for gas`);

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
  console.log("\n=== Creating New Tim3cap Instance with Token Raffle Reward (Automatic Distribution) ===");
  
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
  
  // Reward config for automatic token raffle
  // Set distribution date to 5 minutes from now for testing
  const distributionDate = now + 5 * 60; // 5 minutes from now
  
  const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "address", "uint256", "uint256", "address", "bool", "uint256"],
    [
      "Auto Token Raffle", // raffle name
      testTokenAddress, // token address
      ethers.parseUnits("10", 18), // token amount per winner (10 tokens)
      10, // expected number of winners
      brokerWallet.address, // broker wallet
      true, // automatic distribution (true for automatic)
      distributionDate // distribution date (5 minutes from now)
    ]
  );
  
  // Eligibility config - enabled for testing
  const eligibilityConfig = {
    enabled: true, // Enable eligibility checks
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
  
  // Connect broker wallet to contracts to approve token spending
  const brokerTokenContract = TestToken.connect(brokerWallet);
  const brokerRewardContract = TokenRaffleReward.connect(brokerWallet).attach(rewardAddress);
  
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
  
  // Get distribution date from contract
  const raffleStats = await reward.getRaffleStats();
  const contractDistributionDate = Number(raffleStats[6]);
  const distributionDateTime = new Date(contractDistributionDate * 1000);
  console.log(`\nAutomatic distribution scheduled for: ${distributionDateTime.toLocaleString()}`);
  console.log(`Current time: ${new Date().toLocaleString()}`);
  console.log(`Time until distribution: ${Math.round((contractDistributionDate - now) / 60)} minutes`);
  
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
  
  // Step 8: Check initial balances
  console.log("\n=== Checking Initial Token Balances ===");
  
  const deployerInitialBalance = await testToken.balanceOf(deployer.address);
  console.log(`Deployer initial balance: ${ethers.formatUnits(deployerInitialBalance, 18)} TEST`);
  
  for (let i = 0; i < testWallets.length; i++) {
    const balance = await testToken.balanceOf(testWallets[i].address);
    console.log(`Test wallet ${i + 1} initial balance: ${ethers.formatUnits(balance, 18)} TEST`);
  }
  
  // Step 9: Test manual claim (should fail once automatic distribution is enabled)
  console.log("\n=== Testing Manual Claim (Should Fail) ===");
  
  try {
    // Try direct claim through TokenRaffleReward (should fail due to automatic distribution)
    const directClaimTx = await reward.claimTokens();
    await directClaimTx.wait();
    console.log("Manual claim succeeded (unexpected)");
  } catch (error: any) {
    console.log(`Manual claim failed as expected: ${error.message}`);
  }
  
  // Step 10: Wait for distribution time and trigger the automatic distribution
  console.log("\n=== Waiting for Distribution Time ===");
  
  const secondsToWait = Math.max(0, contractDistributionDate - Math.floor(Date.now() / 1000));
  
  if (secondsToWait > 0) {
    console.log(`Waiting ${secondsToWait} seconds for distribution time...`);
    
    // Wait for the distribution time
    await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
    
    console.log("Distribution time reached!");
  } else {
    console.log("Distribution time has already passed.");
  }
  
  // Step 11: Trigger automatic distribution
  console.log("\n=== Triggering Automatic Distribution ===");
  
  try {
    const triggerTx = await reward.triggerAutomaticDistribution();
    await triggerTx.wait();
    console.log("Automatic distribution triggered successfully!");
  } catch (error: any) {
    console.log(`Error triggering automatic distribution: ${error.message}`);
  }
  
  // Step 12: Check final balances to verify distribution
  console.log("\n=== Checking Final Token Balances ===");
  
  const deployerFinalBalance = await testToken.balanceOf(deployer.address);
  console.log(`Deployer final balance: ${ethers.formatUnits(deployerFinalBalance, 18)} TEST`);
  console.log(`Tokens received: ${ethers.formatUnits(deployerFinalBalance - deployerInitialBalance, 18)} TEST`);
  
  for (let i = 0; i < testWallets.length; i++) {
    const balance = await testToken.balanceOf(testWallets[i].address);
    console.log(`Test wallet ${i + 1} final balance: ${ethers.formatUnits(balance, 18)} TEST`);
  }
  
  // Check claim status
  console.log("\n=== Checking Claim Status ===");
  
  const deployerStatus = await reward.checkWinnerStatus(deployer.address);
  console.log(`Deployer is a winner: ${deployerStatus[0]}`);
  console.log(`Deployer has claimed: ${deployerStatus[1]}`);
  
  for (let i = 0; i < testWallets.length; i++) {
    const status = await reward.checkWinnerStatus(testWallets[i].address);
    console.log(`Test wallet ${i + 1} is a winner: ${status[0]}`);
    console.log(`Test wallet ${i + 1} has claimed: ${status[1]}`);
  }
  
  // Check final raffle stats
  const finalRaffleStats = await reward.getRaffleStats();
  console.log("\n=== Final Raffle Stats ===");
  console.log(`Raffle name: ${finalRaffleStats[0]}`);
  console.log(`Token address: ${finalRaffleStats[1]}`);
  console.log(`Token amount per winner: ${ethers.formatUnits(finalRaffleStats[2], 18)} TEST`);
  console.log(`Total winners: ${finalRaffleStats[3]}`);
  console.log(`Winners claimed: ${finalRaffleStats[4]}`);
  console.log(`Automatic distribution: ${finalRaffleStats[5]}`);
  
  // Check broker wallet final balance
  const brokerFinalBalance = await testToken.balanceOf(brokerWallet.address);
  console.log(`\nBroker wallet final token balance: ${ethers.formatUnits(brokerFinalBalance, 18)} TEST`);
  console.log(`Tokens distributed: ${ethers.formatUnits(brokerBalance - brokerFinalBalance, 18)} TEST`);
  
  console.log("\n=== Deployment Summary ===");
  console.log("Tim3cap System Deployed with Token Raffle Reward (Automatic Distribution)");
  console.log(`- Tim3cap: ${tim3capAddress}`);
  console.log(`- Activity (HoldXNfts): ${activityAddress}`);
  console.log(`- Reward (TokenRaffleReward): ${rewardAddress}`);
  console.log(`- Target NFT Address: ${nftAddress}`);
  console.log(`- Test Token: ${testTokenAddress}`);
  console.log(`- Broker Wallet: ${brokerWallet.address}`);
  console.log(`- Broker Private Key: ${brokerWalletPrivateKey}`);
  console.log(`- Factory: ${factoryAddress}`);
  console.log(`- Registry: ${registryAddress}`);
  
  console.log("\n✅ Deployment and Automatic Distribution Test Complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });