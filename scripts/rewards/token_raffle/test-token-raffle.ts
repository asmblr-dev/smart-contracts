// scripts/token_raffle/test-token-raffle.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing TokenRaffleReward ===");
  
  // Get signer - handle case where we might only have a deployer on live networks
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "raffle-instances.json");
  
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
  console.log(`- Number of winners: ${instanceData.winners.length}`);
  
  // Setup contract factories and instances
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const TokenRaffleReward = await ethers.getContractFactory("TokenRaffleReward");
  const TestToken = await ethers.getContractFactory("TestToken");
  
  // Get contract instances
  const manualTim3cap = Tim3cap.attach(instanceData.manualInstance.tim3cap);
  const manualReward = TokenRaffleReward.attach(instanceData.manualInstance.reward);
  
  const automaticTim3cap = Tim3cap.attach(instanceData.automaticInstance.tim3cap);
  const automaticReward = TokenRaffleReward.attach(instanceData.automaticInstance.reward);
  
  const testToken = TestToken.attach(baseDeploymentData.contracts.testToken);
  
  // Connect broker wallet
  const brokerWallet = new ethers.Wallet(instanceData.brokerWallet.privateKey, deployer.provider);
  console.log(`Connected to broker wallet: ${brokerWallet.address}`);
  
  // 1. Test manual claim process
  console.log("\n=== Testing Manual Claim Process (Deployer) ===");
  
  // Check initial token balances
  const initialDeployerBalance = await testToken.balanceOf(deployer.address);
  console.log(`Initial deployer token balance: ${ethers.formatUnits(initialDeployerBalance, 18)}`);
  
  // Check if user is a winner
  const [isDeployerWinner, hasDeployerClaimed] = await manualReward.checkWinnerStatus(deployer.address);
  console.log(`Is deployer a winner: ${isDeployerWinner}`);
  console.log(`Has deployer claimed: ${hasDeployerClaimed}`);
  
  if (isDeployerWinner && !hasDeployerClaimed) {
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
      const [isWinnerNow, hasClaimedNow] = await manualReward.checkWinnerStatus(deployer.address);
      console.log(`Manual instance - Is winner: ${isWinnerNow}, Has claimed: ${hasClaimedNow}`);
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
    console.log(`Deployer is either not a winner or has already claimed`);
  }
  
  // 2. Test automatic distribution
  console.log("\n=== Testing Automatic Distribution ===");
  
  // Get raffle stats before distribution
  try {
    const stats = await automaticReward.getRaffleStats();
    console.log(`\nAutomatic raffle stats before distribution:`);
    console.log(`- Name: ${stats[0]}`);
    console.log(`- Token address: ${stats[1]}`);
    console.log(`- Token amount per winner: ${ethers.formatUnits(stats[2], 18)}`);
    console.log(`- Winners count: ${stats[3]}`);
    console.log(`- Total winners claimed: ${stats[4]}`);
    console.log(`- Is automatic: ${stats[5]}`);
    console.log(`- Distribution date: ${new Date(Number(stats[6]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting raffle stats:", error.message);
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
  
  // Check token balances before distribution for all winners
  console.log("Token balances before distribution:");
  for (const winner of instanceData.winners) {
    const balance = await testToken.balanceOf(winner);
    console.log(`- ${winner}: ${ethers.formatUnits(balance, 18)}`);
  }
  
  // Trigger automatic distribution
  try {
    const distributeTx = await automaticReward.triggerAutomaticDistribution({
      gasLimit: 3000000
    });
    console.log(`Automatic distribution transaction hash: ${distributeTx.hash}`);
    
    const distributeReceipt = await distributeTx.wait();
    console.log(`Automatic distribution successful! Gas used: ${distributeReceipt?.gasUsed.toString()}`);
    
    // Check balances after automatic distribution
    console.log("Token balances after distribution:");
    for (const winner of instanceData.winners) {
      const balance = await testToken.balanceOf(winner);
      console.log(`- ${winner}: ${ethers.formatUnits(balance, 18)}`);
    }
    
    // Check claim status after distribution
    console.log("Claim status after distribution:");
    for (const winner of instanceData.winners) {
      const [isWinner, hasClaimed] = await automaticReward.checkWinnerStatus(winner);
      console.log(`- ${winner}: Winner=${isWinner}, Claimed=${hasClaimed}`);
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
    if (allowance < ethers.parseUnits("30", 18)) { // Enough for 3 winners at 10 tokens each
      console.log("Insufficient allowance, approving tokens again...");
      const tokenWithBroker = testToken.connect(brokerWallet);
      const approveAmount = ethers.parseUnits("1000", 18);
          // @ts-ignore: TypeScript doesn't know about the claim method
      await tokenWithBroker.approve(instanceData.automaticInstance.reward, approveAmount);
      console.log("Tokens approved, please try distribution again");
    }
  }
  
  // Get final raffle stats
  try {
    const finalStats = await automaticReward.getRaffleStats();
    console.log(`\nAutomatic raffle final stats:`);
    console.log(`- Name: ${finalStats[0]}`);
    console.log(`- Token address: ${finalStats[1]}`);
    console.log(`- Token amount per winner: ${ethers.formatUnits(finalStats[2], 18)}`);
    console.log(`- Winners count: ${finalStats[3]}`);
    console.log(`- Total winners claimed: ${finalStats[4]}`);
    console.log(`- Is automatic: ${finalStats[5]}`);
    console.log(`- Distribution date: ${new Date(Number(finalStats[6]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting final raffle stats:", error.message);
  }
  
  // 3. Check broker wallet balance after distributions
  console.log("\n=== Checking Broker Wallet After Distributions ===");
  const finalBrokerBalance = await testToken.balanceOf(brokerWallet.address);
  const initialBrokerBalance = ethers.parseUnits("1000", 18); // From the deployment script
  
  console.log(`Broker wallet initial balance: ${ethers.formatUnits(initialBrokerBalance, 18)}`);
  console.log(`Broker wallet final balance: ${ethers.formatUnits(finalBrokerBalance, 18)}`);
  console.log(`Tokens distributed: ${ethers.formatUnits(initialBrokerBalance - finalBrokerBalance, 18)}`);
  
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