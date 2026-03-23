import { spawn } from "child_process";

const count = parseInt(process.argv[2] || "2", 10);

console.log(`Starting ${count} Athena instances...`);

for (let i = 0; i < count; i++) {
  const child = spawn("npx", ["electron-forge", "start"], {
    stdio: "ignore",
    shell: true,
    cwd: process.cwd(),
    detached: true,
  });
  child.unref();
  console.log(`  Instance ${i + 1} launched (pid ${child.pid})`);
}
