import { terser } from "rollup-plugin-terser";

const variants = ["wasm", "js"];
const formats = ["umd", "es"];

const outputs = variants.reduce(
  (acc, variant) => [
    ...acc,
    {
      input: `bazel-bin/loop-wasm/loop.${variant}`,
      output: formats.reduce(
        (acc, format) => [
          ...acc,
          {
            file: `dist/${variant}/${format}/index.js`,
            sourcemap: true,
            format,
            name: "HelloWorld",
            plugins: [terser()],
          },
        ],
        []
      ),
    },
  ],
  []
);

export default outputs;
