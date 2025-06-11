import { useMemo } from 'react';
import { useTruePortfolio } from '../utils/TruePortfolioContext';

/**
 * Hook that provides true portfolio functionality with trades integration
 * This hook should be used by components that need portfolio size calculations
 */
export const useTruePortfolioWithTrades = (trades: any[] = []) => {
  const truePortfolioContext = useTruePortfolio();

  // Memoize functions that depend on trades
  const getTruePortfolioSize = useMemo(() => {
    return (month: string, year: number) => {
      return truePortfolioContext.getTruePortfolioSize(month, year, trades);
    };
  }, [truePortfolioContext.getTruePortfolioSize, trades]);

  const getLatestTruePortfolioSize = useMemo(() => {
    return () => {
      return truePortfolioContext.getLatestTruePortfolioSize(trades);
    };
  }, [truePortfolioContext.getLatestTruePortfolioSize, trades]);

  const getMonthlyTruePortfolio = useMemo(() => {
    return (month: string, year: number) => {
      return truePortfolioContext.getMonthlyTruePortfolio(month, year, trades);
    };
  }, [truePortfolioContext.getMonthlyTruePortfolio, trades]);

  const getAllMonthlyTruePortfolios = useMemo(() => {
    return () => {
      return truePortfolioContext.getAllMonthlyTruePortfolios(trades);
    };
  }, [truePortfolioContext.getAllMonthlyTruePortfolios, trades]);

  // Current portfolio size for backward compatibility
  const portfolioSize = useMemo(() => {
    return getLatestTruePortfolioSize();
  }, [getLatestTruePortfolioSize]);

  return {
    // Core functions with trades integration
    getTruePortfolioSize,
    getLatestTruePortfolioSize,
    getMonthlyTruePortfolio,
    getAllMonthlyTruePortfolios,
    
    // Backward compatibility
    portfolioSize,
    getPortfolioSize: getTruePortfolioSize, // Alias for backward compatibility
    
    // Pass through other functions that don't need trades
    yearlyStartingCapitals: truePortfolioContext.yearlyStartingCapitals,
    setYearlyStartingCapital: truePortfolioContext.setYearlyStartingCapital,
    getYearlyStartingCapital: truePortfolioContext.getYearlyStartingCapital,
    monthlyStartingCapitalOverrides: truePortfolioContext.monthlyStartingCapitalOverrides,
    setMonthlyStartingCapitalOverride: truePortfolioContext.setMonthlyStartingCapitalOverride,
    removeMonthlyStartingCapitalOverride: truePortfolioContext.removeMonthlyStartingCapitalOverride,
    getMonthlyStartingCapitalOverride: truePortfolioContext.getMonthlyStartingCapitalOverride,
    capitalChanges: truePortfolioContext.capitalChanges,
    addCapitalChange: truePortfolioContext.addCapitalChange,
    updateCapitalChange: truePortfolioContext.updateCapitalChange,
    deleteCapitalChange: truePortfolioContext.deleteCapitalChange,
  };
};
