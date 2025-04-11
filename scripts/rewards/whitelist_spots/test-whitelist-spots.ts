// scripts/whitelist_spots/test-whitelist-spots.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing WhitelistSpots ===");
  
  // Get signer - handle case where we might only have a deployer on live networks
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "wl-spots-instances.json");
  
  if (!fs.existsSync(baseDeploymentFile) || !fs.existsSync(instanceFile)) {
    console.error("Deployment files not found");
    console.error("Please run deploy-implementation.ts and deploy-instance.ts first");
    process.exit(1);
  }
  
  const baseDeploymentData = JSON.parse(fs.readFileSync(baseDeploymentFile, "utf8"));
  const instanceData = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
  
  console.log("Loaded deployment data:");
  console.log(`- Manual Tim3cap: ${instanceData.manualInstance.tim3cap}`);
  console.log(`- Automatic Tim3cap: ${instanceData.automaticInstance.tim3cap}`);
  console.log(`- Number of eligible users: ${instanceData.eligibleUsers.length}`);
  
  // Setup contract factories and instances
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const WhitelistSpots = await ethers.getContractFactory("WhitelistSpots");
  
  // Get contract instances
  const manualTim3cap = Tim3cap.attach(instanceData.manualInstance.tim3cap);
  const manualReward = WhitelistSpots.attach(instanceData.manualInstance.reward);
  
  const automaticTim3cap = Tim3cap.attach(instanceData.automaticInstance.tim3cap);
  const automaticReward = WhitelistSpots.attach(instanceData.automaticInstance.reward);
  
  // 1. Test manual claim process
  console.log("\n=== Testing Manual Claim Process (Deployer) ===");
  
  // Check if user is eligible
  const [isDeployerEligible, hasDeployerClaimed] = await manualReward.checkEligibilityStatus(deployer.address);
  console.log(`Is deployer eligible: ${isDeployerEligible}`);
  console.log(`Has deployer claimed: ${hasDeployerClaimed}`);
  
  if (isDeployerEligible && !hasDeployerClaimed) {
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
      
      // Check claim status
      const [isEligibleNow, hasClaimedNow] = await manualReward.checkEligibilityStatus(deployer.address);
      console.log(`Manual instance - Is eligible: ${isEligibleNow}, Has claimed: ${hasClaimedNow}`);
      
      // Check assignment status
      const isAssigned = await manualReward.checkAssignmentStatus(deployer.address);
      console.log(`Manual instance - Is assigned: ${isAssigned}`);
    } catch (error: any) {
      console.log("❌ Manual claim failed:", error.message);
    }
  } else {
    console.log(`Deployer is either not eligible or has already claimed`);
  }
  
  // 2. Test automatic distribution with batch processing
  console.log("\n=== Testing Automatic Distribution with Batch Processing ===");
  
  // Get whitelist stats before distribution
  try {
    const stats = await automaticReward.getWhitelistStats();
    console.log(`\nAutomatic whitelist stats before distribution:`);
    console.log(`- Name: ${stats[0]}`);
    console.log(`- Eligible Count: ${stats[1]}`);
    console.log(`- Assigned Count: ${stats[2]}`);
    console.log(`- Claims Count: ${stats[3]}`);
    console.log(`- Is automatic: ${stats[4]}`);
    console.log(`- Distribution date: ${new Date(Number(stats[5]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting whitelist stats:", error.message);
  }
  
  // Check if automatic distribution time has passed
  const automaticDistributionConfig = await automaticReward.config();
  const distributionDate = automaticDistributionConfig[2]; // distributionDate
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
  
  // Trigger automatic distribution in batches
  console.log("\nTriggering automatic distribution in batches...");
  
  // Check assignment status before distribution for some users
  const sampleUsers = instanceData.eligibleUsers.slice(0, 5);
  console.log("Assignment status before distribution (sample):");
  for (const user of sampleUsers) {
    const isAssigned = await automaticReward.checkAssignmentStatus(user);
    console.log(`- ${user}: ${isAssigned}`);
  }
  
  // Process eligible users in batches
  const batchSize = 10; // Process 10 users at a time
  
  try {
    for (let i = 0; i < instanceData.eligibleUsers.length; i += batchSize) {
      const batch = instanceData.eligibleUsers.slice(i, Math.min(i + batchSize, instanceData.eligibleUsers.length));
      console.log(`Processing batch ${i/batchSize + 1} with ${batch.length} users...`);
      
      const distributeTx = await automaticReward.triggerAutomaticDistribution(batch, {
        gasLimit: 5000000
      });
      
      const distributionReceipt = await distributeTx.wait();
      console.log(`Batch distribution successful! Gas used: ${distributionReceipt?.gasUsed.toString()}`);
    }
    
    console.log("All batches processed successfully!");
    
    // Check status after automatic distribution for sample users
    console.log("Assignment status after distribution (sample):");
    for (const user of sampleUsers) {
      const isAssigned = await automaticReward.checkAssignmentStatus(user);
      console.log(`- ${user}: ${isAssigned}`);
    }
    
    // Check claim status after distribution for sample users
    console.log("Claim status after distribution (sample):");
    for (const user of sampleUsers) {
      const [isEligible, hasClaimed] = await automaticReward.checkEligibilityStatus(user);
      console.log(`- ${user}: Eligible=${isEligible}, Claimed=${hasClaimed}`);
    }
    
  } catch (error: any) {
    console.log("❌ Automatic distribution failed:", error.message);
    
    // Check if distribution time has been reached
    const distributionTimeReached = currentTimestamp >= Number(distributionDate);
    console.log(`Distribution time reached: ${distributionTimeReached}`);
  }
  
  // Get final whitelist stats
  try {
    const finalStats = await automaticReward.getWhitelistStats();
    console.log(`\nAutomatic whitelist final stats:`);
    console.log(`- Name: ${finalStats[0]}`);
    console.log(`- Eligible Count: ${finalStats[1]}`);
    console.log(`- Assigned Count: ${finalStats[2]}`);
    console.log(`- Claims Count: ${finalStats[3]}`);
    console.log(`- Is automatic: ${finalStats[4]}`);
    console.log(`- Distribution date: ${new Date(Number(finalStats[5]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting final whitelist stats:", error.message);
  }
  
  // 3. Test and demonstrate event logging for The Graph
  console.log("\n=== Testing Event Logging for The Graph ===");
  
  // Add a single eligible user directly to demonstrate individual event
  const newEligibleUser = ethers.Wallet.createRandom().address;
  console.log(`Adding new eligible user: ${newEligibleUser}`);
  
  try {
    const addTx = await manualReward.addEligible(newEligibleUser);
    const addReceipt = await addTx.wait();
    
    console.log("Added single eligible user, look for EligibleSingle event in logs");
    console.log(`Transaction hash: ${addTx.hash}`);
    
    // Manually check for the event
    const eligibleSingleEvent = addReceipt?.logs.find((log: any) => {
      try {
        const parsed = manualReward.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        return parsed?.name === "EligibleSingle";
      } catch {
        return false;
      }
    });
    
    if (eligibleSingleEvent) {
      console.log("EligibleSingle event found in logs!");
      const parsedEvent = manualReward.interface.parseLog({
        topics: eligibleSingleEvent.topics,
        data: eligibleSingleEvent.data
      });
      console.log("Event data:", parsedEvent?.args);
    }
    
    // Add a small batch to demonstrate batch event
    const smallBatch = [];
    for (let i = 0; i < 3; i++) {
      smallBatch.push(ethers.Wallet.createRandom().address);
    }
    
    console.log(`Adding small batch of ${smallBatch.length} users...`);
    const batchTx = await manualReward.addEligibleBatch(smallBatch);
    const batchReceipt = await batchTx.wait();
    
    console.log("Added batch of eligible users, look for EligibleBatch event in logs");
    console.log(`Transaction hash: ${batchTx.hash}`);
    
    // Manually check for the batch event
    const eligibleBatchEvent = batchReceipt?.logs.find((log: any) => {
      try {
        const parsed = manualReward.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        return parsed?.name === "EligibleBatch";
      } catch {
        return false;
      }
    });
    
    if (eligibleBatchEvent) {
      console.log("EligibleBatch event found in logs!");
      const parsedEvent = manualReward.interface.parseLog({
        topics: eligibleBatchEvent.topics,
        data: eligibleBatchEvent.data
      });
      console.log("Event contains", parsedEvent?.args[0].length, "addresses");
      
      // Print first address from the batch as sample
      if (parsedEvent?.args[0].length > 0) {
        console.log("First address in batch:", parsedEvent?.args[0][0]);
      }
    }
    
    // Assign spot to demonstrate spot assignment event
    console.log(`\nAssigning spot to single user via direct claim...`);
    const claimTx = await manualReward.claim(newEligibleUser);
    const claimReceipt = await claimTx.wait();
    
    // Look for the SpotAssigned event
    const spotAssignedEvent = claimReceipt?.logs.find((log: any) => {
      try {
        const parsed = manualReward.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        return parsed?.name === "SpotAssigned";
      } catch {
        return false;
      }
    });
    
    if (spotAssignedEvent) {
      console.log("SpotAssigned event found in logs!");
      const parsedEvent = manualReward.interface.parseLog({
        topics: spotAssignedEvent.topics,
        data: spotAssignedEvent.data
      });
      console.log("Event data:", parsedEvent?.args);
    }
    
  } catch (error: any) {
    console.log("❌ Event testing failed:", error.message);
  }
  
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("Summary:");
  console.log(`- Manual Tim3cap: ${instanceData.manualInstance.tim3cap}`);
  console.log(`- Automatic Tim3cap: ${instanceData.automaticInstance.tim3cap}`);
  console.log(`- Total eligible users: ${instanceData.eligibleUsers.length + 4}`); // original + 1 single + 3 batch
  console.log("\nThese contracts can now be indexed by The Graph using the emitted events.");
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });