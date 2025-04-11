# Token Airdrop Test Scripts

This directory contains scripts for testing the TokenAirdropReward contract within the Tim3cap system. The scripts are designed to be run sequentially and reuse previously deployed contracts.

## Directory Structure

```
E:\code\debug_contracts\scripts\token_airdrop\
│
├── deploy-implementation.ts  - Deploys base implementations (run once)
├── deploy-instance.ts        - Creates token airdrop instances (run for each test)
├── test-token-airdrop.ts     - Tests token airdrop functionality
│
└── deployments/              - Generated directory for deployment data 
    ├── base-deployments.json - Stores base implementation addresses
    └── airdrop-instances.json - Stores token airdrop instance addresses
```

## Script Descriptions

### 1. deploy-implementation.ts

Deploys the base implementation contracts once and saves their addresses to a file:

- Tim3cap core implementation
- HoldXNfts activity implementation
- TokenAirdropReward implementation
- Tim3cap Registry
- Tim3cap Factory
- Test NFT contract (for activity eligibility)
- Test ERC20 token (for airdrop rewards)

This only needs to be run once unless you want to deploy fresh implementations.

### 2. deploy-instance.ts

Creates new Tim3cap instances with TokenAirdropReward and configures them:

- Creates a broker wallet and funds it with ETH and tokens
- Mints test NFTs to users for eligibility
- Creates two Tim3cap instances:
  - One with manual distribution
  - One with automatic distribution
- Sets up broker wallet approvals
- Creates a list of eligible users
- Saves all instance data to a file

Run this script to create new instances for testing without redeploying the base implementations.

### 3. test-token-airdrop.ts

Tests the token airdrop functionality:

- Loads all deployment data from files
- Tests manual claiming (through Tim3cap)
- Tests automatic distribution to eligible users
- Verifies token transfers and claim status
- Checks airdrop stats and debug information
- Provides detailed logging of the entire process

## How to Run

1. First, deploy the base implementations (only once):

```
npx hardhat run scripts/token_airdrop/deploy-implementation.ts --network hardhat
```

2. Next, create token airdrop instances:

```
npx hardhat run scripts/token_airdrop/deploy-instance.ts --network hardhat
```

3. Finally, run the test script:

```
npx hardhat run scripts/token_airdrop/test-token-airdrop.ts --network hardhat
```

## Key Differences from Token Raffle

The TokenAirdropReward contract differs from TokenRaffleReward in a few key ways:

1. **Eligibility vs Winners**
   - TokenRaffleReward has a predefined list of winners
   - TokenAirdropReward allows any eligible user to claim tokens

2. **Token Supply**
   - TokenAirdropReward has a total airdrop amount that limits how many users can claim
   - TokenRaffleReward distributes to a fixed number of winners

3. **Automatic Distribution**
   - For TokenAirdropReward, you need to provide the list of eligible users when triggering automatic distribution
   - For TokenRaffleReward, the contract already knows the winners

## Notes

- The broker wallet private key is saved to the instance file for testing purposes
- Automatic distribution is configured with a short time window (5 minutes) for testing
- The test script can handle previously claimed tokens
- If automatic distribution fails, the script will check and fix common issues