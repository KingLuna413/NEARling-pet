// On-chain reads. NEARling never signs transactions in v1 â€” it only reads.
import { CONFIG, isLive } from "./config.js";

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBytes(bytes) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
}

async function rpc(method, params) {
  const res = await fetch(CONFIG.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "nearling", method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "RPC error");
  return data.result;
}

export async function viewCall(account, method, args = {}) {
  const result = await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: account,
    method_name: method,
    args_base64: b64(JSON.stringify(args)),
  });
  return decodeBytes(result.result);
}

export async function accountExists(account) {
  const result = await rpc("query", {
    request_type: "view_account",
    finality: "final",
    account_id: account,
  });
  return result && typeof result.amount === "string";
}

export function isValidAccount(account) {
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(account) && account.length >= 2 && account.length <= 64;
}

/** Reads the launched token: balance, metadata and DexScreener price. */
export async function readTokenState(account) {
  if (!isLive()) return null;
  const [balanceRaw, metadata] = await Promise.all([
    viewCall(CONFIG.tokenContract, "ft_balance_of", { account_id: account }),
    viewCall(CONFIG.tokenContract, "ft_metadata", {}).catch(() => null),
  ]);
  const decimals = Number(metadata?.decimals ?? 18);
  const balance = Number(balanceRaw) / 10 ** decimals;
  let price = null;
  let change24h = null;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CONFIG.tokenContract}`);
    if (res.ok) {
      const data = await res.json();
      const pair = (data.pairs ?? [])[0];
      if (pair) {
        price = Number(pair.priceUsd);
        change24h = Number(pair.priceChange?.h24 ?? 0);
      }
    }
  } catch {
    /* price is optional */
  }
  return { balance, symbol: metadata?.symbol ?? CONFIG.ticker, decimals, price, change24h };
}

export function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}
