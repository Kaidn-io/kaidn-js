// Example: gate a signup on the fraud verdict, then report the outcome later.
//
// Run it from the repo root:   npm run example:score
// (that builds @kaidn/sdk and loads your key from .env — see .env.example)
//
// Or directly:   KAIDN_API_KEY=kaidn_… node packages/sdk/examples/score-signup.mjs
import { Kaidn, KaidnError } from "@kaidn/sdk";

const apiKey = process.env.KAIDN_API_KEY;
if (!apiKey) {
  console.error("\n  Set KAIDN_API_KEY first — copy .env.example to .env and add your key,\n  or run:  KAIDN_API_KEY=kaidn_… node packages/sdk/examples/score-signup.mjs\n");
  process.exit(1);
}

const kaidn = new Kaidn({ apiKey });

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
  if (err instanceof KaidnError) {
    // the API rejected the request — status + message tell you why
    console.error(`Kaidn error ${err.status}: ${err.message}`);
    if (err.status === 429) console.error("(monthly quota reached — upgrade your plan)");
    process.exit(1);
  }
  throw err; // an unexpected (non-API) error — surface it
}
