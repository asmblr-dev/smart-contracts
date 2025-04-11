// scripts/get-contract-abi.ts
import fs from 'fs';
import path from 'path';

async function main() {
  // Path to the compiled contract artifact
  const artifactPath = path.join(
    __dirname, 
    '../artifacts/contracts/NFTMintReward.sol/NFTMintReward.json'
  );
  
  // Read the artifact file
  const artifactFile = fs.readFileSync(artifactPath, 'utf8');
  const artifact = JSON.parse(artifactFile);
  
  // Extract the ABI
  const abi = artifact.abi;
  
  // Write the ABI to a file that your lambda can use
  const abiOutputPath = path.join(__dirname, '../abi/NFTMintReward.json');
  fs.mkdirSync(path.dirname(abiOutputPath), { recursive: true });
  fs.writeFileSync(abiOutputPath, JSON.stringify(abi, null, 2));
  
  console.log(`ABI written to ${abiOutputPath}`);
  
  // Optionally write all ABIs you need
  const contracts = ['NFTMintReward', 'HoldXNfts', 'Tim3cap', 'Tim3capFactory'];
  for (const contract of contracts) {
    const contractArtifactPath = path.join(
      __dirname, 
      `../artifacts/contracts/${contract}.sol/${contract}.json`
    );
    
    const contractArtifactFile = fs.readFileSync(contractArtifactPath, 'utf8');
    const contractArtifact = JSON.parse(contractArtifactFile);
    
    const contractAbi = contractArtifact.abi;
    const contractAbiOutputPath = path.join(__dirname, `../abi/${contract}.json`);
    fs.writeFileSync(contractAbiOutputPath, JSON.stringify(contractAbi, null, 2));
    
    console.log(`${contract} ABI written to ${contractAbiOutputPath}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });