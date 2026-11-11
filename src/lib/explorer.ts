import { EXPLORER } from "@/lib/config";

export function explorerTx(hash: string | null): string | null {
  if (!hash || hash.startsWith("demo:") || hash.startsWith("chain-error")) return null;
  return `${EXPLORER}/txns/${hash}`;
}

export function explorerAccount(account: string): string {
  return `${EXPLORER}/address/${account}`;
}
