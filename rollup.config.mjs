import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

const banner = "#!/usr/bin/env node";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/ranty.js",
    format: "umd",
    name: "Ranty",
    sourcemap: true,
    banner,
    exports: "named"
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    esbuild({
      target: "es2022",
      tsconfig: "tsconfig.json"
    })
  ]
};
