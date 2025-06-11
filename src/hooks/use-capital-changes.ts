import React from 'react';
import { CapitalChange, MonthlyCapital, MonthlyCapitalHistory } from '../types/trade';
import { generateId } from '../utils/helpers';
import { usePortfolio } from '../utils/PortfolioContext';
// Removed Supabase import - using localStorage only

const CAPITAL_CHANGES_STORAGE_KEY = 'capital_changes';
const MONTHLY_CAPITAL_HISTORY_KEY = 'monthly_capital_history';

const loadCapitalChanges = (): CapitalChange[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const saved = localStorage.getItem(CAPITAL_CHANGES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error loading capital changes from localStorage:', error);
    return [];
  }
};

const loadMonthlyCapitalHistory = (): MonthlyCapitalHistory[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(MONTHLY_CAPITAL_HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error loading monthly capital history from localStorage:', error);
    return [];
  }
};

const saveMonthlyCapitalHistory = (history: MonthlyCapitalHistory[]) => {
  try {
    localStorage.setItem(MONTHLY_CAPITAL_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error saving monthly capital history to localStorage:', error);
  }
};

// localStorage helpers (removed Supabase functions)

function loadCapitalChanges(): CapitalChange[] {
  try {
    const stored = localStorage.getItem('capitalChanges');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading capital changes:', error);
    return [];
  }
}

function saveCapitalChanges(changes: CapitalChange[]) {
  try {
    localStorage.setItem('capitalChanges', JSON.stringify(changes));
  } catch (error) {
    console.error('localStorage save error:', error);
  }
}

function fetchMonthlyCapitalHistory(): any[] {
  try {
    const stored = localStorage.getItem('monthlyCapitalHistory');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error fetching monthly capital history:', error);
    return [];
  }
}

function saveMonthlyCapitalHistory(history: any[]) {
  try {
    localStorage.setItem('monthlyCapitalHistory', JSON.stringify(history));
  } catch (error) {
    console.error('localStorage save error:', error);
  }
}

export const useCapitalChanges = (trades: any[], initialPortfolioSize: number) => {
  const { getPortfolioSize, setPortfolioSize, monthlyPortfolioSizes } = usePortfolio();
  
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const [capitalChanges, setCapitalChanges] = React.useState<CapitalChange[]>([]);
  const [monthlyCapital, setMonthlyCapital] = React.useState<MonthlyCapital[]>([]);
  const [monthlyCapitalHistory, setMonthlyCapitalHistory] = React.useState<MonthlyCapitalHistory[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Load from localStorage on mount
  React.useEffect(() => {
    const loadedChanges = loadCapitalChanges();
    setCapitalChanges(loadedChanges);
    const loadedHistory = fetchMonthlyCapitalHistory();
    setMonthlyCapitalHistory(loadedHistory);
    setLoading(false);
  }, []);

  // Save capital changes to localStorage
  React.useEffect(() => {
    if (!loading) {
      saveCapitalChanges(capitalChanges);
    }
  }, [capitalChanges, loading]);

  // Save monthly capital history to localStorage
  React.useEffect(() => {
    if (!loading) {
      saveMonthlyCapitalHistory(monthlyCapitalHistory);
    }
  }, [monthlyCapitalHistory, loading]);

    // Calculate monthly capital data
  React.useEffect(() => {
    if (!getPortfolioSize) return;
    
    // Group trades and capital changes by month and year
    const monthlyData: Record<string, { trades: any[]; changes: CapitalChange[]; date: Date; monthName: string; year: number }> = {};

    // Determine the overall date range from trades and monthly portfolio sizes
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    trades.forEach(trade => {
      const date = new Date(trade.date);
      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
    });

    capitalChanges.forEach(change => {
      const date = new Date(change.date);
      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
    });

    // Include dates from monthlyPortfolioSizes
    monthlyPortfolioSizes.forEach(monthlySize => {
      const date = new Date(monthlySize.year, months.indexOf(monthlySize.month), 1);
      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
    });

    if (!earliestDate || !latestDate) {
      setMonthlyCapital([]);
      return;
    }

    // Process trades and capital changes into monthly groups
    const getMonthKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    };

    trades.forEach(trade => {
      const date = new Date(trade.date);
      const key = getMonthKey(date);
      if (!monthlyData[key]) {
        monthlyData[key] = { trades: [], changes: [], date: new Date(date.getFullYear(), date.getMonth(), 1), monthName: date.toLocaleString('default', { month: 'short' }), year: date.getFullYear() };
      }
      monthlyData[key].trades.push(trade);
    });

    capitalChanges.forEach(change => {
      const date = new Date(change.date);
      const key = getMonthKey(date);
      if (!monthlyData[key]) {
        monthlyData[key] = { trades: [], changes: [], date: new Date(date.getFullYear(), date.getMonth(), 1), monthName: date.toLocaleString('default', { month: 'short' }), year: date.getFullYear() };
      }
      monthlyData[key].changes.push(change);
    });

    // Generate data for every month in the date range
    const monthlyCapitalData: MonthlyCapital[] = [];
    let currentCapital = initialPortfolioSize; // Start with initial capital

    const cursorDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
    
    // Add an initial data point for the starting capital of the very first month
    const firstMonthName = earliestDate.toLocaleString('default', { month: 'short' });
    const firstYear = earliestDate.getFullYear();
    const initialStartingCapitalForChart = getPortfolioSize(firstMonthName, firstYear);
    monthlyCapitalData.push({
      month: firstMonthName,
      year: firstYear,
      startingCapital: initialStartingCapitalForChart, // Capital at the absolute start of the first month
      deposits: 0, // No changes at the very start point
      withdrawals: 0,
      pl: 0,
      finalCapital: initialStartingCapitalForChart // Final capital is the same as starting at this point
    });

    while (cursorDate <= latestDate) {
      const monthKey = getMonthKey(cursorDate);
      const monthName = cursorDate.toLocaleString('default', { month: 'short' });
      const year = cursorDate.getFullYear();

      const monthData = monthlyData[monthKey] || { trades: [], changes: [], date: new Date(year, cursorDate.getMonth(), 1), monthName, year };

      // Get the explicit portfolio size for this month if set
      const explicitMonthlySize = getPortfolioSize(monthName, year);

      // Determine starting capital for the month
      let startingCapital: number;
      // If an explicit monthly size is set for THIS month, use it.
      // We check if the explicit size is different from the default/initial size
      // to determine if a user-set value exists for this specific month.
      if (explicitMonthlySize !== initialPortfolioSize) { // Compare with the hook's initialPortfolioSize parameter
        startingCapital = explicitMonthlySize;
      } else {
        // Otherwise, carry over the final capital from the previous month.
        startingCapital = currentCapital;
      }

      // Calculate deposits and withdrawals
      const deposits = monthData.changes.filter(c => c.type === 'deposit').reduce((sum, c) => sum + c.amount, 0);
      const withdrawals = monthData.changes.filter(c => c.type === 'withdrawal').reduce((sum, c) => sum + Math.abs(c.amount), 0);
      const netChange = deposits - withdrawals;

      // Calculate P/L from trades
      const pl = monthData.trades.reduce((sum, t) => sum + (t.plRs || 0), 0);

      // Calculate final capital for the month
      const finalCapital = startingCapital + netChange + pl;

      monthlyCapitalData.push({
        month: monthName,
        year,
        startingCapital: startingCapital, // Starting capital before net change
        deposits,
        withdrawals,
        pl,
        finalCapital
      });

      // Set current capital for the next month to this month's final capital
      currentCapital = finalCapital;

      // Move to the next month
      cursorDate.setMonth(cursorDate.getMonth() + 1);
    }

    setMonthlyCapital(monthlyCapitalData);

  }, [trades, capitalChanges, getPortfolioSize, monthlyPortfolioSizes, initialPortfolioSize, months]); // Added months to dependencies

  const addCapitalChange = React.useCallback((change: Omit<CapitalChange, 'id'>) => {
    const newChange = {
      ...change,
      id: generateId()
    };
    
    // Update the portfolio size for the month of this change
    const changeDate = new Date(change.date);
    const month = changeDate.toLocaleString('default', { month: 'short' });
    const year = changeDate.getFullYear();
    
    // Get current portfolio size for this month
    const currentSize = getPortfolioSize(month, year);
    
    // Calculate new size based on deposit/withdrawal
    const amount = change.type === 'deposit' ? change.amount : -change.amount;
    const newSize = currentSize + amount;
    
    // Update the portfolio size
    setPortfolioSize(newSize, month, year);
    
    // Add the change to the list
    setCapitalChanges(prev => [...prev, newChange]);
    
    return newChange;
  }, [getPortfolioSize, setPortfolioSize]);

  const updateCapitalChange = (updatedChange: CapitalChange) => {
    // Find the old change to calculate the difference
    setCapitalChanges(prev => {
      const oldChange = prev.find(c => c.id === updatedChange.id);
      
      if (oldChange) {
        // Calculate the difference this change makes
        const oldAmount = oldChange.type === 'deposit' ? oldChange.amount : -oldChange.amount;
        const newAmount = updatedChange.type === 'deposit' ? updatedChange.amount : -updatedChange.amount;
        const difference = newAmount - oldAmount;
        
        if (difference !== 0) {
          // Update the portfolio size for the month of this change
          const changeDate = new Date(updatedChange.date);
          const month = changeDate.toLocaleString('default', { month: 'short' });
          const year = changeDate.getFullYear();
          
          // Get current portfolio size for this month
          const currentSize = getPortfolioSize(month, year);
          
          // Update the portfolio size by the difference
          const newSize = currentSize + difference;
          setPortfolioSize(newSize, month, year);
        }
      }
      
      return prev.map(change => 
        change.id === updatedChange.id ? updatedChange : change
      );
    });
  };

  const deleteCapitalChange = (id: string) => {
    setCapitalChanges(prev => {
      const changeToDelete = prev.find(c => c.id === id);
      
      if (changeToDelete) {
        // Calculate the amount to adjust the portfolio size by
        const amount = changeToDelete.type === 'deposit' 
          ? -changeToDelete.amount  // Subtract deposit
          : changeToDelete.amount;  // Add back withdrawal
        
        // Update the portfolio size for the month of this change
        const changeDate = new Date(changeToDelete.date);
        const month = changeDate.toLocaleString('default', { month: 'short' });
        const year = changeDate.getFullYear();
        
        // Get current portfolio size for this month
        const currentSize = getPortfolioSize(month, year);
        
        // Update the portfolio size by reversing the effect of this change
        const newSize = currentSize + amount;
        setPortfolioSize(newSize, month, year);
      }
      
      return prev.filter(change => change.id !== id);
    });
  };

  // Add or update monthly starting capital for a month/year
  const setMonthlyStartingCapital = (month: string, year: number, startingCapital: number) => {
    setMonthlyCapitalHistory(prev => {
      const idx = prev.findIndex(h => h.month === month && h.year === year);
      if (idx !== -1) {
        // Update
        const updated = [...prev];
        updated[idx] = { ...updated[idx], startingCapital };
        return updated;
      } else {
        // Add
        return [...prev, { month, year, startingCapital }];
      }
    });
  };

  return {
    capitalChanges,
    monthlyCapital,
    addCapitalChange,
    updateCapitalChange,
    deleteCapitalChange,
    monthlyCapitalHistory,
    setMonthlyStartingCapital
  };
}; 