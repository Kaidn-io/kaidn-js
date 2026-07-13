/**
 * Example: bulk-score a batch of events (e.g. parsed from a CSV) and bulk-import
 * a blocklist. Run: KAIDN_API_KEY=... npx tsx examples/batch-and-lists.ts
 */
import { Kaidn } from "@kaidn/sdk";

const kaidn = new Kaidn({ apiKey: process.env.KAIDN_API_KEY! });

async function main() {
  // up to 1000 rows per call — chunk larger inputs yourself
  const { summary, results } = await kaidn.batch.score([
    { event: "signup", ip: "203.0.113.7", email: "a@example.com" },
    { event: "signup", ip: "198.51.100.9", email: "b@mailinator.com" },
    { event: "cashout", user_id: "u_42" },
  ]);
  console.log(`scored ${summary.processed}/${summary.total} — blocked: ${summary.block}`);
  for (const r of results) {
    if (r.ok) console.log(`  row ${r.row}: ${r.verdict} (${r.score})`);
    else console.log(`  row ${r.row}: error — ${r.error}`);
  }

  // bulk-import known-bad entities into your blocklist
  await kaidn.lists.import([
    { list: "block", type: "ip", value: "203.0.113.5" },
    { list: "block", type: "email", value: "fraud@example.com" },
  ]);

  // enrichment lookups (no event stored)
  const ip = await kaidn.check.ip("203.0.113.7");
  console.log("ip summary:", ip.summary);
}

main();
