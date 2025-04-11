// scripts/test-token-raffle.ts
import { ethers } from "hardhat";

/**
 * This script creates and tests both manual and automatic token raffle rewards
 * in the same script for direct comparison and thorough testing
 */
async function main() {
  console.log("\n=== Testing Token Raffle Reward (Manual and Automatic Distribution) ===");
  
  // ======= Setup =======
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // Create broker wallet
  const brokerWalletPrivateKey = ethers.Wallet.createRandom().privateKey;
  const brokerWallet = new ethers.Wallet(brokerWalletPrivateKey, deployer.provider);
  console.log(`Created broker wallet: ${brokerWallet.address}`);
  
  // Fund broker wallet
  await deployer.sendTransaction({
    to: brokerWallet.address,
    value: ethers.parseEther("0.001")
  });
  console.log(`Sent 0.1 ETH to broker wallet for gas`);

  // Deploy test token
  console.log("\nDeploying Test Token...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const testToken = await TestToken.deploy(deployer.address);
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  console.log(`Test Token deployed to: ${testTokenAddress}`);
  
  // Transfer tokens to broker
  const transferAmount = ethers.parseUnits("1000", 18);
  await testToken.transfer(brokerWallet.address, transferAmount);
  console.log(`Transferred 1000 TEST tokens to broker wallet`);
  
  // ======= Deploy Implementation Contracts =======
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
  
  // ======= Deploy Registry =======
  console.log("\nDeploying Tim3capRegistry...");
  const Tim3capRegistry = await ethers.getContractFactory("Tim3capRegistry");
  const registry = await Tim3capRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`Tim3capRegistry deployed to: ${registryAddress}`);
  
  // Register implementations
  await registry.registerActivity("HOLD_X_NFTS", holdXNftsImplAddress);
  console.log("Registered HoldXNfts activity");
  
  await registry.registerReward("TOKEN_RAFFLE", tokenRaffleRewardImplAddress);
  console.log("Registered TokenRaffleReward reward");
  
  await registry.setValidCombination("HOLD_X_NFTS", "TOKEN_RAFFLE", true);
  console.log("Set combination as valid");
  
  // ======= Deploy Factory =======
  console.log("\nDeploying Tim3capFactory...");
  const Tim3capFactory = await ethers.getContractFactory("Tim3capFactory");
  const factory = await Tim3capFactory.deploy(
    tim3capImplAddress,
    registryAddress,
    deployer.address,
    deployer.address,
    250 // 2.5% fee
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`Tim3capFactory deployed to: ${factoryAddress}`);
  
  await factory.updateAuthorizedOrigin(factoryAddress, true);
  console.log("Factory authorized as origin");
  
  // ======= Create Test Winners =======
  console.log("\nCreating test wallets for winners...");
  const testWallets = [];
  for (let i = 0; i < 6; i++) {
    const wallet = ethers.Wallet.createRandom().connect(deployer.provider);
    testWallets.push(wallet);
    console.log(`Created test wallet ${i + 1}: ${wallet.address}`);
  }
  
  // ======= Create Configurations =======
  // Common activity config
  const nftAddress = "0x8bC0D3dd9C5ba24954881106f5db641C5e9aBa00"; // Test NFT address
  const requiredAmount = 1;
  const now = Math.floor(Date.now() / 1000);
  const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
    [
      [nftAddress],
      [requiredAmount],
      now,
      now + 30 * 24 * 60 * 60, // 30 days
      0,
      0
    ]
  );
  
  // Eligibility config
  const eligibilityConfig = {
    enabled: true,
    signingKey: deployer.address,
    proofValidityDuration: 86400, // 24 hours
    requireProofForAllClaims: false
  };
  
  // ======= Deploy Manual Claim Raffle =======
  console.log("\n=== Deploying Token Raffle with Manual Claims ===");
  
  // Manual reward config
  const manualRewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "address", "uint256", "uint256", "address", "bool", "uint256"],
    [
      "Manual Token Raffle",
      testTokenAddress,
      ethers.parseUnits("10", 18), // 10 tokens per winner
      10, // expected winners
      brokerWallet.address,
      false, // manual distribution
      0 // no distribution date
    ]
  );
  
  // Create manual Tim3cap instance
  console.log("Creating manual claim Tim3cap instance...");
  const createManualTx = await factory.createTim3cap(
    "HOLD_X_NFTS",
    holdXNftsImplAddress,
    activityConfig,
    "TOKEN_RAFFLE",
    tokenRaffleRewardImplAddress,
    manualRewardConfig,
    eligibilityConfig,
    deployer.address,
    deployer.address,
    ethers.ZeroAddress
  );
  
  const manualReceipt = await createManualTx.wait();
  
  // Find the Tim3cap address
  const manualCreationEvent = manualReceipt?.logs.find((log: any) => {
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
  
  if (!manualCreationEvent) {
    throw new Error("Couldn't find Tim3capDeployed event in transaction receipt");
  }
  
  const manualParsedEvent = factory.interface.parseLog({
    topics: manualCreationEvent.topics as string[],
    data: manualCreationEvent.data
  });
  
  const manualTim3capAddress = manualParsedEvent?.args[0];
  console.log(`Manual Claim Tim3cap deployed to: ${manualTim3capAddress}`);
  
  // Get contract addresses
  const manualTim3cap = Tim3cap.attach(manualTim3capAddress);
  const manualActivityAddress = await manualTim3cap.activity();
  const manualRewardAddress = await manualTim3cap.reward();
  
  console.log(`Manual Activity: ${manualActivityAddress}`);
  console.log(`Manual Reward: ${manualRewardAddress}`);
  
  // ======= Deploy Automatic Distribution Raffle =======
  console.log("\n=== Deploying Token Raffle with Automatic Distribution ===");
  
  // Set distribution date to 5 minutes from now
  const distributionDate = now + 5 * 60; // 5 minutes
  
  // Automatic reward config
  const autoRewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "address", "uint256", "uint256", "address", "bool", "uint256"],
    [
      "Automatic Token Raffle",
      testTokenAddress,
      ethers.parseUnits("10", 18), // 10 tokens per winner
      10, // expected winners
      brokerWallet.address,
      true, // automatic distribution
      distributionDate // 5 minutes from now
    ]
  );
  
  // Create automatic Tim3cap instance
  console.log("Creating automatic distribution Tim3cap instance...");
  const createAutoTx = await factory.createTim3cap(
    "HOLD_X_NFTS",
    holdXNftsImplAddress,
    activityConfig,
    "TOKEN_RAFFLE",
    tokenRaffleRewardImplAddress,
    autoRewardConfig,
    eligibilityConfig,
    deployer.address,
    deployer.address,
    ethers.ZeroAddress
  );
  
  const autoReceipt = await createAutoTx.wait();
  
  // Find the Tim3cap address
  const autoCreationEvent = autoReceipt?.logs.find((log: any) => {
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
  
  if (!autoCreationEvent) {
    throw new Error("Couldn't find Tim3capDeployed event in transaction receipt");
  }
  
  const autoParsedEvent = factory.interface.parseLog({
    topics: autoCreationEvent.topics as string[],
    data: autoCreationEvent.data
  });
  
  const autoTim3capAddress = autoParsedEvent?.args[0];
  console.log(`Automatic Distribution Tim3cap deployed to: ${autoTim3capAddress}`);
  
  // Get contract addresses
  const autoTim3cap = Tim3cap.attach(autoTim3capAddress);
  const autoActivityAddress = await autoTim3cap.activity();
  const autoRewardAddress = await autoTim3cap.reward();
  
  console.log(`Auto Activity: ${autoActivityAddress}`);
  console.log(`Auto Reward: ${autoRewardAddress}`);
  
  // ======= Setup Reward Contracts =======
  console.log("\n=== Setting Up Reward Contracts ===");
  
  // Connect to reward contracts
  const manualReward = TokenRaffleReward.attach(manualRewardAddress);
  const autoReward = TokenRaffleReward.attach(autoRewardAddress);
  
  // Connect broker wallet to contracts
  const brokerTokenContract = TestToken.connect(brokerWallet);
  
  // Approve tokens for both reward contracts
  const approvalAmount = ethers.parseUnits("500", 18); // 500 tokens for each
      // @ts-ignore: TypeScript doesn't know about the claim method

  await brokerTokenContract.approve(manualRewardAddress, approvalAmount);
  console.log(`Broker approved ${ethers.formatUnits(approvalAmount, 18)} TEST tokens for manual reward contract`);
      // @ts-ignore: TypeScript doesn't know about the claim method

  await brokerTokenContract.approve(autoRewardAddress, approvalAmount);
  console.log(`Broker approved ${ethers.formatUnits(approvalAmount, 18)} TEST tokens for automatic reward contract`);
  
  // ======= Add Winners to Both Raffles =======
  console.log("\n=== Adding Winners to Both Raffles ===");
  
  // Add deployer as winner to both raffles
  await manualReward.addWinner(deployer.address);
  console.log(`Added deployer to manual raffle`);
  
  await autoReward.addWinner(deployer.address);
  console.log(`Added deployer to automatic raffle`);
  
  // Add 3 test wallets to manual raffle
  for (let i = 0; i < 3; i++) {
    await manualReward.addWinner(testWallets[i].address);
    console.log(`Added test wallet ${i + 1} to manual raffle`);
  }
  
  // Add 3 different test wallets to automatic raffle
  for (let i = 3; i < 6; i++) {
    await autoReward.addWinner(testWallets[i].address);
    console.log(`Added test wallet ${i + 1} to automatic raffle`);
  }
  
  // ======= Test Manual Claim Functionality =======
  console.log("\n=== Testing Manual Claim Functionality ===");
  
  // Check initial balances
  const deployerInitialBalance = await testToken.balanceOf(deployer.address);
  console.log(`Deployer initial balance: ${ethers.formatUnits(deployerInitialBalance, 18)} TEST`);
  
  // Test direct claim through reward contract
  console.log("\nTesting direct claim through reward contract...");
  
  try {
    const claimTx = await manualReward.claimTokens();
    await claimTx.wait();
    
    const deployerNewBalance = await testToken.balanceOf(deployer.address);
    console.log(`Deployer claimed ${ethers.formatUnits(deployerNewBalance - deployerInitialBalance, 18)} TEST tokens`);
    
    // Verify claim status
    const status = await manualReward.checkWinnerStatus(deployer.address);
    console.log(`Claim status: Winner=${status[0]}, HasClaimed=${status[1]}`);
  } catch (error: any) {
    console.log(`Error during manual claim: ${error.message}`);
  }
  
  // Check raffle stats
  const manualStats = await manualReward.getRaffleStats();
  console.log("\nManual Raffle Stats:");
  console.log(`- Name: ${manualStats[0]}`);
  console.log(`- Token: ${manualStats[1]}`);
  console.log(`- Amount per winner: ${ethers.formatUnits(manualStats[2], 18)} TEST`);
  console.log(`- Winners count: ${manualStats[3]}`);
  console.log(`- Claims processed: ${manualStats[4]}`);
  console.log(`- Automatic: ${manualStats[5]}`);
  
  // Test test wallet claim (through Tim3cap core for one wallet)
  console.log("\nTesting claim through Tim3cap core contract...");
  
  try {
    // Create empty proof (direct on-chain eligibility)
    const timestamp = Math.floor(Date.now() / 1000);
    const emptyProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "uint256"],
      ["0x", timestamp]
    );
    
    // Initial balance
    const wallet0InitialBalance = await testToken.balanceOf(testWallets[0].address);
    console.log(`Test wallet 1 initial balance: ${ethers.formatUnits(wallet0InitialBalance, 18)} TEST`);
    
    // Disable eligibility for testing
    await manualTim3cap.setEligibilityConfig({
      enabled: false,
      signingKey: deployer.address,
      proofValidityDuration: 86400,
      requireProofForAllClaims: false
    });
    console.log("Disabled eligibility for testing");
    
    // Claim through core contract
    const coreTx = await manualTim3cap.claim(emptyProof, 0, []);
    await coreTx.wait();
    
    // Check new balance
    const wallet0NewBalance = await testToken.balanceOf(testWallets[0].address);
    console.log(`Test wallet 1 new balance: ${ethers.formatUnits(wallet0NewBalance, 18)} TEST`);
    console.log(`Test wallet 1 received ${ethers.formatUnits(wallet0NewBalance - wallet0InitialBalance, 18)} TEST tokens`);
    
    // Verify claim status
    const status = await manualReward.checkWinnerStatus(testWallets[0].address);
    console.log(`Claim status: Winner=${status[0]}, HasClaimed=${status[1]}`);
  } catch (error: any) {
    console.log(`Error during Tim3cap core claim: ${error.message}`);
  }
  
  // ======= Test Automatic Distribution Functionality =======
  console.log("\n=== Testing Automatic Distribution Functionality ===");
  
  // Try manual claim (should fail for automatic raffle)
  console.log("\nTesting manual claim on automatic raffle (should fail)...");
  
  try {
    const claimTx = await autoReward.claimTokens();
    await claimTx.wait();
    console.log("Manual claim succeeded (unexpected)");
  } catch (error: any) {
    console.log(`Manual claim failed as expected: ${error.message}`);
  }
  
  // Check automatic raffle stats
  const autoStats = await autoReward.getRaffleStats();
  console.log("\nAutomatic Raffle Stats:");
  console.log(`- Name: ${autoStats[0]}`);
  console.log(`- Token: ${autoStats[1]}`);
  console.log(`- Amount per winner: ${ethers.formatUnits(autoStats[2], 18)} TEST`);
  console.log(`- Winners count: ${autoStats[3]}`);
  console.log(`- Claims processed: ${autoStats[4]}`);
  console.log(`- Automatic: ${autoStats[5]}`);
  console.log(`- Distribution date: ${new Date(Number(autoStats[6]) * 1000).toLocaleString()}`);
  
  // Record initial balances for automatic distribution winners
  console.log("\nRecording initial balances for automatic winners...");
  
  const deployerAutoInitialBalance = await testToken.balanceOf(deployer.address);
  console.log(`Deployer initial balance: ${ethers.formatUnits(deployerAutoInitialBalance, 18)} TEST`);
  
  const autoWinnerInitialBalances = [];
  for (let i = 3; i < 6; i++) {
    const balance = await testToken.balanceOf(testWallets[i].address);
    autoWinnerInitialBalances.push(balance);
    console.log(`Test wallet ${i + 1} initial balance: ${ethers.formatUnits(balance, 18)} TEST`);
  }
  
  // Wait for distribution time and trigger distribution
  const secondsToWait = Math.max(0, distributionDate - Math.floor(Date.now() / 1000));
  
  if (secondsToWait > 0) {
    console.log(`\nWaiting ${secondsToWait} seconds for distribution time...`);
    
    // Wait for the distribution time
    await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
    
    console.log("Distribution time reached!");
  } else {
    console.log("\nDistribution time has already passed.");
  }
  
  // Trigger automatic distribution
  console.log("\nTriggering automatic distribution...");
  
  try {
    const triggerTx = await autoReward.triggerAutomaticDistribution();
    await triggerTx.wait();
    console.log("Automatic distribution triggered successfully!");
  } catch (error: any) {
    console.log(`Error triggering automatic distribution: ${error.message}`);
  }
  
  // Check final balances
  console.log("\nChecking final balances after automatic distribution...");
  
  const deployerAutoFinalBalance = await testToken.balanceOf(deployer.address);
  console.log(`Deployer final balance: ${ethers.formatUnits(deployerAutoFinalBalance, 18)} TEST`);
  console.log(`Deployer received ${ethers.formatUnits(deployerAutoFinalBalance - deployerAutoInitialBalance, 18)} TEST tokens`);
  
  for (let i = 3; i < 6; i++) {
    const finalBalance = await testToken.balanceOf(testWallets[i].address);
    console.log(`Test wallet ${i + 1} final balance: ${ethers.formatUnits(finalBalance, 18)} TEST`);
    console.log(`Test wallet ${i + 1} received ${ethers.formatUnits(finalBalance - autoWinnerInitialBalances[i-3], 18)} TEST tokens`);
    
    // Verify claim status
    const status = await autoReward.checkWinnerStatus(testWallets[i].address);
    console.log(`Claim status: Winner=${status[0]}, HasClaimed=${status[1]}`);
  }
  
  // Check automatic raffle final stats
  const finalAutoStats = await autoReward.getRaffleStats();
  console.log("\nFinal Automatic Raffle Stats:");
  console.log(`- Winners count: ${finalAutoStats[3]}`);
  console.log(`- Claims processed: ${finalAutoStats[4]}`);
  
  // ======= Summary =======
  console.log("\n=== Test Summary ===");
  console.log("\nManual Token Raffle:");
  console.log(`- Tim3cap: ${manualTim3capAddress}`);
  console.log(`- Activity: ${manualActivityAddress}`);
  console.log(`- Reward: ${manualRewardAddress}`);
  console.log(`- Claims processed: ${manualStats[4]}`);
  
  console.log("\nAutomatic Token Raffle:");
  console.log(`- Tim3cap: ${autoTim3capAddress}`);
  console.log(`- Activity: ${autoActivityAddress}`);
  console.log(`- Reward: ${autoRewardAddress}`);
  console.log(`- Claims processed: ${finalAutoStats[4]}`);
  
  console.log("\nSupporting Contracts:");
  console.log(`- Test Token: ${testTokenAddress}`);
  console.log(`- Broker Wallet: ${brokerWallet.address}`);
  console.log(`- Broker Private Key: ${brokerWalletPrivateKey}`);
  
  console.log("\n✅ Token Raffle Testing Complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });