import { countBySeverity, reviewMotion } from "../src/review.js";
import { defaultVaultDir, loadVault, VaultLoadError } from "../src/vault.js";

const dir = process.env["VAULT_DIR"] ?? defaultVaultDir();

try {
  const vault = loadVault(dir);
  let errors = 0;
  for (const reference of vault.references) {
    const findings = reviewMotion(reference.html);
    const counts = countBySeverity(findings);
    errors += counts.error;
    console.log(`${reference.slug}  errors ${counts.error}  warnings ${counts.warn}`);
    for (const f of findings) console.log(`  ${f.severity} ${f.principle} line ${f.line}  ${f.message}`);
  }
  console.log(`${vault.references.length} references, ${errors} error findings`);
  process.exit(errors > 0 ? 1 : 0);
} catch (error) {
  if (!(error instanceof VaultLoadError)) throw error;
  console.error(error.message);
  process.exit(1);
}
