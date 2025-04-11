const { ethers } = require("hardhat");

async function main() {
    const abi = [
        "function initialized() view returns (bool)",
        "function maxSupply() view returns (uint256)"
    ];

    const reward = await ethers.getContractAt(abi, "0x9fB4bF9d1cb7e8edD7a9Ff15E7cA6e7BD2fA0356");
    const isInit = await reward.initialized();
    console.log("Initialized:", isInit);

    const maxSupply = await reward.maxSupply();
    const totalClaims = await reward.totalClaims();
    console.log("maxSupply:", maxSupply.toString());
    console.log("totalClaims:", totalClaims.toString());
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
