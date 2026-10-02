import { SUPABASE } from "./supabase.config.js";

export const CONFIG = {
  name: "NEARling",
  ticker: "NRLING",
  
  tokenContract: "",
  supply: 1_000_000_000,
  pair: "NEARLY",
  launchpad: "https://nearly.trade",
  launchUrl: "https://nearly.trade/launch",
  rpc: "https://rpc.mainnet.near.org",
  explorer: "https://nearblocks.io/account/",
  fullnessTarget: 5_000_000,
  // sNearling economy
  snearling: {
    basePerDay: 720,         
    dustCeiling: 0.05,       
    slowPct: 0.5,            
    fastPct: 5,              
    bonuses: { play: 5, feed: 25, call: 8, quest: 20, boop: 1, breed: -120, hatch: 30, daily: 10 },
  },
  supabase: SUPABASE,
};

export const isLive = () => CONFIG.tokenContract.trim().length > 0;
export const supabaseReady = () => Boolean(CONFIG.supabase.url && CONFIG.supabase.anonKey);

export const nearlyTokenUrl = () =>
  isLive() ? `${CONFIG.launchpad}/${CONFIG.tokenContract}` : `${CONFIG.launchpad}/launch?pair=nearly-993927.nearlytrade.near`;
export const tokenAccountUrl = () => (isLive() ? `${CONFIG.explorer}${CONFIG.tokenContract}` : CONFIG.launchpad);
