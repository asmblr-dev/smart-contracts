# Whitelist Raffle Test Scripts

This directory contains scripts for testing the WhitelistRaffleReward contract within the Tim3cap system. The scripts are designed to be run sequentially and reuse previously deployed contracts.

## Directory Structure

```
E:\code\debug_contracts\scripts\whitelist_raffle\
│
├── deploy-implementation.ts  - Deploys base implementations (run once)
├── deploy-instance.ts        - Creates whitelist raffle instances (run for each test)
├── test-whitelist-raffle.ts  - Tests whitelist raffle functionality
│
└── deployments/              - Generated directory for deployment data 
    ├── base-deployments.json - Stores base implementation addresses
    └── whitelist-raffle-instances.json - Stores whitelist raffle instance addresses
```

## Script Descriptions

### 1. deploy-implementation.ts

Deploys the base implementation contracts once and saves their addresses to a file:

- Tim3cap core implementation
- HoldXNfts activity implementation
- WhitelistRaffleReward implementation
- Tim3cap Registry
- Tim3cap Factory
- Activity NFT contract (for eligibility criteria)

This only needs to be run once unless you want to deploy fresh implementations.

### 2. deploy-instance.ts

Creates new Tim3cap instances with WhitelistRaffleReward and configures them:

- Mints activity NFTs to users for eligibility
- Creates a set of test winners with tiers for bulk assignment
- Creates a Merkle tree for the winners and tiers
- Creates two Tim3cap instances:
  - One with manual distribution
  - One with automatic distribution
- Sets up eligible users list and winner lists
- Saves all instance data including Merkle proofs to a file

Run this script to create new instances for testing without redeploying the base implementations.

### 3. test-whitelist-raffle.ts

Tests the whitelist raffle functionality:

- Loads all deployment data from files
- Tests manual spot assignment through Tim3cap
- Tests direct spot assignment with tier
- Tests bulk spot assignment with Merkle proof
- Tests automatic distribution to winners
- Verifies spot assignments and tiers
- Checks raffle stats and debug information
- Provides detailed logging of the entire process

## How to Run

1. First, deploy the base implementations (only once):

```
npx hardhat run scripts/whitelist_raffle/deploy-implementation.ts --network hardhat
```

2. Next, create whitelist raffle instances:

```
npx hardhat run scripts/whitelist_raffle/deploy-instance.ts --network hardhat
```

3. Finally, run the test script:

```
npx hardhat run scripts/whitelist_raffle/test-whitelist-raffle.ts --network hardhat
```

## Key Features of WhitelistRaffleReward

1. **Event-Driven Architecture**
   - Emits `SpotAssigned` events that can be indexed by a subgraph
   - Events contain recipient address, spot index, and tier
   - Designed for CSV exports via subgraph queries

2. **Merkle Proof Support**
   - Supports bulk assignment with Merkle proofs for security
   - Prevents unauthorized spot assignments
   - Efficient assignment of multiple spots in a single transaction

3. **Tiered Whitelist Support**
   - Each spot can have an associated tier (e.g., Gold, Silver, Bronze)
   - Tiers can be set individually or in bulk
   - Tier information is emitted in events for reporting

4. **Distribution Options**
   - Manual: Users claim their own spots (with eligibility verification)
   - Bulk: Owner assigns spots in bulk with Merkle proof
   - Automatic: All winners are assigned spots automatically after a specified date

## Integration with The Graph

This contract is designed to work with The Graph for event indexing and CSV exports:

1. Create a subgraph that indexes the `SpotAssigned` events
2. Define an entity with fields for recipient, index, and tier
3. Query the data using GraphQL
4. Export to CSV for use in external applications

Example GraphQL query:
```graphql
{
  spotAssigns(first: 1000, orderBy: index) {
    recipient
    index
    tier
  }
}
```

## Notes

- Unlike token or NFT rewards, whitelist spots are purely event-driven and don't involve transfers
- The contract is gas-efficient since it doesn't need to interact with external contracts for transfers
- Merkle proofs provide security without requiring on-chain state for every eligible address
- The automatic distribution is configured with a short time window (5 minutes) for testing