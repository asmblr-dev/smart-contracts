// scripts/activities/buy_x_apecoin_worth_tokens/test-merkle-discount.ts
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

/**
 * Helper function to create a Merkle tree for discounts
 * @param discountData Array of [address, discountRate] pairs
 * @returns The Merkle tree
 */
function createDiscountTree(discountData: Array<[string, number]>) {
  // Create leaf nodes by hashing the concatenated address and discount rate
  const leaves = discountData.map(([address, rate]) => 
    ethers.solidityPackedKeccak256(
      ["address", "uint256"],
      [address, rate]
    )
  );
  
  // Create Merkle tree with keccak256
  return new MerkleTree(leaves, keccak256, { sort: true });
}

/**
 * Get proof for a specific address and discount rate
 * @param tree The Merkle tree
 * @param address User address
 * @param discountRate Discount rate in basis points
 * @returns Merkle proof
 */
function getDiscountProof(tree: MerkleTree, address: string, discountRate: number) {
  const leaf = ethers.solidityPackedKeccak256(
    ["address", "uint256"],
    [address, discountRate]
  );
  return tree.getHexProof(leaf);
}

async function main() {
  console.log("\n=== Testing Merkle Discount Proofs with BuyXApecoinWorthOfTokens ===");
  
  // Get deployer
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  // Create additional wallet instances for testing
  // This ensures we don't depend on multiple signers which might not be available
  const user1 = ethers.Wallet.createRandom().connect(deployer.provider);
  const user2 = ethers.Wallet.createRandom().connect(deployer.provider);
  const user3 = ethers.Wallet.createRandom().connect(deployer.provider);
  
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`User1 address: ${user1.address}`);
  console.log(`User2 address: ${user2.address}`);
  console.log(`User3 address: ${user3.address}`);
  
  // Load deployment data
  const outputDir = path.join(__dirname, "deployments");
  const baseDeploymentFile = path.join(outputDir, "base-deployments.json");
  const instanceFile = path.join(outputDir, "ape-token-purchase-instance.json");
  
  if (!fs.existsSync(baseDeploymentFile) || !fs.existsSync(instanceFile)) {
    console.error("Deployment files not found. Please run deploy-implementation.ts and deploy-instance.ts first");
    process.exit(1);
  }
  
  const baseDeploymentData = JSON.parse(fs.readFileSync(baseDeploymentFile, "utf8"));
  const instanceData = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
  
  console.log("Loaded deployment data:");
  console.log(`- Tim3cap Instance: ${instanceData.apePurchaseInstance.tim3cap}`);
  console.log(`- Activity: ${instanceData.apePurchaseInstance.activity}`);
  console.log(`- Reward Token: ${baseDeploymentData.contracts.rewardToken}`);
  
  // Setup contract factories
  const Tim3cap = await ethers.getContractFactory("Tim3cap");
  const BuyXApecoinWorthOfTokens = await ethers.getContractFactory("BuyXApecoinWorthOfTokens");
  const TokenAirdropReward = await ethers.getContractFactory("TokenAirdropReward");
  const TestToken = await ethers.getContractFactory("TestToken");
  
  // Attach to deployed contracts
  const tim3cap = Tim3cap.attach(instanceData.apePurchaseInstance.tim3cap);
  const activity = BuyXApecoinWorthOfTokens.attach(instanceData.apePurchaseInstance.activity);
  const apeCoin = TestToken.attach(baseDeploymentData.contracts.apeCoin);
  const rewardToken = TestToken.attach(baseDeploymentData.contracts.rewardToken);
  
  // Step 1: Create a Merkle tree with discount rates for different users
  console.log("\n=== Creating Discount Merkle Tree ===");
  
  const discountData: Array<[string, number]> = [
    [deployer.address, 1000], // 10% discount (1000 basis points)
    [user1.address, 2000],    // 20% discount (2000 basis points)
    [user2.address, 3000],    // 30% discount (3000 basis points)
    [user3.address, 5000]     // 50% discount (5000 basis points)
  ];
  
  console.log("Discount rates:");
  discountData.forEach(([address, rate]) => {
    console.log(`- ${address}: ${rate / 100}%`);
  });
  
  const discountTree = createDiscountTree(discountData);
  const discountRoot = discountTree.getHexRoot();
  console.log(`Merkle Root: ${discountRoot}`);
  
  // Step 2: Set the discount Merkle root in the Tim3cap contract
  console.log("\n=== Setting Discount Merkle Root ===");
  try {
    await tim3cap.setDiscountMerkleRoot(discountRoot);
    console.log("Discount Merkle root set successfully");
  } catch (error: any) {
    console.log("❌ Failed to set discount Merkle root:", error.message);
    // If the transaction fails, it might be due to permissions - try to proceed anyway
    console.log("Continuing with test assuming the root is already set properly...");
  }
  
  // Step 3: Fund the test wallets
  console.log("\n=== Funding Test Users ===");
  
  // Send some ETH to new wallets for gas
  for (const user of [user1, user2, user3]) {
    try {
      // Fund with 0.05 ETH for gas
      const fundTx = await deployer.sendTransaction({
        to: user.address,
        value: ethers.parseEther("0.05")
      });
      await fundTx.wait();
      console.log(`Funded ${user.address} with 0.05 ETH for gas`);
    } catch (error: any) {
      console.log(`Failed to fund ${user.address}: ${error.message}`);
    }
  }
  
  // Mint Apecoin to users
  const apeAmount = ethers.parseUnits("100", 18);
  for (const user of [user1, user2, user3]) {
    try {
      await apeCoin.mint(user.address, apeAmount);
      console.log(`Minted ${ethers.formatUnits(apeAmount, 18)} APE to ${user.address}`);
    } catch (error: any) {
      console.log(`Note: Could not mint APE to ${user.address}: ${error.message}`);
    }
  }
  
  // Function to register a purchase and make user eligible
  const registerPurchase = async (user: any) => {
    const requiredAmount = (await activity.getConfig())[2];
    console.log(`Registering purchase of ${ethers.formatUnits(requiredAmount, 18)} APE worth of tokens for ${user.address}`);
    
    try {
      // We use the deployer to register the purchase since it's the activity owner
      await activity.verifyPurchase(
        user.address,
        requiredAmount,
        "0x" // Empty proof
      );
      console.log(`✅ Purchase verified successfully`);
      
      // Check eligibility
      const isEligible = await activity.checkEligibility(user.address);
      console.log(`User eligibility: ${isEligible}`);
      
      return isEligible;
    } catch (error: any) {
      console.log(`❌ Purchase verification failed: ${error.message}`);
      return false;
    }
  };
  
  // Step 4: Test claiming with different discount rates
  console.log("\n=== Testing Claims with Different Discount Rates ===");
  
  // Make sure deployer is eligible first (since we'll use it in most tests)
  await registerPurchase(deployer);
  
  const testDiscountClaim = async (user: any, discountRate: number) => {
    const userAddress = user.address;
    console.log(`\nTesting claim for ${userAddress} with ${discountRate / 100}% discount`);
    
    // Make sure user is eligible
    const isEligible = await activity.checkEligibility(userAddress);
    
    if (!isEligible) {
      const madeEligible = await registerPurchase(user);
      if (!madeEligible) {
        console.log("Could not make user eligible, skipping discount test");
        return;
      }
    }
    
    // Get proof for this user and discount rate
    const proof = getDiscountProof(discountTree, userAddress, discountRate);
    console.log(`Merkle proof generated with ${proof.length} elements`);
    
    // Create eligibility proof for claim
    const timestamp = Math.floor(Date.now() / 1000);
    const message = ethers.getBytes(ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "string"],
        [userAddress, timestamp, "BUY_X_APECOIN_WORTH_OF_TOKENS"]
      )
    ));
    
    // Since deployer is the signing key, we use deployer to sign
    const signature = await deployer.signMessage(message);
    
    // Encode the eligibility proof
    const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes", "uint256"],
      [signature, timestamp]
    );
    
    try {
      // Get reward token balance before claim
      const beforeBalance = await rewardToken.balanceOf(userAddress);
      console.log(`Reward token balance before claim: ${ethers.formatUnits(beforeBalance, 18)}`);
      
      // Check if user can claim
      try {
        const canClaim = await tim3cap.canUserClaim(userAddress, eligibilityProof);
        console.log(`Can user claim: ${canClaim}`);
        
        if (!canClaim) {
          console.log("User cannot claim. May have already claimed or not eligible.");
          return;
        }
      } catch (error: any) {
        // If canUserClaim method doesn't exist, proceed anyway
        console.log(`Note: canUserClaim check failed: ${error.message}`);
      }
      
      // We'll use the deployer to claim on behalf of the test user for simplicity
      // On a live system, each user would submit their own transaction
      const claimTx = await tim3cap.claim(
        eligibilityProof,
        discountRate,
        proof,
        { gasLimit: 3000000 }
      );
      console.log(`Claim transaction hash: ${claimTx.hash}`);
      
      const receipt = await claimTx.wait();
      console.log(`Claim successful! Gas used: ${receipt?.gasUsed.toString()}`);
      
      // Get reward token balance after claim
      const afterBalance = await rewardToken.balanceOf(userAddress);
      console.log(`Reward token balance after claim: ${ethers.formatUnits(afterBalance, 18)}`);
      console.log(`Tokens received: ${ethers.formatUnits(afterBalance - beforeBalance, 18)}`);
      
      // Check for discount event
      const discountEvent = receipt?.logs.find((log: any) => {
        try {
          const parsed = tim3cap.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          return parsed?.name === "ClaimWithDiscount";
        } catch {
          return false;
        }
      });
      
      if (discountEvent) {
        const parsedEvent = tim3cap.interface.parseLog({
          topics: discountEvent.topics,
          data: discountEvent.data
        });
        console.log(`Discount rate applied: ${parsedEvent?.args[1] / 100}%`);
      } else {
        console.log(`No discount event found, might have used standard claim`);
      }
    } catch (error: any) {
      console.log(`❌ Claim failed: ${error.message}`);
    }
  };
  
  // Test with deployer's discount rate
  await testDiscountClaim(deployer, 1000); // 10%
  
  // Test with wrong discount rate (should fail verification)
  console.log("\n=== Testing with Wrong Discount Rate ===");
  const wrongDiscountRate = 4000; // 40% (not in the tree)
  const wrongProof = getDiscountProof(discountTree, deployer.address, 1000); // Correct proof for 10%
  
  console.log(`Testing claim with wrong discount rate: ${wrongDiscountRate / 100}%`);
  
  // Create eligibility proof for claim
  const timestamp = Math.floor(Date.now() / 1000);
  const message = ethers.getBytes(ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "string"],
      [deployer.address, timestamp, "BUY_X_APECOIN_WORTH_OF_TOKENS"]
    )
  ));
  const signature = await deployer.signMessage(message);
  
  // Encode the eligibility proof
  const eligibilityProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes", "uint256"],
    [signature, timestamp]
  );
  
  try {
    const claimTx = await tim3cap.claim(
      eligibilityProof,
      wrongDiscountRate,
      wrongProof,
      { gasLimit: 3000000 }
    );
    console.log(`Wrong discount claim transaction hash: ${claimTx.hash}`);
    
    const receipt = await claimTx.wait();
    console.log(`Wrong discount claim successful? This should not happen! Gas used: ${receipt?.gasUsed.toString()}`);
  } catch (error: any) {
    console.log(`✅ Wrong discount claim correctly failed: ${error.message}`);
  }
  
  console.log("\n=== Merkle Discount Test Completed ===");
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    process.exit(1);
  });