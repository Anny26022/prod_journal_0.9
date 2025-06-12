import { useMemo, useCallback } from 'react';
import { Trade } from '../types/trade';
import { useAccountingMethod } from '../context/AccountingMethodContext';
import { calculateTradePL } from '../utils/accountingUtils';

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
    
    const avgHoldingDays = totalTrades > 0 
      ? tradesWithAccountingPL.reduce((sum, trade) => {
          if (!trade.entryDate || !trade.exitDate) return sum;
          const entryDate = new Date(trade.entryDate);
          const exitDate = new Date(trade.exitDate);
          const holdingDays = Math.abs((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
          return sum + holdingDays;
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

    // Open positions
    const openPositions = tradesWithAccountingPL.filter(t => !t.exitDate).length;

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
