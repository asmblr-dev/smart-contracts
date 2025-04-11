// scripts/token_airdrop/test-token-airdrop.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing TokenAirdropReward ===");
  
  // Get signer - handle case where we might only have a deployer on live networks
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "airdrop-instances.json");
  
  if (!fs.existsSync(baseDeploymentFile) || !fs.existsSync(instanceFile)) {
    console.error("Deployment files not found");
    console.error("Please run deploy-implementation.ts and deploy-instance.ts first");
    process.exit(1);
  }
  
  const baseDeploymentData = JSON.parse(fs.readFileSync(baseDeploymentFile, "utf8"));
  const instanceData = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
  
  console.log("Loaded deployment data:");
  console.log(`- Test Token: ${baseDeploymentData.contracts.testToken}`);
  console.log(`- Manual Tim3cap: ${instanceData.manualInstance.tim3cap}`);
  console.log(`- Automatic Tim3cap: ${instanceData.automaticInstance.tim3cap}`);
  console.log(`- Broker Wallet: ${instanceData.brokerWallet.address}`);
  console.log(`- Number of eligible users: ${instanceData.eligibleUsers.length}`);
  
  // Setup contract factories and instances
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const TestToken = await ethers.getContractFactory("TestToken");
  
  // Get contract instances
  const manualTim3cap = Tim3cap.attach(instanceData.manualInstance.tim3cap);
  const manualReward = TokenAirdropReward.attach(instanceData.manualInstance.reward);
  
  const automaticTim3cap = Tim3cap.attach(instanceData.automaticInstance.tim3cap);
  const automaticReward = TokenAirdropReward.attach(instanceData.automaticInstance.reward);
  
  const testToken = TestToken.attach(baseDeploymentData.contracts.testToken);
  
  // Connect broker wallet
  const brokerWallet = new ethers.Wallet(instanceData.brokerWallet.privateKey, deployer.provider);
  console.log(`Connected to broker wallet: ${brokerWallet.address}`);
  
  // 1. Test manual claim process
  console.log("\n=== Testing Manual Claim Process (Deployer) ===");
  
  // Check initial token balances
  const initialDeployerBalance = await testToken.balanceOf(deployer.address);
  console.log(`Initial deployer token balance: ${ethers.formatUnits(initialDeployerBalance, 18)}`);
  
  // Check if user has already claimed
  const hasDeployerClaimed = await manualReward.hasUserClaimed(deployer.address);
  console.log(`Has deployer claimed: ${hasDeployerClaimed}`);
  
  // Get airdrop stats
  const airdropStats = await manualReward.getAirdropStats();
  console.log("Airdrop Stats:");
  console.log(`- Name: ${airdropStats[0]}`);
  console.log(`- Token: ${airdropStats[1]}`);
  console.log(`- Amount per user: ${ethers.formatUnits(airdropStats[2], 18)}`);
  console.log(`- Total amount: ${ethers.formatUnits(airdropStats[3], 18)}`);
  console.log(`- Claimed amount: ${ethers.formatUnits(airdropStats[4], 18)}`);
  console.log(`- Claimed users: ${airdropStats[5]}`);
  console.log(`- Automatic: ${airdropStats[6]}`);
  console.log(`- Distribution date: ${new Date(Number(airdropStats[7]) * 1000).toLocaleString()}`);
  
  if (!hasDeployerClaimed) {
    // Create eligibility proof for the manual claim
    console.log("Creating eligibility proof...");
    const timestamp = Math.floor(Date.now() / 1000);
    const message = ethers.getBytes(ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "string"],
        [deployer.address, timestamp, "HOLD_X_NFTS"]
      )
    ));
    const signature = await deployer.signMessage(message);
    
    // Encode the proof
    const proof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "uint256"],
      [signature, timestamp]
    );
    
    // Claim from the manual instance through Tim3cap
    console.log("Claiming from manual instance through Tim3cap...");
    try {
      const claimTx = await manualTim3cap.claim(proof, 0, [], {
        gasLimit: 3000000
      });
      console.log(`Manual claim transaction hash: ${claimTx.hash}`);
      
      const claimReceipt = await claimTx.wait();
      console.log(`Manual claim successful! Gas used: ${claimReceipt?.gasUsed.toString()}`);
      
      // Check token balance after claim
      const deployerBalance = await testToken.balanceOf(deployer.address);
      console.log(`Deployer token balance after manual claim: ${ethers.formatUnits(deployerBalance, 18)}`);
      
      // Check claim status
      const hasClaimedNow = await manualReward.hasUserClaimed(deployer.address);
      console.log(`Has deployer claimed now: ${hasClaimedNow}`);
      
      // Get updated airdrop stats
      const updatedStats = await manualReward.getAirdropStats();
      console.log("Updated Airdrop Stats:");
      console.log(`- Claimed amount: ${ethers.formatUnits(updatedStats[4], 18)}`);
      console.log(`- Claimed users: ${updatedStats[5]}`);
      
    } catch (error: any) {
      console.log("❌ Manual claim failed:", error.message);
      
      // Check if broker has enough tokens and allowance
      const brokerBalance = await testToken.balanceOf(brokerWallet.address);
      console.log(`Broker wallet token balance: ${ethers.formatUnits(brokerBalance, 18)}`);
      
      const allowance = await testToken.allowance(
        brokerWallet.address, 
        instanceData.manualInstance.reward
      );
      console.log(`Broker allowance for manual reward: ${ethers.formatUnits(allowance, 18)}`);
      
      // If allowance is insufficient, approve again
      if (allowance < ethers.parseUnits("10", 18)) {
        console.log("Insufficient allowance, approving tokens again...");
        const tokenWithBroker = testToken.connect(brokerWallet);
        const approveAmount = ethers.parseUnits("1000", 18);
              // @ts-ignore: TypeScript doesn't know about the claim method

        await tokenWithBroker.approve(instanceData.manualInstance.reward, approveAmount);
        console.log("Tokens approved");
      }
    }
  } else {
    console.log(`Deployer has already claimed tokens`);
  }
  
  // 2. Test automatic distribution
  console.log("\n=== Testing Automatic Distribution ===");
  
  // Get airdrop stats before distribution
  try {
    const stats = await automaticReward.getAirdropStats();
    console.log(`\nAutomatic airdrop stats before distribution:`);
    console.log(`- Name: ${stats[0]}`);
    console.log(`- Token address: ${stats[1]}`);
    console.log(`- Token amount per user: ${ethers.formatUnits(stats[2], 18)}`);
    console.log(`- Total amount: ${ethers.formatUnits(stats[3], 18)}`);
    console.log(`- Claimed amount: ${ethers.formatUnits(stats[4], 18)}`);
    console.log(`- Claimed users: ${stats[5]}`);
    console.log(`- Is automatic: ${stats[6]}`);
    console.log(`- Distribution date: ${new Date(Number(stats[7]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting airdrop stats:", error.message);
  }
  
  // Check if automatic distribution time has passed
  const automaticDistributionConfig = await automaticReward.config();
  const distributionDate = automaticDistributionConfig[5]; // distributionDate
  const currentTimestamp = Math.floor(Date.now() / 1000);
  
  console.log(`Current time: ${new Date(currentTimestamp * 1000).toLocaleString()}`);
  console.log(`Distribution date: ${new Date(Number(distributionDate) * 1000).toLocaleString()}`);
  
  if (currentTimestamp < Number(distributionDate)) {
    console.log(`Distribution date not reached yet. Waiting...`);
    console.log(`Fast-forwarding time by increasing block timestamp...`);
    
    try {
      // Fast-forward time
      await ethers.provider.send("evm_increaseTime", [600]); // 10 minutes
      await ethers.provider.send("evm_mine", []);
      console.log("Time fast-forwarded by 10 minutes");
    } catch (error: any) {
      console.log("❌ Error fast-forwarding time:", error.message);
      console.log("This is expected on live networks where you can't manipulate time");
      console.log("You'll need to wait for the actual distribution time to pass");
    }
  }
  
  // Trigger automatic distribution
  console.log("\nTriggering automatic distribution...");
  
  // Check token balances before distribution for eligible users
  console.log("Token balances before distribution:");
  for (const user of instanceData.eligibleUsers) {
    const balance = await testToken.balanceOf(user);
    console.log(`- ${user}: ${ethers.formatUnits(balance, 18)}`);
  }
  
  // Trigger automatic distribution with eligible users list
  try {
    const distributeTx = await automaticReward.triggerAutomaticDistribution(
      instanceData.eligibleUsers,
      {
        gasLimit: 3000000
      }
    );
    console.log(`Automatic distribution transaction hash: ${distributeTx.hash}`);
    
    const distributeReceipt = await distributeTx.wait();
    console.log(`Automatic distribution successful! Gas used: ${distributeReceipt?.gasUsed.toString()}`);
    
    // Check balances after automatic distribution
    console.log("Token balances after distribution:");
    for (const user of instanceData.eligibleUsers) {
      const balance = await testToken.balanceOf(user);
      console.log(`- ${user}: ${ethers.formatUnits(balance, 18)}`);
    }
    
    // Check claim status after distribution
    console.log("Claim status after distribution:");
    for (const user of instanceData.eligibleUsers) {
      const hasClaimed = await automaticReward.hasUserClaimed(user);
      console.log(`- ${user}: Has claimed=${hasClaimed}`);
    }
    
  } catch (error: any) {
    console.log("❌ Automatic distribution failed:", error.message);
    
    // Check if broker has enough tokens and allowance
    const brokerBalance = await testToken.balanceOf(brokerWallet.address);
    console.log(`Broker wallet token balance: ${ethers.formatUnits(brokerBalance, 18)}`);
    
    const allowance = await testToken.allowance(
      brokerWallet.address, 
      instanceData.automaticInstance.reward
    );
    console.log(`Broker allowance for automatic reward: ${ethers.formatUnits(allowance, 18)}`);
    
    // Check if distribution time has been reached
    const distributionTimeReached = currentTimestamp >= Number(distributionDate);
    console.log(`Distribution time reached: ${distributionTimeReached}`);
    
    // If allowance is insufficient, approve again
    if (allowance < ethers.parseUnits("30", 18)) { // Enough for 3 users at 10 tokens each
      console.log("Insufficient allowance, approving tokens again...");
      const tokenWithBroker = testToken.connect(brokerWallet);
      const approveAmount = ethers.parseUnits("1000", 18);
            // @ts-ignore: TypeScript doesn't know about the claim method

      await tokenWithBroker.approve(instanceData.automaticInstance.reward, approveAmount);
      console.log("Tokens approved, please try distribution again");
    }
  }
  
  // Get final airdrop stats
  try {
    const finalStats = await automaticReward.getAirdropStats();
    console.log(`\nAutomatic airdrop final stats:`);
    console.log(`- Name: ${finalStats[0]}`);
    console.log(`- Token address: ${finalStats[1]}`);
    console.log(`- Token amount per user: ${ethers.formatUnits(finalStats[2], 18)}`);
    console.log(`- Total amount: ${ethers.formatUnits(finalStats[3], 18)}`);
    console.log(`- Claimed amount: ${ethers.formatUnits(finalStats[4], 18)}`);
    console.log(`- Claimed users: ${finalStats[5]}`);
    console.log(`- Is automatic: ${finalStats[6]}`);
    console.log(`- Distribution date: ${new Date(Number(finalStats[7]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting final airdrop stats:", error.message);
  }
  
  // 3. Check broker wallet balance after distributions
  console.log("\n=== Checking Broker Wallet After Distributions ===");
  const finalBrokerBalance = await testToken.balanceOf(brokerWallet.address);
  const initialBrokerBalance = ethers.parseUnits("1000", 18); // From the deployment script
  
  console.log(`Broker wallet initial balance: ${ethers.formatUnits(initialBrokerBalance, 18)}`);
  console.log(`Broker wallet final balance: ${ethers.formatUnits(finalBrokerBalance, 18)}`);
  console.log(`Tokens distributed: ${ethers.formatUnits(initialBrokerBalance - finalBrokerBalance, 18)}`);
  
  // 4. Test the contract's debug function
  console.log("\n=== Testing Debug Function ===");
  try {
    const debugInfo = await manualReward.debugState(deployer.address);
    console.log("Contract Debug Information:");
    console.log(`- Is initialized: ${debugInfo[0]}`);
    console.log(`- Is active: ${debugInfo[1]}`);
    console.log(`- Total claims count: ${debugInfo[2]}`);
    console.log(`- Claim start: ${new Date(Number(debugInfo[3]) * 1000).toLocaleString()}`);
    console.log(`- Claim end: ${new Date(Number(debugInfo[4]) * 1000).toLocaleString()}`);
    console.log(`- User has claimed (BaseReward): ${debugInfo[5]}`);
    console.log(`- User tokens claimed: ${debugInfo[6]}`);
    console.log(`- Controller address: ${debugInfo[7]}`);
    console.log(`- Owner address: ${debugInfo[8]}`);
    console.log(`- Broker address: ${debugInfo[9]}`);
    console.log(`- Token amount per user: ${ethers.formatUnits(debugInfo[10], 18)}`);
    console.log(`- Total amount: ${ethers.formatUnits(debugInfo[11], 18)}`);
    console.log(`- Claimed amount: ${ethers.formatUnits(debugInfo[12], 18)}`);
    console.log(`- Is automatic: ${debugInfo[13]}`);
    console.log(`- Distribution date: ${new Date(Number(debugInfo[14]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting debug information:", error.message);
  }
  
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("Summary:");
  console.log(`- Test Token: ${baseDeploymentData.contracts.testToken}`);
  console.log(`- Manual Tim3cap: ${instanceData.manualInstance.tim3cap}`);
  console.log(`- Automatic Tim3cap: ${instanceData.automaticInstance.tim3cap}`);
  console.log(`- Broker Wallet: ${instanceData.brokerWallet.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });