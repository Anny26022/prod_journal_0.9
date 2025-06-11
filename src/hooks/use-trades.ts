import React from "react";
import { Trade } from "../types/trade";
import { mockTrades } from "../data/mock-trades";
import { useTruePortfolioWithTrades } from "./use-true-portfolio-with-trades";
import { useGlobalFilter } from "../context/GlobalFilterContext";
import { isInGlobalFilter } from "../utils/dateFilterUtils";
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
    return stored ? JSON.parse(stored) : []; // Return empty array if no data or parsing error
  } catch (error) {
    console.error('Error loading trades from localStorage:', error);
    return []; // Always return empty array on error to prevent mock data
  }
}

function saveTradesToLocalStorage(trades: Trade[]) {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    return true;
  } catch (error) {
    console.error('localStorage save error:', error);
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
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TRADE_SETTINGS_KEY);
    // Clear all misc_ data as well
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(MISC_DATA_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
    // Clear TruePortfolioContext related localStorage keys
    localStorage.removeItem('yearlyStartingCapitals');
    localStorage.removeItem('capitalChanges');
    localStorage.removeItem('monthlyStartingCapitalOverrides');
    localStorage.removeItem('globalFilter'); // Also clear global filter
    localStorage.removeItem('heroui-theme'); // Clear theme settings if applicable
    localStorage.removeItem('userPreferences'); // Clear user preferences if applicable

    return true;
  } catch (error) {
    console.error('Error clearing all trade and settings data from localStorage:', error);
    return false;
  }
}

// Utility to recalculate all calculated fields for all trades
// This function is now a pure function and takes getTruePortfolioSize as an explicit argument.
function recalculateAllTrades(trades: Trade[], getTruePortfolioSize: (month: string, year: number) => number): Trade[] {
  // Sort trades by date (or tradeNo as fallback) for cummPf calculation
  const sorted = [...trades].sort((a, b) => {
    if (a.date && b.date) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    return (a.tradeNo || '').localeCompare(b.tradeNo || '');
  });

  let runningCummPf = 0;
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
    
    // Get the true portfolio size for the trade's month/year
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
    
    const pfImpact = calcPFImpact(plRs, tradePortfolioSize);
    
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
  return calculatedTrades.map((trade, idx) => {
    if (idx === 0) runningCummPf = 0; // Reset for each fresh calculation run
    runningCummPf += trade.pfImpact;
    return {
      ...trade,
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

export const useTrades = () => {
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [sortDescriptor, setSortDescriptor] = React.useState<SortDescriptor>({ column: 'tradeNo', direction: 'ascending' });
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(ALL_COLUMNS);
  const { filter: globalFilter } = useGlobalFilter();

  // Get true portfolio functions - this will be updated whenever 'trades' changes
  const { portfolioSize, getPortfolioSize } = useTruePortfolioWithTrades(trades);

  // Memoize the recalculation helper that wraps the pure `recalculateAllTrades` function.
  // This helper will only re-create if `getPortfolioSize` (a stable callback from useTruePortfolioWithTrades) changes.
  const recalculateTradesWithCurrentPortfolio = React.useCallback((tradesToRecalculate: Trade[]) => {
    return recalculateAllTrades(tradesToRecalculate, getPortfolioSize);
  }, [getPortfolioSize]);

  // Load from localStorage on mount. This effect should run only ONCE.
  React.useEffect(() => {
    setIsLoading(true);
    const loadedTrades = getTradesFromLocalStorage();
    const settings = getTradeSettings();

    // Perform initial recalculation using the memoized helper.
    // This will use the initial `getPortfolioSize` available at mount.
    const initiallyCalculatedTrades = loadedTrades.length > 0 ? recalculateTradesWithCurrentPortfolio(loadedTrades) : [];
    setTrades(initiallyCalculatedTrades);

    setSearchQuery(settings?.search_query || '');
    setStatusFilter(settings?.status_filter || '');
    setSortDescriptor(settings?.sort_descriptor || { column: 'tradeNo', direction: 'ascending' });
    setVisibleColumns(settings?.visible_columns || ALL_COLUMNS);
    setIsLoading(false);
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

  // Save trades to localStorage whenever they change
  React.useEffect(() => {
    if (trades.length > 0 || !isLoading) { // Only save if trades exist or if we're not loading (i.e. empty state after clear)
      saveTradesToLocalStorage(trades);
    }
  }, [trades, isLoading]);

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

  const clearAllTrades = React.useCallback(() => {
    if (clearAllTradeAndSettingsData()) {
      setTrades([]);
      setSearchQuery('');
      setStatusFilter('');
      setSortDescriptor({ column: 'tradeNo', direction: 'ascending' });
      setVisibleColumns(ALL_COLUMNS);
    }
  }, []);

  const filteredTrades = React.useMemo(() => {
    let result = [...trades];
    
    // Apply global filter
    result = result.filter(trade => isInGlobalFilter(trade.date, globalFilter));
    
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
        
        return sortDescriptor.direction === "ascending" ? comparison : -comparison;
      });
    }
    
    return result;
  }, [trades, globalFilter, searchQuery, statusFilter, sortDescriptor]);

  return {
    trades: filteredTrades,
    addTrade,
    updateTrade,
    deleteTrade,
    isLoading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortDescriptor,
    setSortDescriptor,
    visibleColumns,
    setVisibleColumns,
    clearAllTrades
  };
};
