// scripts/activities/hold_x_tokens/test-hold-x-tokens.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n=== Testing HoldXTokens with TokenAirdropReward ===");
  
  // Get signer
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  console.log(`Deployer address: ${deployer.address}`);
  
  // Load deployment data - check proper directories
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "token-activity-instance.json");
  
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
  console.log(`- Token Activity Tim3cap: ${instanceData.tokenActivityInstance.tim3cap}`);
  console.log(`- Activity Token: ${baseDeploymentData.contracts.activityToken}`);
  console.log(`- Reward Token: ${baseDeploymentData.contracts.rewardToken}`);
  
  // Setup contract factories
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const HoldXTokens = await ethers.getContractFactory("HoldXTokens");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const TestToken = await ethers.getContractFactory("TestToken");
  
  // Attach to deployed contracts
  const tokenTim3cap = Tim3cap.attach(instanceData.tokenActivityInstance.tim3cap);
  const tokenActivity = HoldXTokens.attach(instanceData.tokenActivityInstance.activity);
  const tokenReward = TokenAirdropReward.attach(instanceData.tokenActivityInstance.reward);
  
  const activityToken = TestToken.attach(baseDeploymentData.contracts.activityToken);
  const rewardToken = TestToken.attach(baseDeploymentData.contracts.rewardToken);
  
  // Check broker wallet
  const brokerWallet = new ethers.Wallet(
    instanceData.brokerWallet.privateKey, 
    deployer.provider
  );
  console.log(`Using broker wallet: ${brokerWallet.address}`);
  
  // 1. Test HoldXTokens Activity
  console.log("\n=== Testing HoldXTokens Activity ===");
  
  // Check token balance and eligibility
  const deployerTokenBalance = await activityToken.balanceOf(deployer.address);
  console.log(`Deployer activity token balance: ${ethers.formatUnits(deployerTokenBalance, 18)}`);
  
  // Get Activity Config
  const tokenConfig = await tokenActivity.getConfig();
  console.log("HoldXTokens Config:");
  console.log(`- Token Addresses: ${tokenConfig[0]}`);
  console.log(`- Start Date: ${new Date(Number(tokenConfig[1]) * 1000).toLocaleString()}`);
  console.log(`- End Date: ${new Date(Number(tokenConfig[2]) * 1000).toLocaleString()}`);
  console.log(`- Snapshot Date: ${tokenConfig[3]}`);
  
  // Check required amount
  const requiredTokenAmount = await tokenActivity.getRequiredAmount(baseDeploymentData.contracts.activityToken);
  console.log(`Required token amount: ${ethers.formatUnits(requiredTokenAmount, 18)}`);
  
  // Check Eligibility directly
  const isEligibleForToken = await tokenActivity.checkEligibility(deployer.address);
  console.log(`Is deployer eligible based on token holdings: ${isEligibleForToken}`);
  
  // Mint more tokens if not enough
  if (!isEligibleForToken && deployerTokenBalance < requiredTokenAmount) {
    console.log("Minting more tokens to make deployer eligible...");
    // Add 1 token for safety (all values are BigInt)
    const amountToMint = BigInt(requiredTokenAmount) - BigInt(deployerTokenBalance) + BigInt(ethers.parseUnits("1", 18));
    await activityToken.mint(deployer.address, amountToMint);
    console.log(`Minted ${ethers.formatUnits(amountToMint, 18)} more tokens to deployer`);
    
    // Re-check balance and eligibility
    const newDeployerTokenBalance = await activityToken.balanceOf(deployer.address);
    console.log(`Updated deployer token balance: ${ethers.formatUnits(newDeployerTokenBalance, 18)}`);
    
    const isEligibleNow = await tokenActivity.checkEligibility(deployer.address);
    console.log(`Is deployer eligible after minting: ${isEligibleNow}`);
  }
  
  // Test token activity eligibility and claim
  if (isEligibleForToken || deployerTokenBalance >= requiredTokenAmount) {
    console.log("\nDeployer is eligible for token activity reward");
    
    // Check if already claimed
    const canClaimToken = await tokenReward.canClaim(deployer.address);
    console.log(`Can deployer claim token activity reward: ${canClaimToken}`);
    
    if (canClaimToken) {
      // Create eligibility proof for the claim
      console.log("Creating eligibility proof for token activity...");
      const timestamp = Math.floor(Date.now() / 1000);
      const message = ethers.getBytes(ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "string"],
          [deployer.address, timestamp, "HOLD_X_TOKENS"]
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
      console.log(`Deployer reward token balance before token claim: ${ethers.formatUnits(beforeTokenClaimBalance, 18)}`);
      
      // Claim from the token activity instance through Tim3cap
      console.log("Claiming from token activity instance through Tim3cap...");
      try {
        const tokenClaimTx = await tokenTim3cap.claim(proof, 0, [], {
          gasLimit: 3000000
        });
        console.log(`Token activity claim transaction hash: ${tokenClaimTx.hash}`);
        
        const tokenClaimReceipt = await tokenClaimTx.wait();
        console.log(`Token activity claim successful! Gas used: ${tokenClaimReceipt?.gasUsed.toString()}`);
        
        // Check deployer's reward token balance after claim
        const afterTokenClaimBalance = await rewardToken.balanceOf(deployer.address);
        console.log(`Deployer reward token balance after token claim: ${ethers.formatUnits(afterTokenClaimBalance, 18)}`);
        console.log(`Reward tokens received: ${ethers.formatUnits(afterTokenClaimBalance - beforeTokenClaimBalance, 18)}`);
      } catch (error: any) {
        console.log("❌ Token activity claim failed:", error.message);
      }
    } else {
      console.log("Deployer cannot claim token activity reward (may have already claimed)");
    }
  } else {
    console.log("Deployer is not eligible for token activity reward");
  }
  
  // Test setting signing key and proof validation
  console.log("\n=== Testing Proof Validation ===");
  
  // Update signing key on token activity
  console.log("Updating signing key on token activity...");
  const newSigner = ethers.Wallet.createRandom();
  console.log(`New signer address: ${newSigner.address}`);
  
  await tokenActivity.setSigningKey(newSigner.address);
  console.log("Signing key updated");
  
  // Verify the signing key was updated
  const updatedSigningKey = await tokenActivity.signingKey();
  console.log(`Updated signing key: ${updatedSigningKey}`);
  
  // Create eligibility proof with new signer
  console.log("Creating eligibility proof with new signer...");
  const proofTimestamp = Math.floor(Date.now() / 1000);
  const proofMessage = ethers.getBytes(ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "string"],
      [deployer.address, proofTimestamp, "HOLD_X_TOKENS"]
    )
  ));
  const proofSignature = await newSigner.signMessage(proofMessage);
  
  // Encode the proof
  const newProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [proofSignature, proofTimestamp]
  );
  
  // Verify the proof
  console.log("Verifying proof with new signing key...");
  const isProofValid = await tokenActivity.verifyEligibilityProof(deployer.address, newProof);
  console.log(`Is proof valid: ${isProofValid}`);
  
  // Process the proof if valid
  if (isProofValid) {
    try {
      await tokenActivity.processEligibilityProof(deployer.address, newProof);
      console.log("Eligibility proof processed successfully");
    } catch (error: any) {
      console.log("❌ Processing proof failed:", error.message);
    }
  }
  
  // Final Summary
  console.log("\n=== Test Script Completed Successfully ===");
  console.log("HoldXTokens Testing Summary:");
  console.log(`- Token Activity: ${isEligibleForToken ? "Eligible" : "Not Eligible"}`);
  
  // Get final token balances
  const finalRewardBalance = await rewardToken.balanceOf(deployer.address);
  console.log(`Final reward token balance: ${ethers.formatUnits(finalRewardBalance, 18)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });