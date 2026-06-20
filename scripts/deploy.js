const hre = require("hardhat");

async function main() {
  const PayGuard = await hre.ethers.getContractFactory("PayGuard");
  const payGuard = await PayGuard.deploy();

  await payGuard.waitForDeployment();

  const address = await payGuard.getAddress();
  console.log(`Arbitra settlement contract deployed to: ${address}`);
  console.log("Add this address to server/.env as CONTRACT_ADDRESS");
  console.log("Add this address to frontend/.env as VITE_CONTRACT_ADDRESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
