import React from "react";
import { Trade } from "../types/trade";
import { mockTrades } from "../data/mock-trades";
import { useTruePortfolioWithTrades } from "./use-true-portfolio-with-trades";
import { useGlobalFilter } from "../context/GlobalFilterContext";
import { isInGlobalFilter } from "../utils/dateFilterUtils";
import { useAccountingMethod } from "../context/AccountingMethodContext";
import { getTradeDateForAccounting } from "../utils/accountingUtils";
import {
  calcAvgEntry,
  calcPositionSize,
  calcAllocation,
  calcSLPercent,
  calcOpenQty,
  calcExitedQty,
  calcAvgExitPrice,
  calcStockMove,
  calcRewardRisk,
  calcHoldingDays,
  calcRealisedAmount,
  calcPFImpact,
  calcRealizedPL_FIFO
} from "../utils/tradeCalculations";
import { calculateTradePL } from "../utils/accountingUtils";
// Removed Supabase import - using localStorage only

// Define SortDirection type compatible with HeroUI Table
type SortDirection = "ascending" | "descending";

export interface SortDescriptor {
  column: string;
  direction: SortDirection;
}

// Key for localStorage - Standardized to 'trades_data'
const STORAGE_KEY = 'trades_data';
const TRADE_SETTINGS_KEY = 'tradeSettings';
const MISC_DATA_PREFIX = 'misc_';

// localStorage helpers
function getTradesFromLocalStorage(): Trade[] {
  if (typeof window === 'undefined') return []; // In a server-side environment, return empty array

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate the parsed data
      if (Array.isArray(parsed)) {
        return parsed;
      } else {
        throw new Error('Invalid data format: not an array');
      }
    }
    return [];
  } catch (error) {
    console.error('Error loading trades from localStorage:', error);

    // Try to recover from backup
    try {
      const backup = localStorage.getItem(`${STORAGE_KEY}_backup`);
      if (backup) {
        const parsedBackup = JSON.parse(backup);
        if (Array.isArray(parsedBackup)) {
          console.log('Recovered trades from backup');
          // Restore the main storage from backup
          localStorage.setItem(STORAGE_KEY, backup);
          return parsedBackup;
        }
      }
    } catch (backupError) {
      console.error('Failed to recover from backup:', backupError);
    }

    return []; // Always return empty array on error to prevent mock data
  }
}

function saveTradesToLocalStorage(trades: Trade[]) {
  if (typeof window === 'undefined') return false;

  try {
    // Create backup before saving
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      localStorage.setItem(`${STORAGE_KEY}_backup`, existing);
    }

    const serialized = JSON.stringify(trades);
    localStorage.setItem(STORAGE_KEY, serialized);

    // Verify the save was successful
    const verification = localStorage.getItem(STORAGE_KEY);
    if (verification !== serialized) {
      throw new Error('localStorage verification failed');
    }

    return true;
  } catch (error) {
    console.error('localStorage save error:', error);

    // Try to restore from backup if save failed
    try {
      const backup = localStorage.getItem(`${STORAGE_KEY}_backup`);
      if (backup) {
        localStorage.setItem(STORAGE_KEY, backup);
        console.log('Restored trades from backup');
      }
    } catch (restoreError) {
      console.error('Failed to restore from backup:', restoreError);
    }

    return false;
  }
}

function getTradeSettings() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(TRADE_SETTINGS_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error fetching trade settings:', error);
    return null;
  }
}

function saveTradeSettings(settings: any) {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(TRADE_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('localStorage save error for settings:', error);
    return false;
  }
}

function clearAllTradeAndSettingsData() {
  if (typeof window === 'undefined') return false;
  try {
    console.log('🗑️ Starting comprehensive localStorage clearing...');

    // Core trade data
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TRADE_SETTINGS_KEY);

    // Clear all misc_ data
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        keysToRemove.push(key);
      }
    }

    // Remove keys that match our patterns
    keysToRemove.forEach(key => {
      if (key.startsWith(MISC_DATA_PREFIX) ||
          key.startsWith('tradeBackup_') ||
          key.startsWith('tradeModal_') ||
          key === 'yearlyStartingCapitals' ||
          key === 'capitalChanges' ||
          key === 'monthlyStartingCapitalOverrides' ||
          key === 'globalFilter' ||
          key === 'heroui-theme' ||
          key === 'userPreferences' ||
          key === 'accountingMethod' ||
          key === 'dashboardConfig' ||
          key === 'milestones' ||
          key === 'achievements' ||
          key.includes('trade') ||
          key.includes('portfolio') ||
          key.includes('settings') ||
          key.includes('config')) {
        try {
          localStorage.removeItem(key);
          console.log(`🗑️ Removed localStorage key: ${key}`);
        } catch (error) {
          console.error(`❌ Failed to remove key ${key}:`, error);
        }
      }
    });

    // Clear sessionStorage as well
    try {
      sessionStorage.clear();
      console.log('🗑️ Cleared all sessionStorage');
    } catch (error) {
      console.error('❌ Failed to clear sessionStorage:', error);
    }

    console.log('✅ Comprehensive localStorage clearing completed');
    return true;
  } catch (error) {
    console.error('💥 Error clearing all trade and settings data from localStorage:', error);
    return false;
  }
}

// Utility to recalculate all calculated fields for all trades
// This function is now a pure function and takes getTruePortfolioSize and accounting method as explicit arguments.
// Added skipExpensiveCalculations flag to optimize bulk imports
function recalculateAllTrades(
  trades: Trade[],
  getTruePortfolioSize: (month: string, year: number) => number,
  useCashBasis: boolean = false,
  skipExpensiveCalculations: boolean = false
): Trade[] {
  // Sort trades by date (or tradeNo as fallback) for cummPf calculation
  const sorted = [...trades].sort((a, b) => {
    if (a.date && b.date) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    return (a.tradeNo || '').localeCompare(b.tradeNo || '');
  });

  let runningCummPf = 0;

  // If skipping expensive calculations, return trades with minimal processing
  if (skipExpensiveCalculations) {
    console.log(`⚡ Skipping expensive calculations for ${trades.length} trades during bulk import`);
    return sorted.map(trade => ({
      ...trade,
      name: (trade.name || '').toUpperCase(),
      // Keep existing calculated values or set minimal defaults
      avgEntry: trade.avgEntry || trade.entry || 0,
      positionSize: trade.positionSize || 0,
      allocation: trade.allocation || 0,
      slPercent: trade.slPercent || 0,
      openQty: trade.openQty || trade.initialQty || 0,
      exitedQty: trade.exitedQty || 0,
      avgExitPrice: trade.avgExitPrice || 0,
      stockMove: trade.stockMove || 0,
      holdingDays: trade.holdingDays || 0,
      realisedAmount: trade.realisedAmount || 0,
      plRs: trade.plRs || 0,
      pfImpact: trade.pfImpact || 0,
      cummPf: trade.cummPf || 0,
      // Mark as needing recalculation
      _needsRecalculation: true
    }));
  }

  // First pass for individual trade calculations
  const calculatedTrades = sorted.map((trade) => {
    // Original entry and pyramid entries for calculations
    const allEntries = [
      { price: Number(trade.entry || 0), qty: Number(trade.initialQty || 0) },
      { price: Number(trade.pyramid1Price || 0), qty: Number(trade.pyramid1Qty || 0) },
      { price: Number(trade.pyramid2Price || 0), qty: Number(trade.pyramid2Qty || 0) }
    ].filter(e => e.qty > 0 && e.price > 0); // Filter out entries with 0 qty or price

    const avgEntry = calcAvgEntry(allEntries);
    const totalInitialQty = allEntries.reduce((sum, e) => sum + e.qty, 0);
    const positionSize = calcPositionSize(avgEntry, totalInitialQty);

    // Get the true portfolio size for the trade's entry date (for allocation calculation)
    let tradePortfolioSize = 100000; // Default fallback
    if (trade.date && getTruePortfolioSize) { // Use the passed getTruePortfolioSize
      const tradeDate = new Date(trade.date);
      const month = tradeDate.toLocaleString('default', { month: 'short' });
      const year = tradeDate.getFullYear();
      try {
        tradePortfolioSize = getTruePortfolioSize(month, year) || 100000;
      } catch (error) {
        tradePortfolioSize = 100000; // Fallback
      }
    }

    const allocation = calcAllocation(positionSize, tradePortfolioSize);
    const slPercent = calcSLPercent(trade.sl, trade.entry);

    // Exit legs
    const allExits = [
      { price: Number(trade.exit1Price || 0), qty: Number(trade.exit1Qty || 0) },
      { price: Number(trade.exit2Price || 0), qty: Number(trade.exit2Qty || 0) },
      { price: Number(trade.exit3Price || 0), qty: Number(trade.exit3Qty || 0) }
    ].filter(e => e.qty > 0 && e.price > 0); // Filter out exits with 0 qty or price

    const exitedQty = allExits.reduce((sum, e) => sum + e.qty, 0);
    const openQty = totalInitialQty - exitedQty;
    const avgExitPrice = calcAvgExitPrice(allExits); // Avg price of actual exits

    const stockMove = calcStockMove(
      avgEntry,
      avgExitPrice,
      trade.cmp,
      openQty,
      exitedQty,
      trade.positionStatus,
      trade.buySell
    );
    
    const rewardRisk = calcRewardRisk(
      trade.cmp || avgExitPrice || trade.entry,
      trade.entry,
      trade.sl,
      trade.positionStatus,
      avgExitPrice,
      openQty,
      exitedQty,
      trade.buySell
    );

    const pyramidDates = [];
    if (trade.pyramid1Date && trade.pyramid1Qty) pyramidDates.push({ date: trade.pyramid1Date, qty: trade.pyramid1Qty });
    if (trade.pyramid2Date && trade.pyramid2Qty) pyramidDates.push({ date: trade.pyramid2Date, qty: trade.pyramid2Qty });
    
    const exitDatesForHolding = [];
    if (trade.exit1Date && trade.exit1Qty) exitDatesForHolding.push({ date: trade.exit1Date, qty: trade.exit1Qty });
    if (trade.exit2Date && trade.exit2Qty) exitDatesForHolding.push({ date: trade.exit2Date, qty: trade.exit2Qty });
    if (trade.exit3Date && trade.exit3Qty) exitDatesForHolding.push({ date: trade.exit3Date, qty: trade.exit3Qty });
    
    let primaryExitDateForHolding: string | null = null;
    if (allExits.length > 0) {
        const validExitDates = [trade.exit1Date, trade.exit2Date, trade.exit3Date].filter(Boolean) as string[];
        if (validExitDates.length > 0) {
            primaryExitDateForHolding = validExitDates.sort((a,b) => new Date(a).getTime() - new Date(b).getTime())[0];
        }
    }
    if (trade.positionStatus !== "Open" && !primaryExitDateForHolding && allExits.length > 0) {
        primaryExitDateForHolding = trade.date;
    }

    const holdingDays = calcHoldingDays(
        trade.date, 
        primaryExitDateForHolding, 
        pyramidDates, 
        exitDatesForHolding
    );

    const realisedAmount = calcRealisedAmount(exitedQty, avgExitPrice);

    const entryLotsForFifo = allEntries.map(e => ({ price: e.price, qty: e.qty }));
    const exitLotsForFifo = allExits.map(e => ({ price: e.price, qty: e.qty }));

    const plRs = exitedQty > 0 ? calcRealizedPL_FIFO(entryLotsForFifo, exitLotsForFifo, trade.buySell as 'Buy' | 'Sell') : 0;

    // Calculate accounting-aware P/L and PF Impact using correct portfolio size
    const accountingAwarePL = calculateTradePL({...trade, plRs}, useCashBasis);
    const accountingAwarePortfolioSize = getTruePortfolioSize ?
      (() => {
        try {
          const relevantDate = getTradeDateForAccounting(trade, useCashBasis);
          const date = new Date(relevantDate);
          const month = date.toLocaleString('default', { month: 'short' });
          const year = date.getFullYear();
          return getTruePortfolioSize(month, year) || 100000;
        } catch {
          return 100000;
        }
      })() : 100000;
    const pfImpact = calcPFImpact(accountingAwarePL, accountingAwarePortfolioSize);
    
    const finalOpenQty = Math.max(0, openQty);

    // Destructure to omit openHeat if it exists on the trade object from localStorage
    const { openHeat, ...restOfTrade } = trade as any; // Use 'as any' for robust destructuring if openHeat might not exist

    return {
      ...restOfTrade,
      name: (restOfTrade.name || '').toUpperCase(),
      avgEntry,
      positionSize,
      allocation,
      slPercent,
      openQty: finalOpenQty,
      exitedQty,
      avgExitPrice,
      stockMove,
      holdingDays,
      realisedAmount,
      plRs,
      pfImpact,
      cummPf: 0, // Placeholder, will be updated in second pass
    };
  });

  // Second pass for cumulative calculations like cummPf
  // Note: We'll calculate accounting-aware values at display time to improve performance
  return calculatedTrades.map((trade, idx) => {
    if (idx === 0) runningCummPf = 0; // Reset for each fresh calculation run

    // For cumulative PF, we still need to calculate based on accounting method
    // but we'll store both accrual and cash basis values to avoid recalculation
    const accrualPL = trade.plRs || 0;
    const cashPL = calculateTradePL(trade, true); // Cash basis P/L

    // Helper function to get portfolio size based on accounting method
    const getPortfolioSizeForAccounting = (useCashBasisForCalc: boolean) => {
      if (!getTruePortfolioSize) return 100000;

      try {
        const relevantDate = getTradeDateForAccounting(trade, useCashBasisForCalc);
        const date = new Date(relevantDate);
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        return getTruePortfolioSize(month, year) || 100000;
      } catch {
        return 100000;
      }
    };

    // Get portfolio sizes for both accounting methods
    const accrualPortfolioSize = getPortfolioSizeForAccounting(false); // Entry date portfolio
    const cashPortfolioSize = getPortfolioSizeForAccounting(true);     // Exit date portfolio

    // Calculate PF impact using correct portfolio size for each method
    const accrualPfImpact = trade.positionStatus !== 'Open' ?
      calcPFImpact(accrualPL, accrualPortfolioSize) : 0;
    const cashPfImpact = trade.positionStatus !== 'Open' ?
      calcPFImpact(cashPL, cashPortfolioSize) : 0;

    // Use the appropriate method for cumulative calculation
    const currentPfImpact = useCashBasis ? cashPfImpact : accrualPfImpact;
    runningCummPf += currentPfImpact;

    // Store both values to avoid recalculation at display time
    return {
      ...trade,
      // Store both accounting method values
      _accrualPL: accrualPL,
      _cashPL: cashPL,
      _accrualPfImpact: accrualPfImpact,
      _cashPfImpact: cashPfImpact,
      cummPf: runningCummPf,
    };
  });
}

// Define ALL_COLUMNS here, as it's closely tied to the hook's state
const ALL_COLUMNS = [
  'tradeNo', 'date', 'name', 'setup', 'buySell', 'entry', 'sl', 'slPercent', 'tsl', 'cmp',
  'initialQty', 'pyramid1Price', 'pyramid1Qty', 'pyramid1Date', 'pyramid2Price', 'pyramid2Qty', 'pyramid2Date',
  'positionSize', 'allocation', 'exit1Price', 'exit1Qty', 'exit1Date', 'exit2Price', 'exit2Qty', 'exit2Date',
  'exit3Price', 'exit3Qty', 'exit3Date', 'openQty', 'exitedQty', 'avgExitPrice', 'stockMove', 'openHeat',
  'rewardRisk', 'holdingDays', 'positionStatus', 'realisedAmount', 'plRs', 'pfImpact', 'cummPf',
  'planFollowed', 'exitTrigger', 'proficiencyGrowthAreas', 'unrealizedPL', 'actions', 'notes'
];

// Optimized default columns for better performance - show only essential columns initially
const DEFAULT_VISIBLE_COLUMNS = [
  'tradeNo', 'date', 'name', 'setup', 'buySell', 'entry', 'sl', 'cmp',
  'initialQty', 'positionSize', 'openQty', 'exitedQty', 'avgExitPrice',
  'rewardRisk', 'holdingDays', 'positionStatus', 'plRs', 'actions'
];

export const useTrades = () => {
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRecalculating, setIsRecalculating] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [sortDescriptor, setSortDescriptor] = React.useState<SortDescriptor>({ column: 'tradeNo', direction: 'ascending' });
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(DEFAULT_VISIBLE_COLUMNS);
  const { filter: globalFilter } = useGlobalFilter();
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';

  // Track previous accounting method to avoid unnecessary recalculations
  const prevAccountingMethodRef = React.useRef<string>(accountingMethod);

  // Get true portfolio functions - use empty array to avoid circular dependency
  const { portfolioSize, getPortfolioSize } = useTruePortfolioWithTrades([]);

  // Memoize the recalculation helper that wraps the pure `recalculateAllTrades` function.
  // Use a stable reference to getPortfolioSize to prevent infinite loops
  const stableGetPortfolioSize = React.useCallback((month: string, year: number) => {
    return getPortfolioSize(month, year);
  }, [getPortfolioSize]);

  const recalculateTradesWithCurrentPortfolio = React.useCallback((tradesToRecalculate: Trade[], skipExpensiveCalculations: boolean = false) => {
    return recalculateAllTrades(tradesToRecalculate, stableGetPortfolioSize, useCashBasis, skipExpensiveCalculations);
  }, [stableGetPortfolioSize, useCashBasis]);

  // Memory usage monitor
  React.useEffect(() => {
    const checkMemoryUsage = () => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const usedMB = memInfo.usedJSHeapSize / 1024 / 1024;
        const limitMB = memInfo.jsHeapSizeLimit / 1024 / 1024;

        if (usedMB > limitMB * 0.8) { // If using more than 80% of available memory
          console.warn(`⚠️ High memory usage detected: ${usedMB.toFixed(2)}MB / ${limitMB.toFixed(2)}MB`);

          // Force garbage collection if available
          if (window.gc) {
            try {
              window.gc();
              console.log('🗑️ Forced garbage collection due to high memory usage');
            } catch (error) {
              console.log('⚠️ Garbage collection not available');
            }
          }
        }
      }
    };

    const interval = setInterval(checkMemoryUsage, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Load from localStorage on mount. This effect should run only ONCE.
  React.useEffect(() => {
    setIsLoading(true);
    const loadedTrades = getTradesFromLocalStorage();
    const settings = getTradeSettings();

    // Perform initial recalculation using the memoized helper.
    // This will use the initial `getPortfolioSize` available at mount.
    const initiallyCalculatedTrades = loadedTrades.length > 0 ? recalculateTradesWithCurrentPortfolio(loadedTrades) : [];

    // Temporary fix: Reset filters to avoid "No matching trades" issue
    const savedSearchQuery = settings?.search_query || '';
    const savedStatusFilter = settings?.status_filter || '';



    // Set all state together to avoid race conditions
    setTrades(initiallyCalculatedTrades);
    setSearchQuery(savedSearchQuery);
    setStatusFilter(savedStatusFilter);
    setSortDescriptor(settings?.sort_descriptor || { column: 'tradeNo', direction: 'ascending' });
    setVisibleColumns(settings?.visible_columns || DEFAULT_VISIBLE_COLUMNS);

    // Use a small delay to ensure all state is set before marking as loaded
    setTimeout(() => {
      setIsLoading(false);
    }, 50);
  }, []); // Empty dependency array means it runs only once on mount.

  // Save trade settings to localStorage
  React.useEffect(() => {
    if (!isLoading) {
      const settings = {
        search_query: searchQuery,
        status_filter: statusFilter,
        sort_descriptor: sortDescriptor,
        visible_columns: visibleColumns
      };
      saveTradeSettings(settings);
    }
  }, [searchQuery, statusFilter, sortDescriptor, visibleColumns, isLoading]);

  // Debounced save to localStorage to prevent excessive writes
  React.useEffect(() => {
    if (trades.length > 0 || !isLoading) {
      const timeoutId = setTimeout(() => {
        saveTradesToLocalStorage(trades);
      }, 100); // Reduced to 100ms for better responsiveness

      return () => clearTimeout(timeoutId);
    }
  }, [trades, isLoading]);

  // Recalculate trades when accounting method changes (optimized to prevent excessive re-renders)
  React.useEffect(() => {
    // Only recalculate if accounting method actually changed
    if (prevAccountingMethodRef.current !== accountingMethod && !isLoading && trades.length > 0) {
      console.log(`🔄 Accounting method changed from ${prevAccountingMethodRef.current} to ${accountingMethod}, recalculating trades...`);

      // Debounce the recalculation to prevent rapid successive calls
      const timeoutId = setTimeout(() => {
        // Use the pure function directly to avoid circular dependency
        const recalculatedTrades = recalculateAllTrades(trades, stableGetPortfolioSize, useCashBasis, false);
        setTrades(recalculatedTrades);
      }, 100); // Small delay to batch any rapid changes

      // Update the ref to track the new accounting method
      prevAccountingMethodRef.current = accountingMethod;

      return () => clearTimeout(timeoutId);
    }
  }, [accountingMethod]); // Only depend on accounting method to avoid circular dependencies

  const addTrade = React.useCallback((trade: Trade) => {
    setTrades(prev => {
      // Use the memoized recalculation helper
      const newTrades = recalculateTradesWithCurrentPortfolio([trade, ...prev]);
      saveTradesToLocalStorage(newTrades); // Persist to localStorage
      return newTrades;
    });
  }, [recalculateTradesWithCurrentPortfolio]); // Dependency on the memoized helper

  const updateTrade = React.useCallback((updatedTrade: Trade) => {
    setTrades(prev => {
      // Use the memoized recalculation helper
      const newTrades = recalculateTradesWithCurrentPortfolio(
        prev.map(trade => trade.id === updatedTrade.id ? updatedTrade : trade)
      );
      saveTradesToLocalStorage(newTrades); // Persist to localStorage
      return newTrades;
    });
  }, [recalculateTradesWithCurrentPortfolio]);

  const deleteTrade = React.useCallback((id: string) => {
    setTrades(prev => {
      // Use the memoized recalculation helper
      const newTrades = recalculateTradesWithCurrentPortfolio(
        prev.filter(trade => trade.id !== id)
      );
      saveTradesToLocalStorage(newTrades); // Persist to localStorage
      return newTrades;
    });
  }, [recalculateTradesWithCurrentPortfolio]);

  // Bulk import function for better performance with optimized calculations
  const bulkImportTrades = React.useCallback((importedTrades: Trade[]) => {
    console.log(`🚀 Starting optimized bulk import of ${importedTrades.length} trades...`);
    const startTime = performance.now();

    setTrades(prev => {
      // Combine existing trades with imported trades
      const combinedTrades = [...importedTrades, ...prev];

      // First pass: Skip expensive calculations for faster import
      const quickProcessedTrades = recalculateTradesWithCurrentPortfolio(combinedTrades, true);
      saveTradesToLocalStorage(quickProcessedTrades); // Single localStorage write

      const endTime = performance.now();
      console.log(`⚡ Fast bulk import completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`🔄 Scheduling full recalculation in background...`);

      // Schedule full recalculation in the background after a short delay
      setTimeout(() => {
        const recalcStartTime = performance.now();
        console.log(`🧮 Starting full recalculation of ${quickProcessedTrades.length} trades...`);
        setIsRecalculating(true);

        setTrades(currentTrades => {
          const fullyCalculatedTrades = recalculateTradesWithCurrentPortfolio(currentTrades, false);
          saveTradesToLocalStorage(fullyCalculatedTrades);

          const recalcEndTime = performance.now();
          console.log(`✅ Full recalculation completed in ${(recalcEndTime - recalcStartTime).toFixed(2)}ms`);
          console.log(`📊 Total import + recalculation time: ${(recalcEndTime - startTime).toFixed(2)}ms`);

          setIsRecalculating(false);
          return fullyCalculatedTrades;
        });
      }, 100); // Small delay to allow UI to update

      return quickProcessedTrades;
    });
  }, [recalculateTradesWithCurrentPortfolio]);

  const clearAllTrades = React.useCallback(() => {
    console.log('🗑️ Starting clearAllTrades process...');

    if (clearAllTradeAndSettingsData()) {
      // Reset all React state to initial values
      setTrades([]);
      setSearchQuery('');
      setStatusFilter('');
      setSortDescriptor({ column: 'tradeNo', direction: 'ascending' });
      setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
      setIsLoading(false);

      // Force garbage collection if available (Chrome DevTools)
      if (window.gc) {
        try {
          window.gc();
          console.log('🗑️ Forced garbage collection');
        } catch (error) {
          console.log('⚠️ Garbage collection not available');
        }
      }

      // Clear any cached data in memory
      if (typeof window !== 'undefined') {
        // Clear any global variables that might hold trade data
        (window as any).tradeCache = undefined;
        (window as any).portfolioCache = undefined;
        (window as any).settingsCache = undefined;
      }

      console.log('✅ All trades and state cleared successfully');
      return true;
    }

    console.error('❌ Failed to clear trade data');
    return false;
  }, []);

  // Helper function to get accounting-aware values for display (optimized with caching)
  const getAccountingAwareValues = React.useCallback((trade: Trade) => {
    const isAccrual = !useCashBasis;

    // Use cached values when available to avoid recalculation
    const plRs = isAccrual
      ? (trade._accrualPL ?? trade.plRs ?? 0)
      : (trade._cashPL ?? calculateTradePL(trade, true));

    const pfImpact = isAccrual
      ? (trade._accrualPfImpact ?? trade.pfImpact ?? 0)
      : (trade._cashPfImpact ?? 0);

    return {
      plRs,
      realisedAmount: plRs, // Same as plRs for display purposes
      pfImpact,
    };
  }, [useCashBasis]);

  const filteredTrades = React.useMemo(() => {
    let result = [...trades];

    // For cash basis, we need to handle trade filtering differently
    // Instead of filtering trades, we need to expand trades with multiple exits
    if (useCashBasis) {
      // Expand trades with multiple exits into separate entries for cash basis
      const expandedTrades: Trade[] = [];

      result.forEach(trade => {
        if (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial') {
          // Get all exits for this trade
          const exits = [
            { date: trade.exit1Date, qty: trade.exit1Qty || 0, price: trade.exit1Price || 0 },
            { date: trade.exit2Date, qty: trade.exit2Qty || 0, price: trade.exit2Price || 0 },
            { date: trade.exit3Date, qty: trade.exit3Qty || 0, price: trade.exit3Price || 0 }
          ].filter(exit => exit.date && exit.date.trim() !== '' && exit.qty > 0);

          if (exits.length > 0) {
            // Create a trade entry for each exit (for cash basis)
            exits.forEach((exit, exitIndex) => {
              const expandedTrade: Trade = {
                ...trade,
                id: `${trade.id}_exit_${exitIndex}`, // Generate unique ID for each exit
                _cashBasisExit: {
                  date: exit.date,
                  qty: exit.qty,
                  price: exit.price
                }
              };
              expandedTrades.push(expandedTrade);
            });
          } else {
            // Debug: Log trades with no exit data
            if (process.env.NODE_ENV === 'development' && (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial')) {
              console.log(`⚠️ [No Exit Data] ${trade.name}: status=${trade.positionStatus}, exit1Date=${trade.exit1Date}, exit1Qty=${trade.exit1Qty}, plRs=${trade.plRs}`);
            }
            // Fallback: if no individual exit data, use the original trade
            expandedTrades.push(trade);
          }
        } else {
          // For open positions, include as-is
          expandedTrades.push(trade);
        }
      });

      result = expandedTrades;
    }

    // Apply global filter using accounting method-aware date
    result = result.filter(trade => {
      const relevantDate = getTradeDateForAccounting(trade, useCashBasis);
      return isInGlobalFilter(relevantDate, globalFilter);
    });

    // Apply search filter
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(trade =>
        trade.name.toLowerCase().includes(lowerQuery) ||
        trade.setup.toLowerCase().includes(lowerQuery) ||
        trade.tradeNo.toLowerCase().includes(lowerQuery)
      );
    }

    // Apply status filter
    if (statusFilter) {
      result = result.filter(trade => trade.positionStatus === statusFilter);
    }

    // Apply sorting
    if (sortDescriptor.column && sortDescriptor.direction) {
      result.sort((a, b) => {
        const aValue = a[sortDescriptor.column as keyof Trade];
        const bValue = b[sortDescriptor.column as keyof Trade];

        let comparison = 0;
        // Handle different data types for sorting
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          // Special handling for date strings if your date format is sortable as string
          if (sortDescriptor.column === 'date' || String(sortDescriptor.column).endsWith('Date')) {
            comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
          } else {
            comparison = aValue.localeCompare(bValue);
          }
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          comparison = (aValue === bValue) ? 0 : aValue ? -1 : 1;
        } else {
          // Fallback for other types or mixed types (treat as strings)
          const StringA = String(aValue !== null && aValue !== undefined ? aValue : "");
          const StringB = String(bValue !== null && bValue !== undefined ? bValue : "");
          comparison = StringA.localeCompare(StringB);
        }

        // For cash basis, add secondary sorting to handle expanded trades properly
        if (useCashBasis && comparison === 0) {
          // If primary sort values are equal, sort by exit date for cash basis
          const aExitDate = a._cashBasisExit?.date || a.date || '';
          const bExitDate = b._cashBasisExit?.date || b.date || '';

          if (aExitDate && bExitDate) {
            const aTime = new Date(aExitDate).getTime();
            const bTime = new Date(bExitDate).getTime();
            comparison = aTime - bTime;
          }
        }

        return sortDescriptor.direction === "ascending" ? comparison : -comparison;
      });
    }

    return result;
  }, [trades, globalFilter, searchQuery, statusFilter, sortDescriptor, useCashBasis]);

  return {
    trades: filteredTrades, // Filtered and expanded trades for display
    originalTrades: trades, // Original trades for unrealized P/L calculation
    addTrade,
    updateTrade,
    deleteTrade,
    bulkImportTrades,
    isLoading,
    isRecalculating,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortDescriptor,
    setSortDescriptor,
    visibleColumns,
    setVisibleColumns,
    clearAllTrades,
    getAccountingAwareValues // Helper for getting accounting-aware display values
  };
};
