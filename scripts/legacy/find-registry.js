const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const address = signer.address;

  console.log("Scanning for registry owned by:", address);

  // Use a known possible registry deployment range
  const latestBlock = await ethers.provider.getBlockNumber();
  const fromBlock = latestBlock - 5000; // scan last ~5000 blocks

  const logs = await ethers.provider.getLogs({
    fromBlock,
    toBlock: "latest",
    topics: [], // all events
  });

  const contractAddresses = new Set();
  for (const log of logs) {
    if (log.address) {
      contractAddresses.add(log.address);
    }
  }

  for (const addr of contractAddresses) {
    try {
      const candidate = await ethers.getContractAt("Tim3capRegistry", addr);
      const owner = await candidate.owner();
      if (owner.toLowerCase() === address.toLowerCase()) {
        console.log("✅ Found Tim3capRegistry at:", addr);
        return;
      }
    } catch (err) {
      // not a registry
    }
  }

  console.log("❌ Tim3capRegistry not found in scanned range.");
}

main().catch(console.error);
