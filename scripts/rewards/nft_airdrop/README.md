# NFT Airdrop Test Scripts

This directory contains scripts for testing the NFTAirdropReward contract within the Tim3cap system. The scripts are designed to be run sequentially and reuse previously deployed contracts.

## Directory Structure

```
E:\code\debug_contracts\scripts\nft_airdrop\
│
├── deploy-implementation.ts  - Deploys base implementations (run once)
├── deploy-instance.ts        - Creates NFT airdrop instances (run for each test)
├── test-nft-airdrop.ts       - Tests NFT airdrop functionality
│
└── deployments/              - Generated directory for deployment data 
    ├── base-deployments.json - Stores base implementation addresses
    └── nft-airdrop-instances.json - Stores NFT airdrop instance addresses
```

## Script Descriptions

### 1. deploy-implementation.ts

Deploys the base implementation contracts once and saves their addresses to a file:

- Tim3cap core implementation
- HoldXNfts activity implementation
- NFTAirdropReward implementation
- Tim3cap Registry
- Tim3cap Factory
- Activity NFT contract (for eligibility criteria)
- Airdrop NFT contract (for airdrop rewards)

This only needs to be run once unless you want to deploy fresh implementations.

### 2. deploy-instance.ts

Creates new Tim3cap instances with NFTAirdropReward and configures them:

- Creates a broker wallet and funds it with ETH
- Mints NFTs to the broker wallet (for airdrop distribution)
- Mints activity NFTs to users for eligibility
- Creates two Tim3cap instances:
  - One with manual distribution
  - One with automatic distribution
- Sets up broker wallet approvals for NFT transfers
- Creates a list of eligible users
- Saves all instance data to a file

Run this script to create new instances for testing without redeploying the base implementations.

### 3. test-nft-airdrop.ts

Tests the NFT airdrop functionality:

- Loads all deployment data from files
- Tests manual claiming (through Tim3cap)
- Tests manual token ID assignment
- Tests automatic distribution to eligible users
- Verifies NFT transfers and claim status
- Checks airdrop stats and debug information
- Provides detailed logging of the entire process

## How to Run

1. First, deploy the base implementations (only once):

```
npx hardhat run scripts/nft_airdrop/deploy-implementation.ts --network hardhat
```

2. Next, create NFT airdrop instances:

```
npx hardhat run scripts/nft_airdrop/deploy-instance.ts --network hardhat
```

3. Finally, run the test script:

```
npx hardhat run scripts/nft_airdrop/test-nft-airdrop.ts --network hardhat
```

## Key Differences from Token Airdrop

The NFTAirdropReward contract differs from TokenAirdropReward in several ways:

1. **NFT vs. Token Management**
   - Deals with ERC721 NFTs instead of ERC20 tokens
   - Uses NFT-specific approvals (setApprovalForAll)
   - Requires tracking which specific token IDs are assigned to which users

2. **Token ID Assignment**
   - NFTAirdropReward allows manual assignment of specific token IDs to users
   - Has functions to automatically find available token IDs owned by the broker

3. **Claim Process**
   - When a user claims, they receive a specific NFT with a unique token ID
   - The contract tracks which token ID each user receives
   - The claimNFT function initiates the claim process

4. **Automatic Distribution**
   - Provides the list of eligible users when triggering automatic distribution
   - Assigns token IDs to users automatically during distribution
   - Transfers specific NFTs rather than fungible tokens

## Notes

- The broker wallet private key is saved to the instance file for testing purposes
- Automatic distribution is configured with a short time window (5 minutes) for testing
- The test script can handle previously claimed NFTs
- If automatic distribution fails, the script will check and fix common issues