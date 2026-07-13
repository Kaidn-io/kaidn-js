/**
 * Example: gate a signup on the fraud verdict, then report the outcome later.
 * Run: KAIDN_API_KEY=... npx tsx examples/score-signup.ts
 */
import { Kaidn, KaidnError } from "@kaidn/sdk";

const kaidn = new Kaidn({ apiKey: process.env.KAIDN_API_KEY! });

async function main() {
  try {
    const result = await kaidn.score({
      event: "signup",
      user_id: "u_8231",
      ip: "203.0.113.7",
      email: "user@example.com",
      device_id: "fp_abc123", // from @kaidn/fp in the browser
      event_country: "US",
    });

    console.log(`verdict: ${result.verdict}  score: ${result.score}`);
    console.log("reasons:", result.reasons.join(", "));
    console.log("explanation:", result.reason_text);

    if (result.verdict === "block") {
      // ...deny the signup...
      // later, if you confirm it was truly fraud, feed it back to the graph:
      await kaidn.label({ label: "fraud", event_id: result.event_id });
    }
  } catch (err) {
    if (err instanceof KaidnError && err.status === 429) {
      console.error("Monthly quota reached — upgrade your plan.");
    } else {
      throw err;
    }
  }
}

main();
