# NFT Raffle Test Scripts

This directory contains scripts for testing the NFTRaffleReward contract within the Tim3cap system. The scripts are designed to be run sequentially and reuse previously deployed contracts.

## Directory Structure

```
E:\code\debug_contracts\scripts\nft_raffle\
│
├── deploy-implementation.ts  - Deploys base implementations (run once)
├── deploy-instance.ts        - Creates NFT raffle instances (run for each test)
├── test-nft-raffle.ts        - Tests NFT raffle functionality
│
└── deployments/              - Generated directory for deployment data 
    ├── base-deployments.json - Stores base implementation addresses
    └── nft-raffle-instances.json - Stores NFT raffle instance addresses
```

## Script Descriptions

### 1. deploy-implementation.ts

Deploys the base implementation contracts once and saves their addresses to a file:

- Tim3cap core implementation
- HoldXNfts activity implementation
- NFTRaffleReward implementation
- Tim3cap Registry
- Tim3cap Factory
- Activity NFT contract (for eligibility criteria)
- Raffle NFT contract (for raffle rewards)

This only needs to be run once unless you want to deploy fresh implementations.

### 2. deploy-instance.ts

Creates new Tim3cap instances with NFTRaffleReward and configures them:

- Creates a broker wallet and funds it with ETH
- Mints NFTs to the broker wallet (for raffle distribution)
- Mints activity NFTs to users for eligibility
- Creates two Tim3cap instances:
  - One with manual distribution
  - One with automatic distribution
- Sets up broker wallet approvals for NFT transfers
- Sets winners for both instances
- Saves all instance data to a file

Run this script to create new instances for testing without redeploying the base implementations.

### 3. test-nft-raffle.ts

Tests the NFT raffle functionality:

- Loads all deployment data from files
- Tests manual claiming (through Tim3cap)
- Tests automatic distribution to winners
- Tests manual token ID assignment
- Verifies NFT transfers and claim status
- Checks raffle stats and debug information
- Provides detailed logging of the entire process

## How to Run

1. First, deploy the base implementations (only once):

```
npx hardhat run scripts/nft_raffle/deploy-implementation.ts --network hardhat
```

2. Next, create NFT raffle instances:

```
npx hardhat run scripts/nft_raffle/deploy-instance.ts --network hardhat
```

3. Finally, run the test script:

```
npx hardhat run scripts/nft_raffle/test-nft-raffle.ts --network hardhat
```

## Key Differences from Token-Based Rewards

The NFTRaffleReward contract differs from token-based rewards in several ways:

1. **NFT Management**
   - Deals with ERC721 NFTs instead of ERC20 tokens
   - Uses NFT-specific approvals (setApprovalForAll)
   - Requires tracking which specific token IDs are assigned to which winners

2. **Token ID Assignment**
   - NFTRaffleReward allows manual assignment of specific token IDs to winners
   - Has functions to automatically find available token IDs owned by the broker

3. **Transfer Mechanism**
   - Uses safeTransferFrom for NFTs instead of transferFrom for tokens
   - Requires checking NFT ownership and approvals differently

## Notes

- The broker wallet private key is saved to the instance file for testing purposes
- Automatic distribution is configured with a short time window (5 minutes) for testing
- The test script can handle previously claimed NFTs
- Manual token ID assignment is tested if there are unclaimed winners
- If automatic distribution fails, the script will check and fix common issues