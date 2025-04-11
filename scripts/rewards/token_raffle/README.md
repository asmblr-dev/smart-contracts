# Token Raffle Test Scripts

This directory contains scripts for testing the TokenRaffleReward contract within the Tim3cap system. The scripts are designed to be run sequentially and reuse previously deployed contracts.

## Directory Structure

```
E:\code\debug_contracts\scripts\token_raffle\
│
├── deploy-implementation.ts  - Deploys base implementations (run once)
├── deploy-instance.ts        - Creates token raffle instances (run for each test)
├── test-token-raffle.ts      - Tests token raffle functionality
│
└── deployments/              - Generated directory for deployment data 
    ├── base-deployments.json - Stores base implementation addresses
    └── raffle-instances.json - Stores token raffle instance addresses
```

## Script Descriptions

### 1. deploy-implementation.ts

Deploys the base implementation contracts once and saves their addresses to a file:

- Tim3cap core implementation
- HoldXNfts activity implementation
- TokenRaffleReward implementation
- Tim3cap Registry
- Tim3cap Factory
- Test NFT contract (for activity eligibility)
- Test ERC20 token (for raffle rewards)

This only needs to be run once unless you want to deploy fresh implementations.

### 2. deploy-instance.ts

Creates new Tim3cap instances with TokenRaffleReward and configures them:

- Creates a broker wallet and funds it with ETH and tokens
- Mints test NFTs to users for eligibility
- Creates two Tim3cap instances:
  - One with manual distribution
  - One with automatic distribution
- Sets up broker wallet approvals
- Configures winners
- Saves all instance data to a file

Run this script to create new instances for testing without redeploying the base implementations.

### 3. test-token-raffle.ts

Tests the token raffle functionality:

- Loads all deployment data from files
- Tests manual claiming (through Tim3cap and directly)
- Tests automatic distribution
- Verifies token transfers and claim status
- Provides detailed logging of the entire process

## How to Run

1. First, deploy the base implementations (only once):

```
npx hardhat run scripts/token_raffle/deploy-implementation.ts --network hardhat
```

2. Next, create token raffle instances:

```
npx hardhat run scripts/token_raffle/deploy-instance.ts --network hardhat
```

3. Finally, run the test script:

```
npx hardhat run scripts/token_raffle/test-token-raffle.ts --network hardhat
```

## Notes

- The broker wallet private key is saved to the instance file for testing purposes
- Automatic distribution is configured with a short time window (5 minutes) for testing
- The test script can handle previously claimed tokens and will try the other user
- If automatic distribution fails, the script will check and fix common issues