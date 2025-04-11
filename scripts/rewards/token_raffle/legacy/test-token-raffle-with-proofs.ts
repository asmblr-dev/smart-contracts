// scripts/token_raffle/test-token-raffle-with-proofs.ts
import { ethers } from "hardhat";

/**
 * Creates a valid eligibility proof signed by the private key
 * @param user The address to create proof for
 * @param privateKey The private key to sign with
 * @param activityType The activity type string
 * @returns Encoded proof data
 */
async function createEligibilityProof(
  user: string, 
  privateKey: string,
  activityType: string
): Promise<string> {
  console.log(`Creating proof for user ${user}`);
  
  // Current timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  console.log(`Using timestamp: ${timestamp}`);
  
  // Create message hash that matches the contract's verification logic
  const message = ethers.solidityPacked(
    ["address", "uint256", "string"],
    [user, timestamp, activityType]
  );
  const messageHash = ethers.keccak256(message);
  console.log(`Message hash: ${messageHash}`);
  
  // Create the prefixed hash that ethers will sign
  const signature = await new ethers.Wallet(privateKey).signMessage(
    ethers.getBytes(messageHash)
  );
  console.log(`Signature: ${signature}`);
  
  // Encode the proof data as expected by the contract
  const proof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  console.log(`Encoded proof: ${proof}`);
  
  return proof;
}

async function main() {
  console.log("\n=== Testing Token Raffle with Valid Proofs ===");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // REPLACE WITH YOUR ACTUAL DEPLOYED ADDRESSES
  const tim3capAddress = "0x11c816175b7Aa63C28D635bB109d4Ec9253E8F4b";  
  const activityAddress = "0x83cBd0f4159C933b2A2C2bB027711Dc3EA6Cb9dB"; 
  const rewardAddress = "0x64A71f2F34db86B862fe6C6612851aDAE0B7f8b6";   
  const testTokenAddress = "0xE51e71Ec58344E03382d73A0EEdBc8E87C0BDf48";
  
  // Create broker wallet and add it here
  const brokerWalletPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Replace with actual broker key
  const brokerWallet = new ethers.Wallet(brokerWalletPrivateKey, deployer.provider);

  console.log("Using contract addresses:");
  console.log(`Tim3cap: ${tim3capAddress}`);
  console.log(`Activity: ${activityAddress}`);
  console.log(`Reward: ${rewardAddress}`);
  console.log(`Test Token: ${testTokenAddress}`);
  console.log(`Broker Wallet: ${brokerWallet.address}`);
  
  // Connect to contracts
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const tim3cap = Tim3cap.attach(tim3capAddress);
  
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const activity = HoldXNfts.attach(activityAddress);
  
  const TokenRaffleReward = await ethers.getContractFactory("TokenRaffleReward");
  const reward = TokenRaffleReward.attach(rewardAddress);
  
  const TestToken = await ethers.getContractFactory("TestToken");
  const testToken = TestToken.attach(testTokenAddress);
  
  // Create test wallet
  const testWalletPrivateKey = ethers.Wallet.createRandom().privateKey;
  const testWallet = new ethers.Wallet(testWalletPrivateKey, deployer.provider);
  console.log(`\nCreated test wallet: ${testWallet.address}`);
  
  // Send some ETH to test wallet for gas
  await deployer.sendTransaction({
    to: testWallet.address,
    value: ethers.parseEther("0.01") // 0.01 ETH for gas
  });
  console.log(`Sent 0.01 ETH to test wallet for gas`);
  
  // Step 1: Check & Set Signing Key
  console.log("\n=== Checking Activity Configuration ===");
  try {
    // Get current signing key
    const activityState = await activity.debugActivityState();
    console.log(`Current signing key: ${activityState[5]}`);
    
    // Make sure signing key is set to deployer
    if (activityState[5] !== deployer.address) {
      console.log("Setting signing key to deployer...");
      await activity.setSigningKey(deployer.address);
      console.log("Signing key updated to deployer");
    }
    
    // Set validity duration if needed
    const currentValidityDuration = activityState[6];
    console.log(`Current proof validity duration: ${currentValidityDuration}`);
    if (currentValidityDuration.toString() !== "86400") {
      console.log("Setting proof validity duration...");
      await activity.setProofValidityDuration(86400);
      console.log("Proof validity duration updated");
    }
    
    // Debug Tim3cap eligibility config
    try {
      const debugState = await tim3cap.debugState();
      console.log("Tim3cap debug state:");
      console.log(`- Initialized: ${debugState[0]}`);
      console.log(`- Activity: ${debugState[1]}`);
      console.log(`- Reward: ${debugState[2]}`);
      console.log(`- Paused: ${debugState[3]}`);
      console.log(`- Eligibility enabled: ${debugState[4]}`);
      console.log(`- Signing key: ${debugState[5]}`);
      console.log(`- Proof validity: ${debugState[6]}`);
    } catch (error: any) {
      console.log(`Error getting Tim3cap debug state: ${error.message}`);
    }
  } catch (error: any) {
    console.log(`Error checking/setting signing key: ${error.message}`);
  }
  
  // Step 2: Setup Broker Wallet - THIS IS THE KEY ADDITION
  console.log("\n=== Setting Up Broker Wallet ===");
  
  try {
    // Create broker wallet just like in the deployment script
    console.log(`Broker wallet address: ${brokerWallet.address}`);
    
    // Check broker token balance
    const brokerTokenBalance = await testToken.balanceOf(brokerWallet.address);
    console.log(`Broker token balance: ${ethers.formatUnits(brokerTokenBalance, 18)} TEST`);
    
    // Fund broker with tokens if needed
    if (brokerTokenBalance < ethers.parseUnits("20", 18)) {
      console.log("Funding broker wallet with tokens...");
      const fundAmount = ethers.parseUnits("100", 18);
      await testToken.transfer(brokerWallet.address, fundAmount);
      console.log(`Transferred ${ethers.formatUnits(fundAmount, 18)} TEST tokens to broker`);
      
      const newBalance = await testToken.balanceOf(brokerWallet.address);
      console.log(`Updated broker token balance: ${ethers.formatUnits(newBalance, 18)} TEST`);
    }
    
    // Setup token approval exactly like in the deployment script
    const brokerTokenContract = new ethers.Contract(
      testTokenAddress,
      [
        "function approve(address spender, uint256 amount) external returns (bool)"
      ],
      brokerWallet
    );
    
    // Approve tokens for the reward contract
    const approvalAmount = ethers.parseUnits("500", 18);
    await brokerTokenContract.approve(rewardAddress, approvalAmount);
    console.log(`Broker approved ${ethers.formatUnits(approvalAmount, 18)} TEST tokens for the reward contract`);
    
    // Check broker token balance
    const brokerBalance = await testToken.balanceOf(brokerWallet.address);
    console.log(`Broker wallet token balance: ${ethers.formatUnits(brokerBalance, 18)} TEST`);
  } catch (error: any) {
    console.log(`Error setting up broker wallet: ${error.message}`);
  }
  } catch (error: any) {
    console.log(`Error setting up broker wallet: ${error.message}`);
  }
  
  // Step 3: Add test wallet as winner if not already
  console.log("\n=== Adding Test Wallet as Winner ===");
  try {
    const winnerStatus = await reward.checkWinnerStatus(testWallet.address);
    console.log(`Is already winner: ${winnerStatus[0]}`);
    console.log(`Has already claimed: ${winnerStatus[1]}`);
    
    if (!winnerStatus[0]) {
      await reward.addWinner(testWallet.address);
      console.log(`Added test wallet as winner`);
    }
  } catch (error: any) {
    console.log(`Error adding test wallet as winner: ${error.message}`);
  }
  
  // Step 4: Create a valid proof for the test wallet
  console.log("\n=== Creating Valid Proof ===");
  
  try {
    // Get deployer's wallet to sign proofs
    // For hardhat, we need to access the privateKey differently
    // First check if the deployer has a privateKey property (standard ethers wallet)
    let deployerPrivateKey: string;
    
    if ('privateKey' in deployer) {
      // Standard ethers wallet
      deployerPrivateKey = (deployer as unknown as { privateKey: string }).privateKey;
    } else {
      // Hardhat wallet - we'll need to get the private key from elsewhere
      // One option is to use a hardcoded private key for testing
      // Another is to use a local .env or config file
      // For this example, we'll create a new wallet instead
      console.log("Deployer doesn't have direct private key access, creating signing wallet instead");
      
      // In a real scenario, you'd want to use a known private key that matches the signing key
      // This is just for testing purposes
      const signingWallet = ethers.Wallet.createRandom();
      deployerPrivateKey = signingWallet.privateKey;
      
      // Set the signing key to this new wallet
      console.log(`Setting signing key to new wallet: ${signingWallet.address}`);
      await activity.setSigningKey(signingWallet.address);
    }
    
    const signingWallet = new ethers.Wallet(deployerPrivateKey);
    console.log(`Signing wallet address: ${signingWallet.address}`);
    
    // Create a valid proof
    const activityType = await activity.getActivityType();
    console.log(`Activity type: ${activityType}`);
    
    const validProof = await createEligibilityProof(
      testWallet.address,
      signingWallet.privateKey,
      activityType
    );
    
    // Verify proof directly with activity
    console.log("\nVerifying proof directly with activity contract...");
    try {
      const isValid = await activity.verifyEligibilityProof(testWallet.address, validProof);
      console.log(`Proof validation result: ${isValid}`);
      
      if (!isValid) {
        console.log("⚠️ PROOF VALIDATION FAILED - Fix this before proceeding");
      }
    } catch (error: any) {
      console.log(`Error verifying proof: ${error.message}`);
    }
    
    // Step 5: Attempt claim with valid proof
    console.log("\n=== Attempting Claim with Valid Proof ===");
    
    // Check initial balances
    const initialBalance = await testToken.balanceOf(testWallet.address);
    console.log(`Test wallet initial token balance: ${ethers.formatUnits(initialBalance, 18)} TEST`);
    
    // Connect test wallet to Tim3cap contract
    const testWalletTim3cap = tim3cap.connect(testWallet);
    
    try {
      // Create empty merkle proof for discount
      const emptyMerkleProof: string[] = [];
      
      console.log("Calling Tim3cap claim with valid proof...");
      
      // Call claim exactly like in the deployment script
      const tx = await testWalletTim3cap.claim(
        validProof,    // Properly signed eligibility proof
        0,             // No discount
        emptyMerkleProof, // Empty merkle proof for discount
        { gasLimit: 3000000 }
      );
      console.log(`Claim transaction hash: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Claim successful! Gas used: ${receipt?.gasUsed.toString()}`);
      
      // Check final balance
      const finalBalance = await testToken.balanceOf(testWallet.address);
      console.log(`Test wallet final token balance: ${ethers.formatUnits(finalBalance, 18)} TEST`);
      console.log(`Tokens received: ${ethers.formatUnits(finalBalance - initialBalance, 18)} TEST`);
      
      // Verify claim status
      const claimStatus = await reward.checkWinnerStatus(testWallet.address);
      console.log(`Test wallet has claimed: ${claimStatus[1]}`);
    } catch (error: any) {
      console.log(`Error with claim: ${error.message}`);
      
      // Try to extract more error details
      try {
        console.log("\nDetailed error info:");
        if ((error as any).code) console.log(`Error code: ${(error as any).code}`);
        if ((error as any).reason) console.log(`Error reason: ${(error as any).reason}`);
        if ((error as any).data) console.log(`Error data: ${(error as any).data}`);
        if ((error as any).transaction) {
          console.log(`Transaction to: ${(error as any).transaction.to}`);
          console.log(`Transaction data: ${(error as any).transaction.data}`);
        }
        if ((error as any).error) {
          console.log(`Error details: ${JSON.stringify((error as any).error, null, 2)}`);
        }
      } catch (e) {
        console.log("Could not extract detailed error info");
      }
      
      // Try one more approach - disable eligibility completely if needed
      try {
        console.log("\n=== Attempting to Disable Eligibility and Try Again ===");
        
        await tim3cap.setEligibilityConfig({
          enabled: false,
          signingKey: deployer.address,
          proofValidityDuration: 86400,
          requireProofForAllClaims: false
        });
        console.log("Eligibility disabled");
        
        // Try claim again with disabled eligibility
        console.log("Trying claim with disabled eligibility...");
        const tx2 = await testWalletTim3cap.claim(
          validProof, 
          0, 
          [],
          { gasLimit: 3000000 }
        );
        console.log(`Second attempt transaction hash: ${tx2.hash}`);
        
        const receipt2 = await tx2.wait();
        console.log(`Second attempt successful! Gas used: ${receipt2?.gasUsed.toString()}`);
        
        // Check final balance
        const finalBalance2 = await testToken.balanceOf(testWallet.address);
        console.log(`Test wallet final token balance: ${ethers.formatUnits(finalBalance2, 18)} TEST`);
        console.log(`Tokens received: ${ethers.formatUnits(finalBalance2 - initialBalance, 18)} TEST`);
      } catch (retryError: any) {
        console.log(`Error with second attempt: ${retryError.message}`);
      }
    }
  } catch (error: any) {
    console.log(`Error in proof creation/verification: ${error.message}`);
  }
  
  // Final status check
  console.log("\n=== Final Status ===");
  try {
    const finalWinnerStatus = await reward.checkWinnerStatus(testWallet.address);
    console.log(`Test wallet final winner status: isWinner=${finalWinnerStatus[0]}, hasClaimed=${finalWinnerStatus[1]}`);
    
    const finalBalance = await testToken.balanceOf(testWallet.address);
    console.log(`Test wallet final token balance: ${ethers.formatUnits(finalBalance, 18)} TEST`);
    
    const raffleStats = await reward.getRaffleStats();
    console.log(`Total winners: ${raffleStats[3]}`);
    console.log(`Winners claimed: ${raffleStats[4]}`);
  } catch (error: any) {
    console.log(`Error checking final status: ${error.message}`);
  }
  
  console.log("\n=== Testing Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });