import { Trade } from '../types/trade';

/**
 * Groups trades by month based on the accounting method
 * @param trades - Array of trades
 * @param useCashBasis - Whether to use cash basis (true) or accrual basis (false)
 * @returns Object with month keys and arrays of trades
 */
export function groupTradesByMonth(trades: Trade[], useCashBasis: boolean = false): Record<string, Trade[]> {
  const groupedTrades: Record<string, Trade[]> = {};

  trades.forEach(trade => {
    if (useCashBasis) {
      // Cash basis: Group by exit dates
      if (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial') {
        const exits = [
          { date: trade.exit1Date, qty: trade.exit1Qty || 0 },
          { date: trade.exit2Date, qty: trade.exit2Qty || 0 },
          { date: trade.exit3Date, qty: trade.exit3Qty || 0 }
        ].filter(exit => exit.date && exit.qty > 0);

        exits.forEach(exit => {
          const exitDate = new Date(exit.date);
          const monthKey = `${exitDate.toLocaleString('default', { month: 'short' })} ${exitDate.getFullYear()}`;
          
          if (!groupedTrades[monthKey]) {
            groupedTrades[monthKey] = [];
          }
          
          // Create a partial trade object for this exit
          const partialTrade: Trade = {
            ...trade,
            // Mark this as a partial exit for cash basis calculation
            _cashBasisExit: {
              date: exit.date,
              qty: exit.qty,
              price: 0 // Will be determined in calculateTradePL
            }
          };
          
          groupedTrades[monthKey].push(partialTrade);
        });
      }
    } else {
      // Accrual basis: Group by trade initiation date (current behavior)
      if (trade.date) {
        const tradeDate = new Date(trade.date);
        const monthKey = `${tradeDate.toLocaleString('default', { month: 'short' })} ${tradeDate.getFullYear()}`;
        
        if (!groupedTrades[monthKey]) {
          groupedTrades[monthKey] = [];
        }
        
        groupedTrades[monthKey].push(trade);
      }
    }
  });

  return groupedTrades;
}

/**
 * Calculates P/L for a trade based on accounting method
 * @param trade - The trade object
 * @param useCashBasis - Whether to use cash basis accounting
 * @returns P/L amount
 */
export function calculateTradePL(trade: Trade, useCashBasis: boolean = false): number {
  if (!useCashBasis) {
    // Accrual basis: Use the trade's total realized P/L
    return trade.plRs || 0;
  } else {
    // Cash basis: Calculate P/L for the specific exit if it's a cash basis exit
    const cashBasisExit = trade._cashBasisExit;
    if (cashBasisExit) {
      const avgEntry = trade.avgEntry || trade.entry || 0;

      // Find the correct exit price for this specific exit
      let correctExitPrice = 0;
      if (trade.exit1Date === cashBasisExit.date && trade.exit1Qty === cashBasisExit.qty) {
        correctExitPrice = trade.exit1Price || 0;
      } else if (trade.exit2Date === cashBasisExit.date && trade.exit2Qty === cashBasisExit.qty) {
        correctExitPrice = trade.exit2Price || 0;
      } else if (trade.exit3Date === cashBasisExit.date && trade.exit3Qty === cashBasisExit.qty) {
        correctExitPrice = trade.exit3Price || 0;
      }

      if (avgEntry > 0 && correctExitPrice > 0) {
        const pl = trade.buySell === 'Buy'
          ? (correctExitPrice - avgEntry) * cashBasisExit.qty
          : (avgEntry - correctExitPrice) * cashBasisExit.qty;
        return pl;
      }
    } else {
      // Cash basis for individual trades (not grouped): Use the trade's total realized P/L
      // This handles the case when calculating stats for individual trades
      if (trade.positionStatus === 'Closed') {
        return trade.plRs || 0;
      } else if (trade.positionStatus === 'Partial') {
        // For partial positions, calculate realized P/L from exits only
        const avgEntry = trade.avgEntry || trade.entry || 0;
        let totalRealizedPL = 0;

        // Calculate P/L for each exit
        if (trade.exit1Date && trade.exit1Qty && trade.exit1Price && avgEntry > 0) {
          const pl = trade.buySell === 'Buy'
            ? (trade.exit1Price - avgEntry) * trade.exit1Qty
            : (avgEntry - trade.exit1Price) * trade.exit1Qty;
          totalRealizedPL += pl;
        }

        if (trade.exit2Date && trade.exit2Qty && trade.exit2Price && avgEntry > 0) {
          const pl = trade.buySell === 'Buy'
            ? (trade.exit2Price - avgEntry) * trade.exit2Qty
            : (avgEntry - trade.exit2Price) * trade.exit2Qty;
          totalRealizedPL += pl;
        }

        if (trade.exit3Date && trade.exit3Qty && trade.exit3Price && avgEntry > 0) {
          const pl = trade.buySell === 'Buy'
            ? (trade.exit3Price - avgEntry) * trade.exit3Qty
            : (avgEntry - trade.exit3Price) * trade.exit3Qty;
          totalRealizedPL += pl;
        }

        return totalRealizedPL;
      }
    }

    return 0;
  }
}

/**
 * Gets the relevant date for a trade based on accounting method
 * @param trade - The trade object
 * @param useCashBasis - Whether to use cash basis accounting
 * @returns Date string
 */
export function getTradeDateForAccounting(trade: Trade, useCashBasis: boolean = false): string {
  if (!useCashBasis) {
    // Accrual basis: Use trade initiation date
    return trade.date;
  } else {
    // Cash basis: Use exit date if it's a cash basis exit
    const cashBasisExit = trade._cashBasisExit;
    if (cashBasisExit) {
      return cashBasisExit.date;
    }
    
    // Fallback to trade date if no cash basis exit
    return trade.date;
  }
}

/**
 * Filters trades for a specific month and year based on accounting method
 * @param trades - Array of trades
 * @param month - Month name (e.g., 'Jan', 'Feb')
 * @param year - Year number
 * @param useCashBasis - Whether to use cash basis accounting
 * @returns Filtered trades for the month
 */
export function getTradesForMonth(trades: Trade[], month: string, year: number, useCashBasis: boolean = false): Trade[] {
  if (!useCashBasis) {
    // Accrual basis: Filter by trade initiation date
    return trades.filter(trade => {
      if (!trade.date) return false;
      const tradeDate = new Date(trade.date);
      const tradeMonth = tradeDate.toLocaleString('default', { month: 'short' });
      const tradeYear = tradeDate.getFullYear();
      return tradeMonth === month && tradeYear === year;
    });
  } else {
    // Cash basis: Filter by exit dates
    const monthTrades: Trade[] = [];
    
    trades.forEach(trade => {
      if (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial') {
        const exits = [
          { date: trade.exit1Date, qty: trade.exit1Qty || 0, price: trade.exit1Price || 0 },
          { date: trade.exit2Date, qty: trade.exit2Qty || 0, price: trade.exit2Price || 0 },
          { date: trade.exit3Date, qty: trade.exit3Qty || 0, price: trade.exit3Price || 0 }
        ].filter(exit => exit.date && exit.qty > 0 && exit.price > 0);

        exits.forEach(exit => {
          const exitDate = new Date(exit.date);
          const exitMonth = exitDate.toLocaleString('default', { month: 'short' });
          const exitYear = exitDate.getFullYear();
          
          if (exitMonth === month && exitYear === year) {
            // Create a partial trade object for this exit
            const partialTrade: Trade = {
              ...trade,
              _cashBasisExit: {
                date: exit.date,
                qty: exit.qty,
                price: exit.price
              }
            };
            
            monthTrades.push(partialTrade);
          }
        });
      }
    });
    
    return monthTrades;
  }
}
