import { parseArg, run } from "./agent-lib.mjs";

const risk = parseArg("risk", "medium");
const gates = [
  ["npm", ["run", "agent:doctor"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "agent:eval"]],
];
if (["high", "critical"].includes(risk)) {
  gates.push(["npm", ["run", "test:coverage"]], ["npm", ["run", "build"]]);
}
if (risk === "critical") {
  gates.push(["npm", ["run", "demo:e2e"]]);
}

const results = [];
for (const [command, args] of gates) {
  const result = run(command, args);
  results.push(result);
  if (result.status !== 0) break;
}
console.log("\nGate cost");
for (const result of results) console.log(`${result.status === 0 ? "PASS" : "FAIL"} ${result.command} ${result.ms}ms`);
process.exit(results.every((result) => result.status === 0) ? 0 : 1);
