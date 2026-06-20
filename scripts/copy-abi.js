const fs = require("fs");
const path = require("path");

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "PayGuard.sol", "PayGuard.json");
const targets = [
  path.join(__dirname, "..", "server", "abi", "PayGuard.json"),
  path.join(__dirname, "..", "frontend", "src", "abi", "PayGuard.json")
];

if (!fs.existsSync(artifactPath)) {
  throw new Error("PayGuard artifact not found. Run npm run compile first.");
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Copied ABI to ${path.relative(process.cwd(), target)}`);
}
