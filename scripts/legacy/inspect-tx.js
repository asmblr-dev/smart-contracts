const { ethers } = require("hardhat");

async function main() {
  const txHash = "0x886d0cc10f341db452044b636430aed381d37b5d7df484944a2549d1ff9c35d1";
  const receipt = await ethers.provider.getTransactionReceipt(txHash);

  console.log(`Logs in tx ${txHash}:`);
  for (const log of receipt.logs) {
    try {
      const parsed = await ethers.getContractAt("Tim3capFactory", log.address)
        .then(c => c.interface.parseLog(log));
      console.log(`\n✔ Event from ${log.address}:`, parsed.name);
      console.log(parsed.args);
    } catch (err) {
      // Not from Tim3capFactory or can't decode
    }
  }
}

main().catch(console.error);
