export interface Trade {
  id: string;
  tradeNo: string;
  date: string;
  name: string;
  entry: number;
  avgEntry: number;
  sl: number;
  tsl: number;
  buySell: "Buy" | "Sell";
  cmp: number;
  setup: string;
  baseDuration: string;
  initialQty: number;
  pyramid1Price: number;
  pyramid1Qty: number;
  pyramid1Date: string;
  pyramid2Price: number;
  pyramid2Qty: number;
  pyramid2Date: string;
  positionSize: number;
  allocation: number;
  slPercent: number;
  exit1Price: number;
  exit1Qty: number;
  exit1Date: string;
  exit2Price: number;
  exit2Qty: number;
  exit2Date: string;
  exit3Price: number;
  exit3Qty: number;
  exit3Date: string;
  openQty: number;
  exitedQty: number;
  avgExitPrice: number;
  stockMove: number;
  rewardRisk: number;
  holdingDays: number;
  positionStatus: "Open" | "Closed" | "Partial";
  realisedAmount: number;
  plRs: number;
  pfImpact: number;
  cummPf: number;
  planFollowed: boolean;
  exitTrigger: string;
  proficiencyGrowthAreas: string;
  openHeat: number;
  notes?: string;
}

export interface CapitalChange {
  id: string;
  date: string;
  amount: number;  // Positive for deposits, negative for withdrawals
  type: 'deposit' | 'withdrawal';
  description: string;
}

export interface MonthlyCapital {
  month: string;
  year: number;
  startingCapital: number;
  deposits: number;
  withdrawals: number;
  pl: number;
  finalCapital: number;
}

export interface MonthlyCapitalHistory {
  month: string; // e.g. 'Jan'
  year: number;
  startingCapital: number;
}
