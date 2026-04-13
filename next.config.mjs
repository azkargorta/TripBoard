/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "Content-Type", value: "application/json; charset=utf-8" }],
      },
    ];
  },
  experimental: {
    // Evita que Next intente "bundle/trazar" los workers de tesseract en runtime,
    // lo que en Windows puede acabar en `.next/worker-script/...` MODULE_NOT_FOUND.
    serverComponentsExternalPackages: ["tesseract.js"],
    // Mantén assets binarios disponibles en entornos serverless/trace.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/**/*.wasm", "./node_modules/**/*.proto"],
    },
  },
};

export default nextConfig;

