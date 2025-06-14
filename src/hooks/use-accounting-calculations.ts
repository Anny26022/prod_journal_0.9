import { useMemo, useCallback } from 'react';
import { Trade } from '../types/trade';
import { useAccountingMethod } from '../context/AccountingMethodContext';
import { calculateTradePL, getTradeDateForAccounting } from '../utils/accountingUtils';
import { calcHoldingDays } from '../utils/tradeCalculations';

/**
 * Shared hook for accounting-aware P/L calculations
 * Eliminates redundant calculations across components
 */
export const useAccountingCalculations = (trades: Trade[]) => {
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';

  // Memoized P/L calculation function
  const calculateAccountingPL = useCallback((trade: Trade) => {
    return calculateTradePL(trade, useCashBasis);
  }, [useCashBasis]);

  // Memoized calculations to prevent unnecessary re-computations
  const calculations = useMemo(() => {
    // Handle edge cases
    if (!trades || trades.length === 0) {
      return {
        tradesWithAccountingPL: [],
        totalTrades: 0,
        winningTrades: [],
        losingTrades: [],
        winRate: 0,
        grossPL: 0,
        avgGain: 0,
        avgLoss: 0,
        avgPosMove: 0,
        avgNegMove: 0,
        avgPositionSize: 0,
        avgHoldingDays: 0,
        avgR: 0,
        planFollowed: 0,
        openPositions: 0,
        useCashBasis,
        accountingMethod
      };
    }

    // Calculate P/L for all trades using the current accounting method
    const tradesWithAccountingPL = trades.map(trade => {
      try {
        return {
          ...trade,
          accountingPL: calculateAccountingPL(trade)
        };
      } catch (error) {
        console.warn(`Error calculating P/L for trade ${trade.id}:`, error);
        return {
          ...trade,
          accountingPL: 0
        };
      }
    });

    // Basic statistics
    const totalTrades = tradesWithAccountingPL.length;
    const winningTrades = tradesWithAccountingPL.filter(t => t.accountingPL > 0);
    const losingTrades = tradesWithAccountingPL.filter(t => t.accountingPL < 0);
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    // P/L calculations
    const grossPL = tradesWithAccountingPL.reduce((sum, trade) => sum + trade.accountingPL, 0);
    const avgGain = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.accountingPL, 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + t.accountingPL, 0) / losingTrades.length
      : 0;

    // Stock move calculations (for performance metrics)
    const avgPosMove = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / winningTrades.length
      : 0;
    const avgNegMove = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / losingTrades.length
      : 0;

    // Position size and holding period calculations
    const avgPositionSize = totalTrades > 0 
      ? tradesWithAccountingPL.reduce((sum, t) => sum + (t.allocation || 0), 0) / totalTrades 
      : 0;
    
    // Average holding days - always use FIFO logic regardless of accounting method
    const avgHoldingDays = totalTrades > 0
      ? tradesWithAccountingPL.reduce((sum, trade) => {
          // Use existing FIFO-based calcHoldingDays function
          const pyramidDates = [
            { date: trade.pyramid1Date, qty: trade.pyramid1Qty || 0 },
            { date: trade.pyramid2Date, qty: trade.pyramid2Qty || 0 }
          ].filter(p => p.date && p.date.trim() !== '' && p.qty > 0);

          const exitDates = [
            { date: trade.exit1Date, qty: trade.exit1Qty || 0 },
            { date: trade.exit2Date, qty: trade.exit2Qty || 0 },
            { date: trade.exit3Date, qty: trade.exit3Qty || 0 }
          ].filter(e => e.date && e.date.trim() !== '' && e.qty > 0);

          // Find primary exit date for closed trades
          let primaryExitDate: string | null = null;
          if (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial') {
            const validExitDates = [trade.exit1Date, trade.exit2Date, trade.exit3Date]
              .filter(Boolean) as string[];
            if (validExitDates.length > 0) {
              primaryExitDate = validExitDates.sort((a, b) =>
                new Date(a).getTime() - new Date(b).getTime()
              )[0];
            }
          }

          const fifoHoldingDays = calcHoldingDays(
            trade.date,
            primaryExitDate,
            pyramidDates,
            exitDates
          );

          return sum + fifoHoldingDays;
        }, 0) / totalTrades
      : 0;

    // Risk-reward calculations
    const avgR = totalTrades > 0 
      ? tradesWithAccountingPL.reduce((sum, trade) => {
          const r = trade.r || 0;
          return sum + r;
        }, 0) / totalTrades 
      : 0;

    // Plan adherence
    const planFollowed = totalTrades > 0 
      ? (tradesWithAccountingPL.filter(t => t.planFollowed).length / totalTrades) * 100 
      : 0;

    // Open positions - use positionStatus instead of exitDate
    const openPositions = tradesWithAccountingPL.filter(t =>
      t.positionStatus === 'Open' || t.positionStatus === 'Partial'
    ).length;

    return {
      tradesWithAccountingPL,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      grossPL,
      avgGain,
      avgLoss,
      avgPosMove,
      avgNegMove,
      avgPositionSize,
      avgHoldingDays,
      avgR,
      planFollowed,
      openPositions,
      useCashBasis,
      accountingMethod
    };
  }, [trades, calculateAccountingPL, useCashBasis, accountingMethod]);

  return calculations;
};

/**
 * Hook for getting accounting method display information
 */
export const useAccountingMethodDisplay = () => {
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';

  return {
    accountingMethod,
    useCashBasis,
    displayName: useCashBasis ? 'Cash Basis' : 'Accrual Basis',
    description: useCashBasis 
      ? 'P/L attributed to exit dates' 
      : 'P/L attributed to entry dates',
    shortDescription: useCashBasis ? 'Exit-based' : 'Entry-based'
  };
};
