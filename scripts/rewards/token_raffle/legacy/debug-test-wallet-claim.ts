// scripts/token_raffle/debug-test-wallet-claim.ts
import { ethers } from "hardhat";

/**
 * This script is specifically for debugging the test wallet claim issue
 * It connects to an existing deployment and tries different approaches to make a claim work
 */
async function main() {
  console.log("\n=== Debugging Test Wallet Claim for Token Raffle Reward ===");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // REPLACE THESE with your actual contract addresses from previous deployment
  const tim3capAddress = "0x11c816175b7Aa63C28D635bB109d4Ec9253E8F4b";  // Replace with your deployed Tim3cap address
  const activityAddress = "0x83cBd0f4159C933b2A2C2bB027711Dc3EA6Cb9dB"; // Replace with your deployed activity address
  const rewardAddress = "0x64A71f2F34db86B862fe6C6612851aDAE0B7f8b6";   // Replace with your deployed reward address
  const testTokenAddress = "0xE51e71Ec58344E03382d73A0EEdBc8E87C0BDf48"; // Replace with your deployed token address
  
  console.log("Using contract addresses:");
  console.log(`Tim3cap: ${tim3capAddress}`);
  console.log(`Activity: ${activityAddress}`);
  console.log(`Reward: ${rewardAddress}`);
  console.log(`Test Token: ${testTokenAddress}`);
  
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
    value: ethers.parseEther("0.01") // 0.01 ETH for gas - increased amount for debugging
  });
  console.log(`Sent 0.01 ETH to test wallet for gas`);
  
  // Check wallet balances
  const testWalletBalance = await deployer.provider.getBalance(testWallet.address);
  console.log(`Test wallet ETH balance: ${ethers.formatEther(testWalletBalance)}`);
  
  const testWalletTokenBalance = await testToken.balanceOf(testWallet.address);
  console.log(`Test wallet token balance: ${ethers.formatUnits(testWalletTokenBalance, 18)} TEST`);
  
  // Step 1: Add test wallet as winner
  console.log("\n=== Adding Test Wallet as Winner ===");
  try {
    await reward.addWinner(testWallet.address);
    console.log(`Added test wallet as winner`);
  } catch (error: any) {
    console.log(`Error adding test wallet as winner: ${error.message}`);
  }
  
  // Verify winner status
  try {
    const isWinner = await reward.checkWinnerStatus(testWallet.address);
    console.log(`Test wallet is winner: ${isWinner[0]}`);
    console.log(`Test wallet has claimed: ${isWinner[1]}`);
  } catch (error: any) {
    console.log(`Error checking winner status: ${error.message}`);
  }
  
  // Step 2: Check eligibility setup
  console.log("\n=== Checking Eligibility Setup ===");
  try {
    const eligibilityEnabled = await tim3cap.eligibilityEnabled();
    console.log(`Eligibility enabled: ${eligibilityEnabled}`);
    
    // If eligibility is enabled, try to disable it
    if (eligibilityEnabled) {
      console.log("Attempting to disable eligibility...");
      await tim3cap.setEligibilityConfig({
        enabled: false,
        signingKey: deployer.address,
        proofValidityDuration: 86400,
        requireProofForAllClaims: false
      });
      console.log("Eligibility disabled");
      
      // Verify eligibility is disabled
      const newEligibilityEnabled = await tim3cap.eligibilityEnabled();
      console.log(`Eligibility enabled after update: ${newEligibilityEnabled}`);
    }
  } catch (error: any) {
    console.log(`Error checking/updating eligibility: ${error.message}`);
  }
  
  // Step 3: Debug reward contract status
  console.log("\n=== Checking Reward Contract Status ===");
  try {
    // Check raffle stats
    const raffleStats = await reward.getRaffleStats();
    console.log("Raffle stats:");
    console.log(`- Name: ${raffleStats[0]}`);
    console.log(`- Token: ${raffleStats[1]}`);
    console.log(`- Amount per winner: ${ethers.formatUnits(raffleStats[2], 18)} TEST`);
    console.log(`- Winners count: ${raffleStats[3]}`);
    console.log(`- Claims processed: ${raffleStats[4]}`);
    console.log(`- Automatic: ${raffleStats[5]}`);
    
    // Check if contract is active
    if (typeof reward.active === 'function') {
      const isActive = await reward.active();
      console.log(`Reward contract active: ${isActive}`);
    }
    
    // Check claim dates
    if (typeof reward.claimStartDate === 'function') {
      const startDate = await reward.claimStartDate();
      const finishDate = await reward.claimFinishDate();
      console.log(`Claim start date: ${new Date(Number(startDate) * 1000).toLocaleString()}`);
      console.log(`Claim finish date: ${new Date(Number(finishDate) * 1000).toLocaleString()}`);
    }
  } catch (error: any) {
    console.log(`Error checking reward status: ${error.message}`);
  }
  
  // Step 4: Create multiple claim proof variations for testing
  console.log("\n=== Testing Different Claim Proofs ===");
  
  // Create timestamp
  const now = Math.floor(Date.now() / 1000);
  
  // Test different proof formats
  const proofs = [
    {
      name: "Empty Proof",
      data: ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes", "uint256"],
        ["0x", now]
      )
    },
    {
      name: "Empty Array Proof",
      data: ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes", "uint256"],
        [new Uint8Array(0), now]
      )
    },
    {
      name: "Zero Address Proof",
      data: ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes", "uint256"],
        [ethers.ZeroAddress, now]
      )
    }
  ];
  
  // Step 5: Try all proof variations with test wallet
  console.log("\n=== Attempting Claims with Test Wallet ===");
  
  // Connect test wallet to tim3cap contract
  const testWalletTim3cap = new ethers.Contract(
    tim3capAddress,
    [
      "function claim(bytes calldata proof, uint256 feeIndex, bytes32[] calldata merkleProof) external",
      "function eligibilityEnabled() external view returns (bool)"
    ],
    testWallet
  );
  
  // Create empty merkle proof array
  const emptyMerkleProof: string[] = [];
  
  // Try different proofs
  for (const proof of proofs) {
    console.log(`\nTrying ${proof.name}...`);
    try {
      console.log(`Calling tim3cap.claim with proof length ${ethers.dataLength(proof.data)}`);
      
      // Log exact calldata for debugging
      const calldata = testWalletTim3cap.interface.encodeFunctionData(
        "claim",
        [proof.data, 0, emptyMerkleProof]
      );
      console.log(`Calldata: ${calldata}`);
      
      // Send with high gas limit and debug trace
      const tx = await testWalletTim3cap.claim(
        proof.data,
        0,
        emptyMerkleProof,
        { 
          gasLimit: 5000000 // Very high gas limit for debugging
        }
      );
      console.log(`Transaction hash: ${tx.hash}`);
      
      // Wait for transaction
      const receipt = await tx.wait();
      console.log(`Transaction successful! Gas used: ${receipt?.gasUsed.toString()}`);
      
      // Check token balance after claim
      const newBalance = await testToken.balanceOf(testWallet.address);
      console.log(`Test wallet token balance after claim: ${ethers.formatUnits(newBalance, 18)} TEST`);
      
      // Verify claim status
      const updatedStatus = await reward.checkWinnerStatus(testWallet.address);
      console.log(`Test wallet has claimed: ${updatedStatus[1]}`);
      
      // If successful, exit loop
      if (updatedStatus[1]) {
        console.log("Claim successful! Breaking loop.");
        break;
      }
    } catch (error: any) {
      console.log(`Error with ${proof.name}: ${error.message}`);
      
      try {
        // Try to extract more error details
        console.log("\nDetailed error info:");
        if (error.code) console.log(`Error code: ${error.code}`);
        if (error.reason) console.log(`Error reason: ${error.reason}`);
        if (error.data) console.log(`Error data: ${error.data}`);
        if (error.transaction) {
          console.log(`Transaction to: ${error.transaction.to}`);
          console.log(`Transaction from: ${error.transaction.from}`);
          console.log(`Transaction data: ${error.transaction.data}`);
        }
      } catch (e) {
        console.log("Could not extract detailed error info");
      }
    }
  }
  
  // Step 6: Try as deployer if all test wallet attempts failed
  console.log("\n=== Attempting Proxy Claim via Deployer ===");
  try {
    // Check if test wallet can claim directly
    const canClaim = await reward.canClaim(testWallet.address);
    console.log(`Can test wallet claim according to contract: ${canClaim}`);
    
    // Check if test wallet's winner status
    const winnerStatus = await reward.checkWinnerStatus(testWallet.address);
    console.log(`Winner status: isWinner=${winnerStatus[0]}, hasClaimed=${winnerStatus[1]}`);
    
    // If still eligible, try proxy claim via controller
    if (winnerStatus[0] && !winnerStatus[1]) {
      // Try to call claim function on reward directly from the deployer (as a controller)
      const directClaimTx = await reward.claim(testWallet.address, { gasLimit: 3000000 });
      console.log(`Direct claim transaction hash: ${directClaimTx.hash}`);
      
      const directClaimReceipt = await directClaimTx.wait();
      console.log(`Direct claim successful! Gas used: ${directClaimReceipt?.gasUsed.toString()}`);
      
      // Check token balance after direct claim
      const finalBalance = await testToken.balanceOf(testWallet.address);
      console.log(`Test wallet token balance after direct claim: ${ethers.formatUnits(finalBalance, 18)} TEST`);
      
      // Verify final claim status
      const finalStatus = await reward.checkWinnerStatus(testWallet.address);
      console.log(`Test wallet final claim status: ${finalStatus[1]}`);
    }
  } catch (error: any) {
    console.log(`Error with direct claim: ${error.message}`);
  }
  
  // Final stats
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
  
  console.log("\n=== Debugging Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });