// scripts/activities/buy_x_apecoin_worth_of_tokens/test-buyxapecoinworthoftokens.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing BuyXApecoinWorthOfTokens with TokenAirdropReward ===");
  
  // Get signer
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data - check proper directories
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "ape-token-purchase-instance.json");
  
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
  console.log(`- APE Token Purchase Tim3cap: ${instanceData.apePurchaseInstance.tim3cap}`);
  console.log(`- Token: ${baseDeploymentData.contracts.token}`);
  console.log(`- APE Coin: ${baseDeploymentData.contracts.apeCoin}`);
  console.log(`- Reward Token: ${baseDeploymentData.contracts.rewardToken}`);
  
  // Setup contract factories
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const BuyXApecoinWorthOfTokens = await ethers.getContractFactory("BuyXApecoinWorthOfTokens");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const TestToken = await ethers.getContractFactory("TestToken");
  
  // Attach to deployed contracts
  const apeTim3cap = Tim3cap.attach(instanceData.apePurchaseInstance.tim3cap);
  const apeActivity = BuyXApecoinWorthOfTokens.attach(instanceData.apePurchaseInstance.activity);
  const apeReward = TokenAirdropReward.attach(instanceData.apePurchaseInstance.reward);
  
  const token = TestToken.attach(baseDeploymentData.contracts.token);
  const apeCoin = TestToken.attach(baseDeploymentData.contracts.apeCoin);
  const rewardToken = TestToken.attach(baseDeploymentData.contracts.rewardToken);
  
  // Check broker wallet
  const brokerWallet = new ethers.Wallet(
    instanceData.brokerWallet.privateKey, 
    deployer.provider
  );
  console.log(`Using broker wallet: ${brokerWallet.address}`);
  
  // 1. Test BuyXApecoinWorthOfTokens Activity
  console.log("\n=== Testing BuyXApecoinWorthOfTokens Activity ===");
  
  // Get Activity Config
  const apeConfig = await apeActivity.getConfig();
  console.log("BuyXApecoinWorthOfTokens Config:");
  console.log(`- Token Address: ${apeConfig[0]}`);
  console.log(`- APE Coin Address: ${apeConfig[1]}`);
  console.log(`- Required APE Amount: ${ethers.formatUnits(apeConfig[2], 18)}`);
  console.log(`- Start Date: ${new Date(Number(apeConfig[3]) * 1000).toLocaleString()}`);
  console.log(`- End Date: ${new Date(Number(apeConfig[4]) * 1000).toLocaleString()}`);
  console.log(`- Min Purchase Amount: ${ethers.formatUnits(apeConfig[5], 18)}`);
  
  // Check APE balance of deployer
  const deployerApeBalance = await apeCoin.balanceOf(deployer.address);
  console.log(`Deployer APE balance: ${ethers.formatUnits(deployerApeBalance, 18)}`);
  
  // Check initial APE spent
  const initialApeSpent = await apeActivity.getUserApecoinSpent(deployer.address);
  console.log(`Initial APE spent for deployer: ${ethers.formatUnits(initialApeSpent, 18)}`);
  
  // Check initial eligibility
  const isEligibleBeforePurchase = await apeActivity.checkEligibility(deployer.address);
  console.log(`Is deployer eligible before purchase: ${isEligibleBeforePurchase}`);
  
  // If not eligible, register a purchase to become eligible
  if (!isEligibleBeforePurchase) {
    console.log("Registering APE token purchases to make deployer eligible...");
    
    // Verify that deployer has owner or signing key permissions
    const activityOwner = await apeActivity.owner();
    const signingKey = await apeActivity.signingKey();
    console.log(`Activity owner: ${activityOwner}`);
    console.log(`Signing key: ${signingKey}`);
    
    // Verify amount needed for eligibility
    const requiredAmount = apeConfig[2];
    const minPurchaseAmount = apeConfig[5];
    console.log(`Required total APE spent: ${ethers.formatUnits(requiredAmount, 18)}`);
    console.log(`Minimum purchase amount: ${ethers.formatUnits(minPurchaseAmount, 18)}`);
    
    try {
      // Verify a purchase for the deployer
      // Note: This would typically be called by an authorized system after confirming a real purchase
      // Here we're simulating by directly calling the verify function
      await apeActivity.verifyPurchase(
        deployer.address,
        requiredAmount, // Register exactly the required amount
        "0x" // Empty proof since we're the owner
      );
      console.log(`Verified purchase of ${ethers.formatUnits(requiredAmount, 18)} APE worth of tokens for deployer`);
      
      // Check updated APE spent amount
      const updatedApeSpent = await apeActivity.getUserApecoinSpent(deployer.address);
      console.log(`Updated APE spent for deployer: ${ethers.formatUnits(updatedApeSpent, 18)}`);
      
      // Check eligibility after purchase
      const isEligibleAfterPurchase = await apeActivity.checkEligibility(deployer.address);
      console.log(`Is deployer eligible after purchase: ${isEligibleAfterPurchase}`);
    } catch (error: any) {
      console.log("❌ Purchase verification failed:", error.message);
    }
  }
  
  // Test APE token purchase activity eligibility and claim
  const canClaimReward = await apeReward.canClaim(deployer.address);
  console.log(`Can deployer claim APE purchase reward: ${canClaimReward}`);
  
  if (canClaimReward) {
    // Create eligibility proof for the claim
    console.log("Creating eligibility proof for APE token purchase activity...");
    const timestamp = Math.floor(Date.now() / 1000);
    const message = ethers.getBytes(ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "string"],
        [deployer.address, timestamp, "BUY_X_APECOIN_WORTH_OF_TOKENS"]
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
    
    // Claim from the APE token purchase activity instance through Tim3cap
    console.log("Claiming from APE token purchase activity instance through Tim3cap...");
    try {
      const apeClaimTx = await apeTim3cap.claim(proof, 0, [], {
        gasLimit: 3000000
      });
      console.log(`APE token purchase claim transaction hash: ${apeClaimTx.hash}`);
      
      const apeClaimReceipt = await apeClaimTx.wait();
      console.log(`APE token purchase claim successful! Gas used: ${apeClaimReceipt?.gasUsed.toString()}`);
      
      // Check deployer's reward token balance after claim
      const afterTokenClaimBalance = await rewardToken.balanceOf(deployer.address);
      console.log(`Deployer reward token balance after claim: ${ethers.formatUnits(afterTokenClaimBalance, 18)}`);
      console.log(`Reward tokens received: ${ethers.formatUnits(afterTokenClaimBalance - beforeTokenClaimBalance, 18)}`);
    } catch (error: any) {
      console.log("❌ APE token purchase claim failed:", error.message);
    }
  } else {
    console.log("Deployer cannot claim APE token purchase activity reward (may have already claimed)");
  }
  
  // Test setting signing key and proof validation
  console.log("\n=== Testing Proof Validation ===");
  
  // Update signing key on APE token purchase activity
  console.log("Updating signing key on APE token purchase activity...");
  const newSigner = ethers.Wallet.createRandom();
  console.log(`New signer address: ${newSigner.address}`);
  
  await apeActivity.setSigningKey(newSigner.address);
  console.log("Signing key updated");
  
  // Verify the signing key was updated
  const updatedSigningKey = await apeActivity.signingKey();
  console.log(`Updated signing key: ${updatedSigningKey}`);
  
  // Test verifying a purchase with a proof
  console.log("\n=== Testing Purchase Verification with Proof ===");
  
  // Create a proof signed by the new signer
  const purchaseTimestamp = Math.floor(Date.now() / 1000);
  const purchaseMessage = ethers.getBytes(ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "string"],
      [deployer.address, purchaseTimestamp, "BUY_X_APECOIN_WORTH_OF_TOKENS"]
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
  const isPurchaseProofValid = await apeActivity.verifyEligibilityProof(deployer.address, purchaseProof);
  console.log(`Is purchase proof valid: ${isPurchaseProofValid}`);
  
  // Register additional purchase with proof
  if (isPurchaseProofValid) {
    try {
      // Get current APE spent amount
      const beforeAdditionalPurchase = await apeActivity.getUserApecoinSpent(deployer.address);
      console.log(`APE spent before additional verification: ${ethers.formatUnits(beforeAdditionalPurchase, 18)}`);
      
      // Minimum purchase amount from config
      const minPurchaseAmount = apeConfig[5];
      
      // Verify another purchase with the proof
      await apeActivity.verifyPurchase(
        deployer.address,
        minPurchaseAmount, // Register minimum purchase amount
        purchaseProof // Using the proof since we're not the owner anymore
      );
      console.log(`Additional purchase of ${ethers.formatUnits(minPurchaseAmount, 18)} APE worth of tokens verified successfully`);
      
      // Check updated APE spent amount
      const afterAdditionalPurchase = await apeActivity.getUserApecoinSpent(deployer.address);
      console.log(`APE spent after additional verification: ${ethers.formatUnits(afterAdditionalPurchase, 18)}`);
      
    } catch (error: any) {
      console.log("❌ Additional purchase verification failed:", error.message);
      console.log("This may be expected if only owner/signingKey can verify purchases");
    }
  }
  
  // Process an eligibility proof
  try {
    await apeActivity.processEligibilityProof(deployer.address, purchaseProof);
    console.log("Eligibility proof processed successfully");
  } catch (error: any) {
    console.log("❌ Processing proof failed:", error.message);
  }
  
  // Final Summary
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("BuyXApecoinWorthOfTokens Testing Summary:");
  
  const finalApeSpent = await apeActivity.getUserApecoinSpent(deployer.address);
  const finalEligibility = await apeActivity.checkEligibility(deployer.address);
  const finalRewardBalance = await rewardToken.balanceOf(deployer.address);
  
  console.log(`- Final APE spent amount: ${ethers.formatUnits(finalApeSpent, 18)}`);
  console.log(`- Final eligibility status: ${finalEligibility}`);
  console.log(`- Final reward token balance: ${ethers.formatUnits(finalRewardBalance, 18)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });