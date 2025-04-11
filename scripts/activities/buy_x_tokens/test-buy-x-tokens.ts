// scripts/activities/buy_x_tokens/test-buyxtokens.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing BuyXTokens with TokenAirdropReward ===");
  
  // Get signer
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data - check proper directories
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "token-purchase-activity-instance.json");
  
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
  console.log(`- Token Purchase Tim3cap: ${instanceData.tokenActivityInstance.tim3cap}`);
  console.log(`- Activity Token: ${baseDeploymentData.contracts.activityToken}`);
  console.log(`- Reward Token: ${baseDeploymentData.contracts.rewardToken}`);
  
  // Setup contract factories
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const BuyXTokens = await ethers.getContractFactory("BuyXTokens");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const TestToken = await ethers.getContractFactory("TestToken");
  
  // Attach to deployed contracts
  const tokenTim3cap = Tim3cap.attach(instanceData.tokenActivityInstance.tim3cap);
  const tokenActivity = BuyXTokens.attach(instanceData.tokenActivityInstance.activity);
  const tokenReward = TokenAirdropReward.attach(instanceData.tokenActivityInstance.reward);
  
  const activityToken = TestToken.attach(baseDeploymentData.contracts.activityToken);
  const rewardToken = TestToken.attach(baseDeploymentData.contracts.rewardToken);
  
  // Check broker wallet
  const brokerWallet = new ethers.Wallet(
    instanceData.brokerWallet.privateKey, 
    deployer.provider
  );
  console.log(`Using broker wallet: ${brokerWallet.address}`);
  
  // 1. Test BuyXTokens Activity
  console.log("\n=== Testing BuyXTokens Activity ===");
  
  // Get Activity Config
  const tokenConfig = await tokenActivity.getConfig();
  console.log("BuyXTokens Config:");
  console.log(`- Token Address: ${tokenConfig[0]}`);
  console.log(`- Required Amount: ${ethers.formatUnits(tokenConfig[1], 18)}`);
  console.log(`- Start Date: ${new Date(Number(tokenConfig[2]) * 1000).toLocaleString()}`);
  console.log(`- End Date: ${new Date(Number(tokenConfig[3]) * 1000).toLocaleString()}`);
  console.log(`- Min Purchase Amount: ${ethers.formatUnits(tokenConfig[4], 18)}`);
  
  // Check initial purchase amount
  const initialPurchaseAmount = await tokenActivity.getUserPurchaseAmount(deployer.address);
  console.log(`Initial purchase amount for deployer: ${ethers.formatUnits(initialPurchaseAmount, 18)}`);
  
  // Check initial eligibility
  const isEligibleBeforePurchase = await tokenActivity.checkEligibility(deployer.address);
  console.log(`Is deployer eligible before purchase: ${isEligibleBeforePurchase}`);
  
  // If not eligible, register a purchase to become eligible
  if (!isEligibleBeforePurchase) {
    console.log("Registering token purchases to make deployer eligible...");
    
    // Verify that deployer has owner or signing key permissions
    const activityOwner = await tokenActivity.owner();
    const signingKey = await tokenActivity.signingKey();
    console.log(`Activity owner: ${activityOwner}`);
    console.log(`Signing key: ${signingKey}`);
    
    // Verify amount needed for eligibility
    const requiredAmount = tokenConfig[1];
    const minPurchaseAmount = tokenConfig[4];
    console.log(`Required total purchase amount: ${ethers.formatUnits(requiredAmount, 18)}`);
    console.log(`Minimum purchase amount: ${ethers.formatUnits(minPurchaseAmount, 18)}`);
    
    try {
      // Verify a purchase for the deployer
      // Note: This would typically be called by an authorized system after confirming a real purchase
      // Here we're simulating by directly calling the verify function
      await tokenActivity.verifyPurchase(
        deployer.address,
        requiredAmount, // Register exactly the required amount
        "0x" // Empty proof since we're the owner
      );
      console.log(`Verified purchase of ${ethers.formatUnits(requiredAmount, 18)} tokens for deployer`);
      
      // Check updated purchase amount
      const updatedPurchaseAmount = await tokenActivity.getUserPurchaseAmount(deployer.address);
      console.log(`Updated purchase amount for deployer: ${ethers.formatUnits(updatedPurchaseAmount, 18)}`);
      
      // Check eligibility after purchase
      const isEligibleAfterPurchase = await tokenActivity.checkEligibility(deployer.address);
      console.log(`Is deployer eligible after purchase: ${isEligibleAfterPurchase}`);
    } catch (error: any) {
      console.log("❌ Purchase verification failed:", error.message);
    }
  }
  
  // Test token purchase activity eligibility and claim
  const canClaimToken = await tokenReward.canClaim(deployer.address);
  console.log(`Can deployer claim token purchase reward: ${canClaimToken}`);
  
  if (canClaimToken) {
    // Create eligibility proof for the claim
    console.log("Creating eligibility proof for token purchase activity...");
    const timestamp = Math.floor(Date.now() / 1000);
    const message = ethers.getBytes(ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "string"],
        [deployer.address, timestamp, "BUY_X_TOKENS"]
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
    
    // Claim from the token purchase activity instance through Tim3cap
    console.log("Claiming from token purchase activity instance through Tim3cap...");
    try {
      const tokenClaimTx = await tokenTim3cap.claim(proof, 0, [], {
        gasLimit: 3000000
      });
      console.log(`Token purchase claim transaction hash: ${tokenClaimTx.hash}`);
      
      const tokenClaimReceipt = await tokenClaimTx.wait();
      console.log(`Token purchase claim successful! Gas used: ${tokenClaimReceipt?.gasUsed.toString()}`);
      
      // Check deployer's reward token balance after claim
      const afterTokenClaimBalance = await rewardToken.balanceOf(deployer.address);
      console.log(`Deployer reward token balance after claim: ${ethers.formatUnits(afterTokenClaimBalance, 18)}`);
      console.log(`Reward tokens received: ${ethers.formatUnits(afterTokenClaimBalance - beforeTokenClaimBalance, 18)}`);
    } catch (error: any) {
      console.log("❌ Token purchase claim failed:", error.message);
    }
  } else {
    console.log("Deployer cannot claim token purchase activity reward (may have already claimed)");
  }
  
  // Test setting signing key and proof validation
  console.log("\n=== Testing Proof Validation ===");
  
  // Update signing key on token purchase activity
  console.log("Updating signing key on token purchase activity...");
  const newSigner = ethers.Wallet.createRandom();
  console.log(`New signer address: ${newSigner.address}`);
  
  await tokenActivity.setSigningKey(newSigner.address);
  console.log("Signing key updated");
  
  // Verify the signing key was updated
  const updatedSigningKey = await tokenActivity.signingKey();
  console.log(`Updated signing key: ${updatedSigningKey}`);
  
  // Test verifying a purchase with a proof
  console.log("\n=== Testing Purchase Verification with Proof ===");
  
  // Create a proof signed by the new signer
  const purchaseTimestamp = Math.floor(Date.now() / 1000);
  const purchaseMessage = ethers.getBytes(ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "string"],
      [deployer.address, purchaseTimestamp, "BUY_X_TOKENS"]
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
  const isPurchaseProofValid = await tokenActivity.verifyEligibilityProof(deployer.address, purchaseProof);
  console.log(`Is purchase proof valid: ${isPurchaseProofValid}`);
  
  // Register additional purchase with proof
  if (isPurchaseProofValid) {
    try {
      // Get current purchase amount
      const beforeAdditionalPurchase = await tokenActivity.getUserPurchaseAmount(deployer.address);
      console.log(`Purchase amount before additional verification: ${ethers.formatUnits(beforeAdditionalPurchase, 18)}`);
      
      // Minimum purchase amount from config
      const minPurchaseAmount = tokenConfig[4];
      
      // Verify another purchase with the proof
      await tokenActivity.verifyPurchase(
        deployer.address,
        minPurchaseAmount, // Register minimum purchase amount
        purchaseProof // Using the proof since we're not the owner anymore
      );
      console.log(`Additional purchase of ${ethers.formatUnits(minPurchaseAmount, 18)} tokens verified successfully`);
      
      // Check updated purchase amount
      const afterAdditionalPurchase = await tokenActivity.getUserPurchaseAmount(deployer.address);
      console.log(`Purchase amount after additional verification: ${ethers.formatUnits(afterAdditionalPurchase, 18)}`);
      
    } catch (error: any) {
      console.log("❌ Additional purchase verification failed:", error.message);
      console.log("This may be expected if only owner/signingKey can verify purchases");
    }
  }
  
  // Process an eligibility proof
  try {
    await tokenActivity.processEligibilityProof(deployer.address, purchaseProof);
    console.log("Eligibility proof processed successfully");
  } catch (error: any) {
    console.log("❌ Processing proof failed:", error.message);
  }
  
  // Final Summary
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("BuyXTokens Testing Summary:");
  
  const finalPurchaseAmount = await tokenActivity.getUserPurchaseAmount(deployer.address);
  const finalEligibility = await tokenActivity.checkEligibility(deployer.address);
  const finalRewardBalance = await rewardToken.balanceOf(deployer.address);
  
  console.log(`- Final purchase amount: ${ethers.formatUnits(finalPurchaseAmount, 18)}`);
  console.log(`- Final eligibility status: ${finalEligibility}`);
  console.log(`- Final reward token balance: ${ethers.formatUnits(finalRewardBalance, 18)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });