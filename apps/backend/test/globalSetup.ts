import { execSync } from "node:child_process";

/**
 * Safety net for DB tests: Ryuk (testcontainers' reaper) is off on Colima, so a
 * file that times out during setup can leave its Postgres container running
 * forever — a dozen of those kept the Docker VM at ~65% CPU. After every run,
 * remove whatever test containers are still around. Only containers labelled
 * by testcontainers are touched; the dev database (aivillage-pg) is not.
 */
export function teardown(): void {
  try {
    const ids = execSync("docker ps -aq --filter label=org.testcontainers=true", { encoding: "utf8" }).trim();
    if (ids) execSync(`docker rm -f ${ids.split(/\s+/).join(" ")}`, { stdio: "ignore" });
  } catch {
    /* no docker CLI / daemon: nothing to clean */
  }
}
