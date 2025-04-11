// scripts/activities/buy_x_nfts/test-buyxnfts.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing BuyXNFTs with TokenAirdropReward ===");
  
  // Get signer
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data - check proper directories
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "nft-purchase-activity-instance.json");
  
  // Check if files exist
  console.log(`Looking for deployment files in: ${outputDir}`);
  console.log(`Base deployment file exists: ${fs.existsSync(baseDeploymentFile)}`);
  console.log(`Instance file exists: ${fs.existsSync(instanceFile)}`);
  
  if (!fs.existsSync(baseDeploymentFile) || !fs.existsSync(instanceFile)) {
    console.error("Deployment files not found at expected location.");
    
    // List all files in the directory if it exists
    if (fs.existsSync(outputDir)) {
      console.log("Files in the deployment directory:");
      const files = fs.readdirSync(outputDir);
      files.forEach(file => {
        console.log(`- ${file}`);
      });
    }
    
    console.error("Please run deploy-implementation.ts and deploy-instance.ts first");
    process.exit(1);
  }
  
  // Load deployment data
  const baseDeploymentData = JSON.parse(fs.readFileSync(baseDeploymentFile, "utf8"));
  const instanceData = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
  
  console.log("Loaded deployment data:");
  console.log(`- NFT Purchase Tim3cap: ${instanceData.nftActivityInstance.tim3cap}`);
  console.log(`- Test NFT: ${baseDeploymentData.contracts.testNFT}`);
  console.log(`- Reward Token: ${baseDeploymentData.contracts.rewardToken}`);
  
  // Setup contract factories
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const BuyXNFTs = await ethers.getContractFactory("BuyXNFTs");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const TestNFT = await ethers.getContractFactory("TestNFT");
  const TestToken = await ethers.getContractFactory("TestToken");
  
  // Attach to deployed contracts
  const nftTim3cap = Tim3cap.attach(instanceData.nftActivityInstance.tim3cap);
  const nftActivity = BuyXNFTs.attach(instanceData.nftActivityInstance.activity);
  const nftReward = TokenAirdropReward.attach(instanceData.nftActivityInstance.reward);
  
  const testNFT = TestNFT.attach(baseDeploymentData.contracts.testNFT);
  const rewardToken = TestToken.attach(baseDeploymentData.contracts.rewardToken);
  
  // Check broker wallet
  const brokerWallet = new ethers.Wallet(
    instanceData.brokerWallet.privateKey, 
    deployer.provider
  );
  console.log(`Using broker wallet: ${brokerWallet.address}`);
  
  // 1. Test BuyXNFTs Activity
  console.log("\n=== Testing BuyXNFTs Activity ===");
  
  // Get Activity Config
  const nftConfig = await nftActivity.getConfig();
  console.log("BuyXNFTs Config:");
  console.log(`- NFT Contract: ${nftConfig[0]}`);
  console.log(`- Required Buy Count: ${nftConfig[1]}`);
  console.log(`- Start Date: ${new Date(Number(nftConfig[2]) * 1000).toLocaleString()}`);
  console.log(`- End Date: ${new Date(Number(nftConfig[3]) * 1000).toLocaleString()}`);
  console.log(`- Min Purchase Amount: ${nftConfig[4]}`);
  
  // Check initial purchase count
  const initialPurchaseCount = await nftActivity.getUserPurchaseCount(deployer.address);
  console.log(`Initial purchase count for deployer: ${initialPurchaseCount}`);
  
  // Check initial eligibility
  const isEligibleBeforePurchase = await nftActivity.checkEligibility(deployer.address);
  console.log(`Is deployer eligible before purchase: ${isEligibleBeforePurchase}`);
  
  // If not eligible, register a purchase to become eligible
  if (!isEligibleBeforePurchase) {
    console.log("Registering NFT purchases to make deployer eligible...");
    
    // Verify that deployer has owner or signing key permissions
    const activityOwner = await nftActivity.owner();
    const signingKey = await nftActivity.signingKey();
    console.log(`Activity owner: ${activityOwner}`);
    console.log(`Signing key: ${signingKey}`);
    
    // Verify purchase count needed for eligibility
    const requiredBuyCount = nftConfig[1];
    console.log(`Required purchase count: ${requiredBuyCount}`);
    
    try {
      // Verify a purchase for the deployer
      // Note: This would typically be called by an authorized system after confirming a real purchase
      // Here we're simulating by directly calling the verify function
      await nftActivity.verifyPurchase(
        deployer.address,
        Number(requiredBuyCount), // Register exactly the required amount
        "0x" // Empty proof since we're the owner
      );
      console.log(`Verified ${requiredBuyCount} purchases for deployer`);
      
      // Check updated purchase count
      const updatedPurchaseCount = await nftActivity.getUserPurchaseCount(deployer.address);
      console.log(`Updated purchase count for deployer: ${updatedPurchaseCount}`);
      
      // Check eligibility after purchase
      const isEligibleAfterPurchase = await nftActivity.checkEligibility(deployer.address);
      console.log(`Is deployer eligible after purchase: ${isEligibleAfterPurchase}`);
    } catch (error: any) {
      console.log("❌ Purchase verification failed:", error.message);
    }
  }
  
  // Test NFT purchase activity eligibility and claim
  const canClaimToken = await nftReward.canClaim(deployer.address);
  console.log(`Can deployer claim NFT purchase reward: ${canClaimToken}`);
  
  if (canClaimToken) {
    // Create eligibility proof for the claim
    console.log("Creating eligibility proof for NFT purchase activity...");
    const timestamp = Math.floor(Date.now() / 1000);
    const message = ethers.getBytes(ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "string"],
        [deployer.address, timestamp, "BUY_X_NFTS"]
      )
    ));
    const signature = await deployer.signMessage(message);
    
    // Encode the proof
    const proof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "uint256"],
      [signature, timestamp]
    );
    
    // Check deployer's reward token balance before claim
    const beforeTokenClaimBalance = await rewardToken.balanceOf(deployer.address);
    console.log(`Deployer reward token balance before claim: ${ethers.formatUnits(beforeTokenClaimBalance, 18)}`);
    
    // Claim from the NFT purchase activity instance through Tim3cap
    console.log("Claiming from NFT purchase activity instance through Tim3cap...");
    try {
      const nftClaimTx = await nftTim3cap.claim(proof, 0, [], {
        gasLimit: 3000000
      });
      console.log(`NFT purchase claim transaction hash: ${nftClaimTx.hash}`);
      
      const nftClaimReceipt = await nftClaimTx.wait();
      console.log(`NFT purchase claim successful! Gas used: ${nftClaimReceipt?.gasUsed.toString()}`);
      
      // Check deployer's reward token balance after claim
      const afterTokenClaimBalance = await rewardToken.balanceOf(deployer.address);
      console.log(`Deployer reward token balance after claim: ${ethers.formatUnits(afterTokenClaimBalance, 18)}`);
      console.log(`Reward tokens received: ${ethers.formatUnits(afterTokenClaimBalance - beforeTokenClaimBalance, 18)}`);
    } catch (error: any) {
      console.log("❌ NFT purchase claim failed:", error.message);
    }
  } else {
    console.log("Deployer cannot claim NFT purchase activity reward (may have already claimed)");
  }
  
  // Test setting signing key and proof validation
  console.log("\n=== Testing Proof Validation ===");
  
  // Update signing key on NFT purchase activity
  console.log("Updating signing key on NFT purchase activity...");
  const newSigner = ethers.Wallet.createRandom();
  console.log(`New signer address: ${newSigner.address}`);
  
  await nftActivity.setSigningKey(newSigner.address);
  console.log("Signing key updated");
  
  // Verify the signing key was updated
  const updatedSigningKey = await nftActivity.signingKey();
  console.log(`Updated signing key: ${updatedSigningKey}`);
  
  // Test verifying a purchase with a proof
  console.log("\n=== Testing Purchase Verification with Proof ===");
  
  // Create a proof signed by the new signer
  const purchaseTimestamp = Math.floor(Date.now() / 1000);
  const purchaseMessage = ethers.getBytes(ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "string"],
      [deployer.address, purchaseTimestamp, "BUY_X_NFTS"]
    )
  ));
  const purchaseSignature = await newSigner.signMessage(purchaseMessage);
  
  // Encode the proof
  const purchaseProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [purchaseSignature, purchaseTimestamp]
  );
  
  // Verify the proof
  console.log("Verifying proof with new signing key...");
  const isPurchaseProofValid = await nftActivity.verifyEligibilityProof(deployer.address, purchaseProof);
  console.log(`Is purchase proof valid: ${isPurchaseProofValid}`);
  
  // Register additional purchase with proof
  if (isPurchaseProofValid) {
    try {
      // Get current purchase count
      const beforeAdditionalPurchase = await nftActivity.getUserPurchaseCount(deployer.address);
      console.log(`Purchase count before additional verification: ${beforeAdditionalPurchase}`);
      
      // Verify another purchase with the proof
      await nftActivity.verifyPurchase(
        deployer.address,
        1, // Register 1 more purchase
        purchaseProof // Using the proof since we're not the owner anymore
      );
      console.log("Additional purchase verified successfully");
      
      // Check updated purchase count
      const afterAdditionalPurchase = await nftActivity.getUserPurchaseCount(deployer.address);
      console.log(`Purchase count after additional verification: ${afterAdditionalPurchase}`);
      
    } catch (error: any) {
      console.log("❌ Additional purchase verification failed:", error.message);
      console.log("This may be expected if only owner/signingKey can verify purchases");
    }
  }
  
  // Process an eligibility proof
  try {
    await nftActivity.processEligibilityProof(deployer.address, purchaseProof);
    console.log("Eligibility proof processed successfully");
  } catch (error: any) {
    console.log("❌ Processing proof failed:", error.message);
  }
  
  // Final Summary
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("BuyXNFTs Testing Summary:");
  
  const finalPurchaseCount = await nftActivity.getUserPurchaseCount(deployer.address);
  const finalEligibility = await nftActivity.checkEligibility(deployer.address);
  const finalRewardBalance = await rewardToken.balanceOf(deployer.address);
  
  console.log(`- Final purchase count: ${finalPurchaseCount}`);
  console.log(`- Final eligibility status: ${finalEligibility}`);
  console.log(`- Final reward token balance: ${ethers.formatUnits(finalRewardBalance, 18)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });