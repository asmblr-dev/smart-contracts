// scripts/nft_raffle/test-nft-raffle.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing NFTRaffleReward ===");
  
  // Get signer - handle case where we might only have a deployer on live networks
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "nft-raffle-instances.json");
  
  if (!fs.existsSync(baseDeploymentFile) || !fs.existsSync(instanceFile)) {
    console.error("Deployment files not found");
    console.error("Please run deploy-implementation.ts and deploy-instance.ts first");
    process.exit(1);
  }
  
  const baseDeploymentData = JSON.parse(fs.readFileSync(baseDeploymentFile, "utf8"));
  const instanceData = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
  
  console.log("Loaded deployment data:");
  console.log(`- Raffle NFT: ${baseDeploymentData.contracts.raffleNFT}`);
  console.log(`- Manual Tim3cap: ${instanceData.manualInstance.tim3cap}`);
  console.log(`- Automatic Tim3cap: ${instanceData.automaticInstance.tim3cap}`);
  console.log(`- Broker Wallet: ${instanceData.brokerWallet.address}`);
  console.log(`- Number of winners: ${instanceData.winners.length}`);
  
  // Setup contract factories and instances
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const NFTRaffleReward = await ethers.getContractFactory("NFTRaffleReward");
  const TestNFT = await ethers.getContractFactory("TestNFT");
  
  // Get contract instances
  const manualTim3cap = Tim3cap.attach(instanceData.manualInstance.tim3cap);
  const manualReward = NFTRaffleReward.attach(instanceData.manualInstance.reward);
  
  const automaticTim3cap = Tim3cap.attach(instanceData.automaticInstance.tim3cap);
  const automaticReward = NFTRaffleReward.attach(instanceData.automaticInstance.reward);
  
  const raffleNFT = TestNFT.attach(baseDeploymentData.contracts.raffleNFT);
  
  // Connect broker wallet
  const brokerWallet = new ethers.Wallet(instanceData.brokerWallet.privateKey, deployer.provider);
  console.log(`Connected to broker wallet: ${brokerWallet.address}`);
  
  // 1. Test manual claim process
  console.log("\n=== Testing Manual Claim Process (Deployer) ===");
  
  // Check initial NFT balances
  const initialDeployerNFTBalance = await raffleNFT.balanceOf(deployer.address);
  console.log(`Initial deployer NFT balance: ${initialDeployerNFTBalance}`);
  
  // Check if user is a winner and has claimed
  const [isDeployerWinner, hasDeployerClaimed, deployerTokenId] = await manualReward.checkWinnerStatus(deployer.address);
  console.log(`Is deployer a winner: ${isDeployerWinner}`);
  console.log(`Has deployer claimed: ${hasDeployerClaimed}`);
  console.log(`Deployer assigned token ID: ${deployerTokenId}`);
  
  // Get raffle stats
  const raffleStats = await manualReward.getRaffleStats();
  console.log("Raffle Stats:");
  console.log(`- Name: ${raffleStats[0]}`);
  console.log(`- NFT contract: ${raffleStats[1]}`);
  console.log(`- Winners count: ${raffleStats[2]}`);
  console.log(`- NFTs claimed: ${raffleStats[3]}`);
  console.log(`- Automatic: ${raffleStats[4]}`);
  console.log(`- Distribution date: ${new Date(Number(raffleStats[5]) * 1000).toLocaleString()}`);
  
  // Check broker wallet NFT balance
  const brokerNFTCount = await manualReward.getBrokerNFTCount();
  console.log(`Broker wallet NFT balance: ${brokerNFTCount}`);
  
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
      
      // Check NFT balance after claim
      const deployerNFTBalance = await raffleNFT.balanceOf(deployer.address);
      console.log(`Deployer NFT balance after manual claim: ${deployerNFTBalance}`);
      
      // Check claim status
      const [isWinnerNow, hasClaimedNow, tokenIdNow] = await manualReward.checkWinnerStatus(deployer.address);
      console.log(`Manual instance - Is winner: ${isWinnerNow}, Has claimed: ${hasClaimedNow}, Token ID: ${tokenIdNow}`);
      
      // Get NFT token ID if the deployer has an NFT
      if (deployerNFTBalance > 0) {
        const tokenId = await raffleNFT.tokenOfOwnerByIndex(deployer.address, 0);
        console.log(`Deployer's NFT token ID: ${tokenId}`);
      }
      
    } catch (error: any) {
      console.log("❌ Manual claim failed:", error.message);
      
      // Check broker approvals
      const approval = await raffleNFT.isApprovedForAll(
        brokerWallet.address, 
        instanceData.manualInstance.reward
      );
      console.log(`Broker approval for manual reward: ${approval}`);
      
      // If approval is missing, approve again
      if (!approval) {
        console.log("Missing approval, approving NFTs again...");
        const raffleNFTWithBroker = raffleNFT.connect(brokerWallet);
                // @ts-ignore: TypeScript doesn't know about the claim method
        await raffleNFTWithBroker.setApprovalForAll(instanceData.manualInstance.reward, true);
        console.log("NFTs approved");
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
    console.log(`- NFT contract: ${stats[1]}`);
    console.log(`- Winners count: ${stats[2]}`);
    console.log(`- NFTs claimed: ${stats[3]}`);
    console.log(`- Is automatic: ${stats[4]}`);
    console.log(`- Distribution date: ${new Date(Number(stats[5]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting raffle stats:", error.message);
  }
  
  // Check if automatic distribution time has passed
  const automaticDistributionConfig = await automaticReward.config();
  const distributionDate = automaticDistributionConfig[3]; // distributionDate
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
  
  // Check NFT balances before distribution for all winners
  console.log("NFT balances before distribution:");
  for (const winner of instanceData.winners) {
    try {
      const balance = await raffleNFT.balanceOf(winner);
      console.log(`- ${winner}: ${balance}`);
    } catch (error) {
      console.log(`- ${winner}: Error getting balance`);
    }
  }
  
  // Check winner status before distribution
  console.log("Winner status before distribution:");
  for (const winner of instanceData.winners) {
    try {
      const [isWinner, hasClaimed, tokenId] = await automaticReward.checkWinnerStatus(winner);
      console.log(`- ${winner}: Winner=${isWinner}, Claimed=${hasClaimed}, TokenId=${tokenId}`);
    } catch (error) {
      console.log(`- ${winner}: Error checking status`);
    }
  }
  
  // Trigger automatic distribution
  try {
    const distributeTx = await automaticReward.triggerAutomaticDistribution({
      gasLimit: 3000000
    });
    console.log(`Automatic distribution transaction hash: ${distributeTx.hash}`);
    
    const distributeReceipt = await distributeTx.wait();
    console.log(`Automatic distribution successful! Gas used: ${distributeReceipt?.gasUsed.toString()}`);
    
    // Check NFT balances after distribution
    console.log("NFT balances after distribution:");
    for (const winner of instanceData.winners) {
      try {
        const balance = await raffleNFT.balanceOf(winner);
        console.log(`- ${winner}: ${balance}`);
        
        // If the winner has NFTs, show the token IDs
        if (balance > 0) {
          for (let i = 0; i < balance; i++) {
            const tokenId = await raffleNFT.tokenOfOwnerByIndex(winner, i);
            console.log(`  Token ID: ${tokenId}`);
          }
        }
      } catch (error) {
        console.log(`- ${winner}: Error getting balance`);
      }
    }
    
    // Check claim status after distribution
    console.log("Winner status after distribution:");
    for (const winner of instanceData.winners) {
      try {
        const [isWinner, hasClaimed, tokenId] = await automaticReward.checkWinnerStatus(winner);
        console.log(`- ${winner}: Winner=${isWinner}, Claimed=${hasClaimed}, TokenId=${tokenId}`);
      } catch (error) {
        console.log(`- ${winner}: Error checking status`);
      }
    }
    
  } catch (error: any) {
    console.log("❌ Automatic distribution failed:", error.message);
    
    // Check if broker has approved NFTs
    const approval = await raffleNFT.isApprovedForAll(
      instanceData.brokerWallet.address, 
      instanceData.automaticInstance.reward
    );
    console.log(`Broker approval for automatic reward: ${approval}`);
    
    // Check broker NFT balance
    const brokerBalance = await raffleNFT.balanceOf(instanceData.brokerWallet.address);
    console.log(`Broker wallet NFT balance: ${brokerBalance}`);
    
    // Check if distribution time has been reached
    const distributionTimeReached = currentTimestamp >= Number(distributionDate);
    console.log(`Distribution time reached: ${distributionTimeReached}`);
    
    // If approval is missing, approve again
    if (!approval) {
      console.log("Missing approval, approving NFTs again...");
      const raffleNFTWithBroker = raffleNFT.connect(brokerWallet);
              // @ts-ignore: TypeScript doesn't know about the claim method
      await raffleNFTWithBroker.setApprovalForAll(instanceData.automaticInstance.reward, true);
      console.log("NFTs approved, please try distribution again");
    }
  }
  
  // Get final raffle stats
  try {
    const finalStats = await automaticReward.getRaffleStats();
    console.log(`\nAutomatic raffle final stats:`);
    console.log(`- Name: ${finalStats[0]}`);
    console.log(`- NFT contract: ${finalStats[1]}`);
    console.log(`- Winners count: ${finalStats[2]}`);
    console.log(`- NFTs claimed: ${finalStats[3]}`);
    console.log(`- Is automatic: ${finalStats[4]}`);
    console.log(`- Distribution date: ${new Date(Number(finalStats[5]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting final raffle stats:", error.message);
  }
  
  // 3. Test manual token ID assignment
  console.log("\n=== Testing Manual Token ID Assignment ===");
  
  try {
    // Get broker NFT balance
    const brokerBalance = await raffleNFT.balanceOf(instanceData.brokerWallet.address);
    console.log(`Broker wallet NFT balance: ${brokerBalance}`);
    
    if (brokerBalance > 0) {
      // Get a token ID owned by the broker
      const tokenId = await raffleNFT.tokenOfOwnerByIndex(instanceData.brokerWallet.address, 0);
      console.log(`Found token ID ${tokenId} owned by broker wallet`);
      
      // Get remaining winners who haven't claimed yet
      const unclaimedWinners: string[] = [];
      for (const winner of instanceData.winners) {
        const [isWinner, hasClaimed] = await manualReward.checkWinnerStatus(winner);
        if (isWinner && !hasClaimed) {
          unclaimedWinners.push(winner);
        }
      }
      
      if (unclaimedWinners.length > 0) {
        console.log(`Found ${unclaimedWinners.length} unclaimed winners`);
        const winner = unclaimedWinners[0];
        console.log(`Assigning token ID ${tokenId} to winner ${winner}`);
        
        // Create arrays for assignment
        const winners = [winner];
        const tokenIds = [tokenId];
        
        // Assign token ID
        const assignTx = await manualReward.assignTokenIds(winners, tokenIds);
        await assignTx.wait();
        console.log(`Token ID ${tokenId} assigned to winner ${winner}`);
        
        // Check token assignment
        const [isWinner, hasClaimed, assignedTokenId] = await manualReward.checkWinnerStatus(winner);
        console.log(`Winner status after assignment: Winner=${isWinner}, Claimed=${hasClaimed}, TokenId=${assignedTokenId}`);
        
        console.log(`Testing if token ID is marked as assigned`);
        const isAssigned = await manualReward.isTokenIdAssigned(tokenId);
        console.log(`Token ID ${tokenId} is assigned: ${isAssigned}`);
      } else {
        console.log("No unclaimed winners found for manual token assignment test");
      }
    } else {
      console.log("Broker has no remaining NFTs for assignment test");
    }
  } catch (error: any) {
    console.log("❌ Error during manual token assignment test:", error.message);
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
    console.log(`- User is winner: ${debugInfo[6]}`);
    console.log(`- User NFT claimed: ${debugInfo[7]}`);
    console.log(`- User assigned token ID: ${debugInfo[8]}`);
    console.log(`- Controller address: ${debugInfo[9]}`);
    console.log(`- Owner address: ${debugInfo[10]}`);
    console.log(`- Broker address: ${debugInfo[11]}`);
    console.log(`- Is automatic: ${debugInfo[12]}`);
    console.log(`- Distribution date: ${new Date(Number(debugInfo[13]) * 1000).toLocaleString()}`);
  } catch (error: any) {
    console.log("❌ Error getting debug information:", error.message);
  }
  
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("Summary:");
  console.log(`- Raffle NFT: ${baseDeploymentData.contracts.raffleNFT}`);
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