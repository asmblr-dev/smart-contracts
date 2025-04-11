// scripts/nft_airdrop/test-nft-airdrop.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing NFTAirdropReward ===");
  
  // Get signer - handle case where we might only have a deployer on live networks
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "nft-airdrop-instances.json");
  
  if (!fs.existsSync(baseDeploymentFile) || !fs.existsSync(instanceFile)) {
    console.error("Deployment files not found");
    console.error("Please run deploy-implementation.ts and deploy-instance.ts first");
    process.exit(1);
  }
  
  const baseDeploymentData = JSON.parse(fs.readFileSync(baseDeploymentFile, "utf8"));
  const instanceData = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
  
  console.log("Loaded deployment data:");
  console.log(`- Airdrop NFT: ${baseDeploymentData.contracts.airdropNFT}`);
  console.log(`- Manual Tim3cap: ${instanceData.manualInstance.tim3cap}`);
  console.log(`- Automatic Tim3cap: ${instanceData.automaticInstance.tim3cap}`);
  console.log(`- Broker Wallet: ${instanceData.brokerWallet.address}`);
  console.log(`- Number of eligible users: ${instanceData.eligibleUsers.length}`);
  
  // Setup contract factories and instances
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const NFTAirdropReward = await ethers.getContractFactory("NFTAirdropReward");
  const TestNFT = await ethers.getContractFactory("TestNFT");
  
  // Get contract instances
  const manualTim3cap = Tim3cap.attach(instanceData.manualInstance.tim3cap);
  const manualReward = NFTAirdropReward.attach(instanceData.manualInstance.reward);
  
  const automaticTim3cap = Tim3cap.attach(instanceData.automaticInstance.tim3cap);
  const automaticReward = NFTAirdropReward.attach(instanceData.automaticInstance.reward);
  
  const airdropNFT = TestNFT.attach(baseDeploymentData.contracts.airdropNFT);
  
  // Connect broker wallet
  const brokerWallet = new ethers.Wallet(instanceData.brokerWallet.privateKey, deployer.provider);
  console.log(`Connected to broker wallet: ${brokerWallet.address}`);
  
  // 1. Test manual claim process
  console.log("\n=== Testing Manual Claim Process (Deployer) ===");
  
  // Check initial NFT balances
  const initialDeployerNFTBalance = await airdropNFT.balanceOf(deployer.address);
  console.log(`Initial deployer NFT balance: ${initialDeployerNFTBalance}`);
  
  // Check if user has already claimed
  const hasDeployerClaimed = await manualReward.hasUserClaimed(deployer.address);
  console.log(`Has deployer claimed: ${hasDeployerClaimed}`);
  
  const deployerTokenId = await manualReward.getUserTokenId(deployer.address);
  console.log(`Deployer assigned token ID: ${deployerTokenId}`);
  
  // Get airdrop stats
  const airdropStats = await manualReward.getAirdropStats();
  console.log("Airdrop Stats:");
  console.log(`- Name: ${airdropStats[0]}`);
  console.log(`- NFT contract: ${airdropStats[1]}`);
  console.log(`- Total amount: ${airdropStats[2]}`);
  console.log(`- Claimed amount: ${airdropStats[3]}`);
  console.log(`- Claimed users: ${airdropStats[4]}`);
  console.log(`- Automatic: ${airdropStats[5]}`);
  console.log(`- Distribution date: ${new Date(Number(airdropStats[6]) * 1000).toLocaleString()}`);
  
  // Check broker wallet NFT balance
  const brokerNFTCount = await manualReward.getBrokerNFTCount();
  console.log(`Broker wallet NFT balance: ${brokerNFTCount}`);
  
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
      
      // Check NFT balance after claim
      const deployerNFTBalance = await airdropNFT.balanceOf(deployer.address);
      console.log(`Deployer NFT balance after manual claim: ${deployerNFTBalance}`);
      
      // Get token ID if the deployer has an NFT
      if (deployerNFTBalance > initialDeployerNFTBalance) {
        const tokenId = await airdropNFT.tokenOfOwnerByIndex(deployer.address, 0);
        console.log(`Deployer's NFT token ID: ${tokenId}`);
      }
      
      // Check claim status
      const hasClaimedNow = await manualReward.hasUserClaimed(deployer.address);
      const tokenIdNow = await manualReward.getUserTokenId(deployer.address);
      console.log(`Has deployer claimed now: ${hasClaimedNow}, Token ID: ${tokenIdNow}`);
      
      // Get updated airdrop stats
      const updatedStats = await manualReward.getAirdropStats();
      console.log("Updated Airdrop Stats:");
      console.log(`- Claimed amount: ${updatedStats[3]}`);
      console.log(`- Claimed users: ${updatedStats[4]}`);
      
    } catch (error: any) {
      console.log("❌ Manual claim failed:", error.message);
      
      // Check broker approvals
      const approval = await airdropNFT.isApprovedForAll(
        brokerWallet.address, 
        instanceData.manualInstance.reward
      );
      console.log(`Broker approval for manual reward: ${approval}`);
      
      // If approval is missing, approve again
      if (!approval) {
        console.log("Missing approval, approving NFTs again...");
        const airdropNFTWithBroker = airdropNFT.connect(brokerWallet);
            // @ts-ignore: TypeScript doesn't know about the claim method
        await airdropNFTWithBroker.setApprovalForAll(instanceData.manualInstance.reward, true);
        console.log("NFTs approved");
      }
    }
  } else {
    console.log(`Deployer has already claimed an NFT`);
  }
  
  // 2. Test manual token ID assignment
  console.log("\n=== Testing Manual Token ID Assignment ===");
  
  try {
    // Get broker NFT balance
    const brokerBalance = await airdropNFT.balanceOf(instanceData.brokerWallet.address);
    console.log(`Broker wallet NFT balance: ${brokerBalance}`);
    
    if (brokerBalance > 0) {
      // Get a token ID owned by the broker
      const tokenId = await airdropNFT.tokenOfOwnerByIndex(instanceData.brokerWallet.address, 0);
      console.log(`Found token ID ${tokenId} owned by broker wallet`);
      
      // Find an eligible user who hasn't claimed yet
      let unclaimedUser = null;
      for (const user of instanceData.eligibleUsers) {
        const hasClaimed = await manualReward.hasUserClaimed(user);
        if (!hasClaimed && user !== deployer.address) {
          unclaimedUser = user;
          break;
        }
      }
      
      if (unclaimedUser) {
        console.log(`Found unclaimed eligible user: ${unclaimedUser}`);
        console.log(`Assigning token ID ${tokenId} to user ${unclaimedUser}`);
        
        // Create arrays for assignment
        const users = [unclaimedUser];
        const tokenIds = [tokenId];
        
        // Assign token ID
        const assignTx = await manualReward.assignTokenIds(users, tokenIds);
        await assignTx.wait();
        console.log(`Token ID ${tokenId} assigned to user ${unclaimedUser}`);
        
        // Check token assignment
        const userTokenId = await manualReward.getUserTokenId(unclaimedUser);
        console.log(`User token ID after assignment: ${userTokenId}`);
        
        console.log(`Testing if token ID is marked as assigned`);
        const isAssigned = await manualReward.isTokenIdAssigned(tokenId);
        console.log(`Token ID ${tokenId} is assigned: ${isAssigned}`);
      } else {
        console.log("No unclaimed eligible users found for manual token assignment test");
      }
    } else {
      console.log("Broker has no remaining NFTs for assignment test");
    }
  } catch (error: any) {
    console.log("❌ Error during manual token assignment test:", error.message);
  }
  
  // 3. Test automatic distribution
  console.log("\n=== Testing Automatic Distribution ===");
  
  // Get airdrop stats before distribution
  try {
    const stats = await automaticReward.getAirdropStats();
    console.log(`\nAutomatic airdrop stats before distribution:`);
    console.log(`- Name: ${stats[0]}`);
    console.log(`- NFT contract: ${stats[1]}`);
    console.log(`- Total amount: ${stats[2]}`);
    console.log(`- Claimed amount: ${stats[3]}`);
    console.log(`- Claimed users: ${stats[4]}`);
    console.log(`- Is automatic: ${stats[5]}`);
    console.log(`- Distribution date: ${new Date(Number(stats[6]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting airdrop stats:", error.message);
  }
  
  // Check if automatic distribution time has passed
  const automaticDistributionConfig = await automaticReward.config();
  const distributionDate = automaticDistributionConfig[4]; // distributionDate
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
  
  // Check NFT balances before distribution for all eligible users
  console.log("NFT balances before distribution:");
  for (const user of instanceData.eligibleUsers) {
    try {
      const balance = await airdropNFT.balanceOf(user);
      console.log(`- ${user}: ${balance}`);
    } catch (error) {
      console.log(`- ${user}: Error getting balance`);
    }
  }
  
  // Check claimed status before distribution
  console.log("Claim status before distribution:");
  for (const user of instanceData.eligibleUsers) {
    try {
      const hasClaimed = await automaticReward.hasUserClaimed(user);
      const tokenId = await automaticReward.getUserTokenId(user);
      console.log(`- ${user}: Claimed=${hasClaimed}, TokenId=${tokenId}`);
    } catch (error) {
      console.log(`- ${user}: Error checking status`);
    }
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
    
    // Check NFT balances after distribution
    console.log("NFT balances after distribution:");
    for (const user of instanceData.eligibleUsers) {
      try {
        const balance = await airdropNFT.balanceOf(user);
        console.log(`- ${user}: ${balance}`);
        
        // If the user has NFTs, show the token IDs
        if (balance > 0) {
          for (let i = 0; i < balance.toNumber(); i++) {
            const tokenId = await airdropNFT.tokenOfOwnerByIndex(user, i);
            console.log(`  Token ID: ${tokenId}`);
          }
        }
      } catch (error) {
        console.log(`- ${user}: Error getting balance`);
      }
    }
    
    // Check claim status after distribution
    console.log("Claim status after distribution:");
    for (const user of instanceData.eligibleUsers) {
      try {
        const hasClaimed = await automaticReward.hasUserClaimed(user);
        const tokenId = await automaticReward.getUserTokenId(user);
        console.log(`- ${user}: Claimed=${hasClaimed}, TokenId=${tokenId}`);
      } catch (error) {
        console.log(`- ${user}: Error checking status`);
      }
    }
    
  } catch (error: any) {
    console.log("❌ Automatic distribution failed:", error.message);
    
    // Check if broker has approved NFTs
    const approval = await airdropNFT.isApprovedForAll(
      instanceData.brokerWallet.address, 
      instanceData.automaticInstance.reward
    );
    console.log(`Broker approval for automatic reward: ${approval}`);
    
    // Check broker NFT balance
    const brokerBalance = await airdropNFT.balanceOf(instanceData.brokerWallet.address);
    console.log(`Broker wallet NFT balance: ${brokerBalance}`);
    
    // Check if distribution time has been reached
    const distributionTimeReached = currentTimestamp >= Number(distributionDate);
    console.log(`Distribution time reached: ${distributionTimeReached}`);
    
    // If approval is missing, approve again
    if (!approval) {
      console.log("Missing approval, approving NFTs again...");
      const airdropNFTWithBroker = airdropNFT.connect(brokerWallet);
              // @ts-ignore: TypeScript doesn't know about the claim method
      await airdropNFTWithBroker.setApprovalForAll(instanceData.automaticInstance.reward, true);
      console.log("NFTs approved, please try distribution again");
    }
  }
  
  // Get final airdrop stats
  try {
    const finalStats = await automaticReward.getAirdropStats();
    console.log(`\nAutomatic airdrop final stats:`);
    console.log(`- Name: ${finalStats[0]}`);
    console.log(`- NFT contract: ${finalStats[1]}`);
    console.log(`- Total amount: ${finalStats[2]}`);
    console.log(`- Claimed amount: ${finalStats[3]}`);
    console.log(`- Claimed users: ${finalStats[4]}`);
    console.log(`- Is automatic: ${finalStats[5]}`);
    console.log(`- Distribution date: ${new Date(Number(finalStats[6]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting final airdrop stats:", error.message);
  }
  
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
    console.log(`- User NFT claimed: ${debugInfo[6]}`);
    console.log(`- User token ID: ${debugInfo[7]}`);
    console.log(`- Controller address: ${debugInfo[8]}`);
    console.log(`- Owner address: ${debugInfo[9]}`);
    console.log(`- Broker address: ${debugInfo[10]}`);
    console.log(`- Total amount: ${debugInfo[11]}`);
    console.log(`- Claimed amount: ${debugInfo[12]}`);
    console.log(`- Is automatic: ${debugInfo[13]}`);
    console.log(`- Distribution date: ${new Date(Number(debugInfo[14]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting debug information:", error.message);
  }
  
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("Summary:");
  console.log(`- Airdrop NFT: ${baseDeploymentData.contracts.airdropNFT}`);
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