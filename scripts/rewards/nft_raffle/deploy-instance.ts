// scripts/nft_raffle/deploy-instance.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Creating New Tim3cap Instance with NFTRaffleReward ===");
  
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
  console.log(`- Activity NFT: ${contracts.activityNFT}`);
  console.log(`- Raffle NFT: ${contracts.raffleNFT}`);
  
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
  
  // Step 2: Mint NFTs to the broker wallet for raffle distribution
  console.log("\nMinting raffle NFTs to broker wallet...");
  const TestNFT = await ethers.getContractFactory("TestNFT");
  const raffleNFT = TestNFT.attach(contracts.raffleNFT);
  
  // Mint 5 NFTs to the broker wallet
  for (let i = 0; i < 5; i++) {
    await raffleNFT.safeMint(brokerWallet.address);
    console.log(`Minted raffle NFT #${i+1} to broker wallet`);
  }
  
  // Verify NFT balance of broker wallet
  const brokerNFTBalance = await raffleNFT.balanceOf(brokerWallet.address);
  console.log(`Broker wallet raffle NFT balance: ${brokerNFTBalance}`);
  
  // Step 3: Mint activity NFTs to the deployer for eligibility criteria
  console.log("\nMinting activity NFTs to deployer...");
  const activityNFT = TestNFT.attach(contracts.activityNFT);
  
  // Check if deployer already has NFTs
  const deployerNFTBalance = await activityNFT.balanceOf(deployer.address);
  if (deployerNFTBalance == 0) {
    await activityNFT.safeMint(deployer.address);
    console.log("Minted activity NFT to deployer");
  } else {
    console.log(`Deployer already has ${deployerNFTBalance} activity NFTs`);
  }
  
  // Step 4: Create Tim3cap instances for both manual and automatic modes
  console.log("\nSetting up contract factories...");
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const HoldXNfts = await ethers.getContractFactory("HoldXNfts");
  const NFTRaffleReward = await ethers.getContractFactory("NFTRaffleReward");
  const factory = await ethers.getContractFactory("Tim3capFactory");
  const tim3capFactory = factory.attach(contracts.factory);
  
  // Create a set of winners - deployer and additional addresses
  console.log("\nSetting up winners...");
  const winners = [deployer.address];
  
  // Create a couple of additional winner addresses
  const winner1 = ethers.Wallet.createRandom().address;
  const winner2 = ethers.Wallet.createRandom().address;
  winners.push(winner1);
  winners.push(winner2);
  
  console.log(`Winners:`);
  console.log(`- ${winners[0]} (deployer)`);
  console.log(`- ${winners[1]} (winner1)`);
  console.log(`- ${winners[2]} (winner2)`);
  
  // Test both manual and automatic modes
  const createForMode = async (automatic: any) => {
    const mode = automatic ? "Automatic" : "Manual";
    console.log(`\n--- Creating ${mode} Distribution NFTRaffleReward ---`);
    
    // Activity config
    const requiredAmount = 1; // Require 1 NFT from this collection
    const now = Math.floor(Date.now() / 1000);
    const activityConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]", "uint256[]", "uint256", "uint256", "uint256", "uint8"],
      [
        [contracts.activityNFT],
        [requiredAmount],
        now, // start date
        now + 30 * 24 * 60 * 60, // end date (30 days)
        0, // snapshot date (none)
        0 // listing status (any)
      ]
    );
    
    // Reward config
    const distributionDate = now + (automatic ? 5 * 60 : 30 * 24 * 60 * 60); // 5 minutes for automatic, 30 days for manual
    
    const rewardConfig = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "address", "address", "bool", "uint256"],
      [
        `Test NFT Raffle (${mode})`, // raffle name
        contracts.raffleNFT, // NFT address
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
      "NFT_RAFFLE", // Reward type
      contracts.nftRaffleRewardImpl, // Reward implementation
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
  
  // Step 5: Setup broker wallet to approve NFTs for both raffle contracts
  console.log("\n=== Setting Up Broker Wallet Approvals ===");
  
  // Create connected instances 
  const raffleNFTWithBroker = raffleNFT.connect(brokerWallet);
  
  // Approve NFTs for both reward contracts
  console.log("Approving NFTs for manual raffle contract...");
        // @ts-ignore: TypeScript doesn't know about the claim method
  const approveTx1 = await raffleNFTWithBroker.setApprovalForAll(
    manualInstance.reward,
    true
  );
  await approveTx1.wait();
  console.log(`Broker approved all NFTs for manual reward contract`);
  
  console.log("Approving NFTs for automatic raffle contract...");
        // @ts-ignore: TypeScript doesn't know about the claim method
  const approveTx2 = await raffleNFTWithBroker.setApprovalForAll(
    automaticInstance.reward,
    true
  );
  await approveTx2.wait();
  console.log(`Broker approved all NFTs for automatic reward contract`);
  
  // Verify approvals
  const manualApproval = await raffleNFT.isApprovedForAll(brokerWallet.address, manualInstance.reward);
  console.log(`Manual reward approval status: ${manualApproval}`);
  
  const automaticApproval = await raffleNFT.isApprovedForAll(brokerWallet.address, automaticInstance.reward);
  console.log(`Automatic reward approval status: ${automaticApproval}`);
  
  // Step 6: Set winners for both instances
  console.log("\n=== Setting Winners ===");
  
  // Get NFTRaffleReward contract instances
  const manualReward = NFTRaffleReward.attach(manualInstance.reward);
  const automaticReward = NFTRaffleReward.attach(automaticInstance.reward);
  
  // Set winners for manual instance
  await manualReward.setWinners(winners);
  console.log(`Set ${winners.length} winners for manual instance`);
  
  // Set winners for automatic instance
  await automaticReward.setWinners(winners);
  console.log(`Set ${winners.length} winners for automatic instance`);
  
  // Verify winners
  const manualWinners = await manualReward.getAllWinners();
  console.log(`Manual instance has ${manualWinners.length} winners`);
  
  const automaticWinners = await automaticReward.getAllWinners();
  console.log(`Automatic instance has ${automaticWinners.length} winners`);
  
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
    winners: winners,
    timestamp: new Date().toISOString()
  };
  
  const instanceFile = path.join(outputDir, "nft-raffle-instances.json");
  fs.writeFileSync(instanceFile, JSON.stringify(instanceData, null, 2));
  console.log(`\nInstance data saved to ${instanceFile}`);
  
  console.log("\n=== Instance Deployment Summary ===");
  console.log("Manual NFTRaffleReward Instance:");
  console.log(`- Tim3cap: ${manualInstance.tim3cap}`);
  console.log(`- Activity: ${manualInstance.activity}`);
  console.log(`- Reward: ${manualInstance.reward}`);
  
  console.log("\nAutomatic NFTRaffleReward Instance:");
  console.log(`- Tim3cap: ${automaticInstance.tim3cap}`);
  console.log(`- Activity: ${automaticInstance.activity}`);
  console.log(`- Reward: ${automaticInstance.reward}`);
  
  console.log("\nBroker Wallet:");
  console.log(`- Address: ${brokerWallet.address}`);
  console.log(`- Private Key: ${brokerWalletPrivateKey}`);
  
  console.log("\nWinners:");
  for (let i = 0; i < winners.length; i++) {
    console.log(`- Winner ${i+1}: ${winners[i]}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });