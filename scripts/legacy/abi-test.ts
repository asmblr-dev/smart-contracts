import fs from "fs";

const abi = JSON.parse(fs.readFileSync("artifacts/contracts/Tim3cap.sol/Tim3cap.json", "utf8")).abi;
const hasClaim = abi.find((f: any) => f.name === "claim");
console.log("✅ claim() found in ABI?", Boolean(hasClaim));
