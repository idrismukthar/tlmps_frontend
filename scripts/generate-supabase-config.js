const fs = require("node:fs");
const path = require("node:path");

function readEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );
}

const env = { ...readEnvFile(), ...process.env };
const url = env.SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured.");
}

const output = `window.TLMPS_SUPABASE = ${JSON.stringify({
  url,
  publishableKey: key
})};\n`;

const outputPath = path.join(__dirname, "..", "js", "supabase-config.js");
fs.writeFileSync(outputPath, output, "utf8");
console.log("Generated js/supabase-config.js");
