// Builds the browser drop-in bundle: a single self-contained IIFE that exposes
// window.Kaidn (ThumbmarkJS inlined). This is the file a customer includes with
// one <script src="…/fp.js"> tag. Run: npm run build --workspace @kaidn/fp
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(root, "src/browser.ts")],
  outfile: join(root, "dist/fp.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"], // wide browser support for a drop-in tag
  platform: "browser",
  sourcemap: false,
  legalComments: "none",
});

console.log("built dist/fp.js (browser drop-in, window.Kaidn)");
