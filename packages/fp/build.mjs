// Builds the browser drop-in bundle: a single self-contained IIFE that exposes
// window.Kaidn (ThumbmarkJS inlined). This is the file a customer includes with
// one <script src="…/fp.js"> tag. Run: npm run build --workspace @kaidn/fp
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

const common = {
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"], // wide browser support for a drop-in tag
  platform: "browser",
  sourcemap: false,
  legalComments: "none",
};

// 1) the drop-in tracker tag → window.Kaidn (store/trigger/beacon on a form)
await build({
  ...common,
  entryPoints: [join(root, "src/browser.ts")],
  outfile: join(root, "dist/fp.js"),
});

// 2) the raw API → window.KaidnFp = { collect, beacon }. Used by playgrounds and
//    anyone who wants collect()/beacon() directly rather than the form helper.
await build({
  ...common,
  stdin: {
    contents: `import { collect, beacon, watch } from "./src/index.js"; window.KaidnFp = { collect, beacon, watch };`,
    resolveDir: root,
    loader: "ts",
  },
  outfile: join(root, "dist/fp-collect.js"),
});

console.log("built dist/fp.js (window.Kaidn) + dist/fp-collect.js (window.KaidnFp)");
