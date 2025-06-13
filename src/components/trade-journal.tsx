import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  useDisclosure,
  Tooltip,
  Pagination,
  Input,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Chip,
  Card,
  CardBody,
  User,
  SortDescriptor as HeroSortDescriptor,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Textarea
} from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { TradeModal } from "./trade-modal";
import { DeleteConfirmModal } from "./delete-confirm-modal";
import { TradeUploadModal } from "./TradeUploadModal";
import { useTrades, SortDescriptor } from "../hooks/use-trades";
import { format } from 'date-fns';
import { useTruePortfolioWithTrades } from "../hooks/use-true-portfolio-with-trades";
import { tableRowVariants, springTransition } from "../utils/animations";
import { calcSLPercent, calcHoldingDays, calcUnrealizedPL, calcRealizedPL_FIFO, calcOpenHeat, calcIndividualMoves, calcTradeOpenHeat } from "../utils/tradeCalculations";
import { fetchPriceTicks, fetchPriceTicksWithFallback } from '../utils/priceTickApi';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useAccountingMethod } from "../context/AccountingMethodContext";
import { calculateTradePL } from "../utils/accountingUtils";
import { getFromLocalStorage, setToLocalStorage } from "../utils/helpers";
// Removed Supabase import - using localStorage only

// localStorage helpers for misc data
function fetchMiscData(key: string) {
  try {
    const stored = localStorage.getItem(`misc_${key}`);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function saveMiscData(key: string, value: any) {
  try {
    localStorage.setItem(`misc_${key}`, JSON.stringify(value));
  } catch (error) {
    // Handle error silently
  }
}

const csvUrl = '/name_sector_industry.csv';

// Format a date string to a readable format
const formatDate = (dateString: string) => {
  try {
    return format(new Date(dateString), 'MMM d, yyyy');
  } catch (e) {
    return dateString;
  }
};

// Format a number as currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

import { Trade } from "../types/trade";

export interface TradeJournalProps {
  title?: string;
  statsTitle?: {
    totalTrades?: string;
    openPositions?: string;
    winRate?: string;
    totalPL?: string;
  };
  toggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

export const TradeJournal = React.memo(function TradeJournal({
  title = "Trade Journal",
  statsTitle = {
    totalTrades: "Total Trades",
    openPositions: "Open Positions",
    winRate: "Win Rate",
    totalPL: "Total P/L"
  },
  toggleFullscreen,
  isFullscreen
}: TradeJournalProps) {
  const {
    trades,
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
    getAccountingAwareValues
  } = useTrades();



  const { portfolioSize, getPortfolioSize } = useTruePortfolioWithTrades(trades);
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';

  // State for inline editing
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Memoize filtered and sorted trades
  const processedTrades = useMemo(() => {
    return trades
      .filter(trade => {
        if (!searchQuery) return true;
        const searchLower = searchQuery.toLowerCase();
        return (
          (trade.name || '').toLowerCase().includes(searchLower) ||
          (trade.setup || '').toLowerCase().includes(searchLower) ||
          (trade.notes || '').toLowerCase().includes(searchLower)
        );
      })
      .filter(trade => {
        if (!statusFilter || statusFilter === "all") return true;
        return trade.positionStatus.toLowerCase() === statusFilter.toLowerCase();
      });
  }, [trades, searchQuery, statusFilter]);

  // Memoize trade statistics calculations - now responsive to actual trade data changes
  const tradeStats = useMemo(() => {
    const openPositions = trades.filter(t => t.positionStatus === "Open" || t.positionStatus === "Partial");
    const closedTrades = trades.filter(t => t.positionStatus === "Closed");

    // Calculate P/L based on accounting method
    const tradesWithAccountingPL = trades.map(trade => ({
      ...trade,
      accountingPL: calculateTradePL(trade, useCashBasis)
    }));

    const winningTrades = tradesWithAccountingPL.filter(t => t.accountingPL > 0);

    return {
      totalTrades: trades.length,
      openPositionsCount: openPositions.length,
      winRate: tradesWithAccountingPL.length > 0 ? (winningTrades.length / tradesWithAccountingPL.length) * 100 : 0,
      totalPL: tradesWithAccountingPL.reduce((sum, t) => sum + (t.accountingPL || 0), 0)
    };
  }, [trades, useCashBasis]); // Now depends on full trades array to catch data changes

  // Performance monitoring
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const startTime = performance.now();
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.duration > 100) { // Log operations taking more than 100ms
            console.warn(`🐌 Slow operation: ${entry.name} took ${entry.duration.toFixed(2)}ms`);
          }
        });
      });
      observer.observe({ entryTypes: ['measure'] });

      // Measure component render time
      const endTime = performance.now();
      if (endTime - startTime > 50) {
        console.warn(`🐌 Slow render: TradeJournal took ${(endTime - startTime).toFixed(2)}ms`);
      }

      return () => observer.disconnect();
    }
  }, []);

  // This will be moved after items definition

  const handleExport = (format: 'csv' | 'xlsx') => {
    // Use the raw, unfiltered trades from the hook for export
    const allTradesForExport = trades; 

    // Define the headers for the export, ensuring they match the allColumns definitions
    const exportHeaders = allColumns
      .filter(col => col.key !== 'actions' && col.key !== 'unrealizedPL') // Exclude non-data columns
      .map(col => ({ label: col.label, key: col.key }));

    const dataToExport = allTradesForExport.map(trade => {
      const row: { [key: string]: any } = {};
      exportHeaders.forEach(header => {
        row[header.label] = trade[header.key as keyof Trade];
      });
      return row;
    });

    if (format === 'csv') {
      const csv = Papa.unparse(dataToExport);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `trade_journal_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Trades");
      XLSX.writeFile(workbook, `trade_journal_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };
  
  const handleAddNewBlankTrade = useCallback(() => {
    // Find the max tradeNo among existing trades (as a number)
    const maxTradeNo = trades.length > 0
      ? Math.max(
          ...trades
            .map(t => Number(t.tradeNo))
            .filter(n => !isNaN(n))
        )
      : 0;

    const newTrade: Trade = {
      id: `trade_${new Date().getTime()}_${Math.random()}`,
      tradeNo: String(maxTradeNo + 1),
      date: new Date().toISOString(),
      name: '',
      setup: '',
      buySell: 'Buy',
      entry: 0,
      avgEntry: 0,
      sl: 0,
      tsl: 0,
      cmp: 0,
      initialQty: 0,
      pyramid1Price: 0,
      pyramid1Qty: 0,
      pyramid1Date: '',
      pyramid2Price: 0,
      pyramid2Qty: 0,
      pyramid2Date: '',
      positionSize: 0,
      allocation: 0,
      exit1Price: 0,
      exit1Qty: 0,
      exit1Date: '',
      exit2Price: 0,
      exit2Qty: 0,
      exit2Date: '',
      exit3Price: 0,
      exit3Qty: 0,
      exit3Date: '',
      openQty: 0,
      exitedQty: 0,
      avgExitPrice: 0,
      stockMove: 0,
      openHeat: 0,
      rewardRisk: 0,
      holdingDays: 0,
      positionStatus: 'Open',
      realisedAmount: 0,
      plRs: 0,
      pfImpact: 0,
      cummPf: 0,
      planFollowed: true,
      exitTrigger: '',
      proficiencyGrowthAreas: '',
      baseDuration: '',
      slPercent: 0,
      notes: '',
      _cmpAutoFetched: false, // Initialize as manual entry
    };
    addTrade(newTrade);
  }, [addTrade, trades]);
  
  const { isOpen: isAddOpen, onOpen: onAddOpen, onOpenChange: onAddOpenChange } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onOpenChange: onEditOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();
  const { isOpen: isUploadOpen, onOpen: onUploadOpen, onOpenChange: onUploadOpenChange } = useDisclosure();
  
  const [selectedTrade, setSelectedTrade] = React.useState<Trade | null>(null);
  const [page, setPage] = React.useState(1);

  // Dynamic pagination options based on dataset size
  const rowsPerPageOptions = React.useMemo(() => {
    const totalTrades = trades.length;
    if (totalTrades < 500) return [10, 25, 50];
    if (totalTrades < 2000) return [25, 50, 100];
    return [50, 100, 200];
  }, [trades.length]);

  // Load rows per page from localStorage with fallback to 25, ensuring it's a valid option
  // This persists the user's preferred rows per page setting across sessions
  const [rowsPerPage, setRowsPerPage] = React.useState(() => {
    const savedValue = getFromLocalStorage('tradeJournal_rowsPerPage', 25, (value) => parseInt(value, 10));

    // Get initial options for validation (use default options if trades not loaded yet)
    const initialOptions = trades.length < 500 ? [10, 25, 50] :
                          trades.length < 2000 ? [25, 50, 100] : [50, 100, 200];

    // Return saved value if it's valid, otherwise return default
    return initialOptions.includes(savedValue) ? savedValue : 25;
  });

  // Save rows per page to localStorage whenever it changes
  React.useEffect(() => {
    setToLocalStorage('tradeJournal_rowsPerPage', rowsPerPage, (value) => value.toString());
  }, [rowsPerPage]);

  // Validate and adjust rowsPerPage when options change (e.g., when dataset size changes)
  React.useEffect(() => {
    if (!rowsPerPageOptions.includes(rowsPerPage)) {
      // If current rowsPerPage is not in the new options, set to the closest valid option
      const closestOption = rowsPerPageOptions.reduce((prev, curr) =>
        Math.abs(curr - rowsPerPage) < Math.abs(prev - rowsPerPage) ? curr : prev
      );
      setRowsPerPage(closestOption);
    }
  }, [rowsPerPageOptions, rowsPerPage]);
  
  // Progressive loading for large datasets
  const [loadedTradesCount, setLoadedTradesCount] = React.useState(() => {
    // Initial load: show more for smaller datasets, less for larger ones
    const initialLoad = processedTrades.length < 100 ? processedTrades.length : Math.min(100, processedTrades.length);
    return initialLoad;
  });

  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  // Update loaded count when trades change
  React.useEffect(() => {
    if (processedTrades.length <= loadedTradesCount) {
      setLoadedTradesCount(processedTrades.length);
    }
  }, [processedTrades.length, loadedTradesCount]);

  const loadMoreTrades = useCallback(() => {
    setIsLoadingMore(true);
    // Simulate loading delay for better UX
    setTimeout(() => {
      setLoadedTradesCount(prev => Math.min(prev + 50, processedTrades.length));
      setIsLoadingMore(false);
    }, 300);
  }, [processedTrades.length]);

  // Use progressive loading for large datasets, pagination for smaller ones
  const shouldUseProgressiveLoading = processedTrades.length > 200;

  const pages = shouldUseProgressiveLoading ? 1 : Math.ceil(processedTrades.length / rowsPerPage);

  // Optimized pagination with better memoization
  const items = React.useMemo(() => {
    if (shouldUseProgressiveLoading) {
      return processedTrades.slice(0, loadedTradesCount);
    } else {
      const start = (page - 1) * rowsPerPage;
      const end = start + rowsPerPage;
      return processedTrades.slice(start, end);
    }
  }, [page, processedTrades, rowsPerPage, shouldUseProgressiveLoading, loadedTradesCount]);

  // Optimized page change handler with immediate UI update
  const handlePageChange = React.useCallback((newPage: number) => {
    // Use startTransition for non-urgent updates to prevent blocking
    React.startTransition(() => {
      setPage(newPage);
    });
  }, [setPage]);

  // Remove heavy calculations from useEffect - they're causing the delay
  // These calculations should be done lazily when needed, not on every page change



  // Single source of truth for column definitions
  const allColumns = React.useMemo(() => [
    { key: "tradeNo", label: "Trade No.", sortable: true },
    { key: "date", label: "Date", sortable: true },
    { key: "name", label: "Name" },
    { key: "setup", label: "Setup" },
    { key: "buySell", label: "Buy/Sell", sortable: true },
    { key: "entry", label: "Entry (₹)", sortable: true },
    { key: "avgEntry", label: "Avg. Entry (₹)", sortable: true },
    { key: "sl", label: "SL (₹)", sortable: true },
    { key: "slPercent", label: "SL %", sortable: true },
    { key: "tsl", label: "TSL (₹)", sortable: true },
    { key: "cmp", label: "CMP (₹)", sortable: true },
    { key: "initialQty", label: "Initial Qty", sortable: true },
    { key: "pyramid1Price", label: "P1 Price (₹)", sortable: true },
    { key: "pyramid1Qty", label: "P1 Qty", sortable: true },
    { key: "pyramid1Date", label: "P1 Date", sortable: true },
    { key: "pyramid2Price", label: "P2 Price (₹)", sortable: true },
    { key: "pyramid2Qty", label: "P2 Qty", sortable: true },
    { key: "pyramid2Date", label: "P2 Date", sortable: true },
    { key: "positionSize", label: "Pos. Size", sortable: true },
    { key: "allocation", label: "Allocation (%)", sortable: true },
    { key: "exit1Price", label: "E1 Price (₹)", sortable: true },
    { key: "exit1Qty", label: "E1 Qty", sortable: true },
    { key: "exit1Date", label: "E1 Date", sortable: true },
    { key: "exit2Price", label: "E2 Price (₹)", sortable: true },
    { key: "exit2Qty", label: "E2 Qty", sortable: true },
    { key: "exit2Date", label: "E2 Date", sortable: true },
    { key: "exit3Price", label: "E3 Price (₹)", sortable: true },
    { key: "exit3Qty", label: "E3 Qty", sortable: true },
    { key: "exit3Date", label: "E3 Date", sortable: true },
    { key: "openQty", label: "Open Qty", sortable: true },
    { key: "exitedQty", label: "Exited Qty", sortable: true },
    { key: "avgExitPrice", label: "Avg. Exit (₹)", sortable: true },
    { key: "stockMove", label: "Stock Move (%)", sortable: true },
    { key: "openHeat", label: "Open Heat (%)", sortable: true },
    { key: "rewardRisk", label: "R:R", sortable: true },
    { key: "holdingDays", label: "Holding Days", sortable: true },
    { key: "positionStatus", label: "Status", sortable: true },
    { key: "realisedAmount", label: "Realized Amount", sortable: true },
    { key: "plRs", label: "Realized P/L (₹)", sortable: true },
    { key: "pfImpact", label: "PF Impact (%)", sortable: true },
    { key: "cummPf", label: "Cumm. PF (%)", sortable: true },
    { key: "planFollowed", label: "Plan Followed", sortable: true },
    { key: "exitTrigger", label: "Exit Trigger" },
    { key: "proficiencyGrowthAreas", label: "Growth Areas" },
    { key: "actions", label: "Actions", sortable: false },
    { key: 'unrealizedPL', label: 'Unrealized P/L', sortable: false },
    { key: 'notes', label: 'Notes', sortable: false },
  ], []);

  const headerColumns = React.useMemo(() => {
    return allColumns.filter(col => visibleColumns.includes(col.key));
  }, [allColumns, visibleColumns]);

  const handleEdit = (trade: Trade) => {
    setSelectedTrade(trade);
    onEditOpen();
  };

  const handleDelete = (trade: Trade) => {
    setSelectedTrade(trade);
    onDeleteOpen();
  };

  const handleAddTrade = (trade: Trade) => {
    addTrade(trade);
    onAddOpenChange();
  };

  const handleUpdateTrade = (trade: Trade) => {
    updateTrade(trade);
    onEditOpenChange();
  };

  const handleDeleteConfirm = () => {
    if (selectedTrade) {
      deleteTrade(selectedTrade.id);
      onDeleteOpenChange();
    }
  };

  const handleImportTrades = useCallback((importedTrades: Trade[]) => {
    // Use bulk import for better performance
    bulkImportTrades(importedTrades);

    // Show success message
    console.log(`Successfully imported ${importedTrades.length} trades`);
  }, [bulkImportTrades]);





  // List of calculated fields that should not be editable
  const nonEditableFields = [
    // Calculated fields
    'avgEntry', 'positionSize', 'allocation', 'openQty', 'exitedQty',
    'avgExitPrice', 'stockMove', 'slPercent', 'openHeat', 'rewardRisk',
    'holdingDays', 'realisedAmount', 'plRs', 'pfImpact', 'cummPf'
    // 'cmp' REMOVED to allow manual editing when auto-fetch fails
    // 'initialQty' REMOVED to allow inline editing
  ];

  // Check if a field is editable
  const isEditable = (field: string) => !nonEditableFields.includes(field);



  // Debounced update to reduce API calls and improve performance
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleInlineEditSave = React.useCallback(async (tradeId: string, field: keyof Trade, value: any) => {
    try {
      // Prevent editing of non-editable fields
      if (!isEditable(field as string)) {
        return;
      }

      const tradeToUpdate = trades.find(t => t.id === tradeId);
      if (!tradeToUpdate) {
        return;
      }

      // Parse value based on field type
      let parsedValue: any = value;
      if (typeof tradeToUpdate[field] === 'number') {
        parsedValue = Number(value) || 0;
        // Round positionSize to nearest whole number
        if (field === 'positionSize') {
          parsedValue = Math.round(parsedValue);
        }
      } else if (field.endsWith('Date') && value) {
        parsedValue = new Date(value).toISOString();
      } else if (field === 'planFollowed') {
        parsedValue = Boolean(value);
      }

      // Create updated trade with the new value
      const updatedTrade = { ...tradeToUpdate, [field]: parsedValue };

      // If the field is 'name', fetch the latest price and update cmp (only if CMP is currently 0 or not manually set)
      if (field === 'name' && parsedValue) {
        try {
          console.log(`[handleInlineEditSave] Fetching price for ${parsedValue}`);
          let priceData;

          try {
            // Try primary API first
            priceData = await fetchPriceTicks(parsedValue);
          } catch (primaryError) {
            console.warn(`[handleInlineEditSave] Primary API failed for ${parsedValue}, trying fallback:`, primaryError);
            // If primary fails, try fallback
            priceData = await fetchPriceTicksWithFallback(parsedValue);
          }

          const ticks = priceData?.data?.ticks?.[parsedValue.toUpperCase()];
          if (ticks && ticks.length > 0) {
            const latestTick = ticks[ticks.length - 1];
            const fetchedPrice = latestTick[4]; // index 4 is close price

            // Only update CMP if it's currently 0 (not manually set) or if we successfully fetched a price
            if (tradeToUpdate.cmp === 0 || fetchedPrice > 0) {
              updatedTrade.cmp = fetchedPrice;
              // Add a flag to indicate this was auto-fetched (for UI indication)
              updatedTrade._cmpAutoFetched = true;
              console.log(`[handleInlineEditSave] Successfully fetched price ${fetchedPrice} for ${parsedValue}`);
            }
          } else {
            // No price data available - keep existing CMP if it's manually set, otherwise set to 0
            if (tradeToUpdate.cmp === 0) {
              updatedTrade.cmp = 0;
              updatedTrade._cmpAutoFetched = false;
            }
            console.warn(`[handleInlineEditSave] No price data available for ${parsedValue}`);
          }
        } catch (err) {
          // All fetch attempts failed - keep existing CMP if it's manually set, otherwise set to 0
          if (tradeToUpdate.cmp === 0) {
            updatedTrade.cmp = 0;
            updatedTrade._cmpAutoFetched = false;
          }
          console.error(`[handleInlineEditSave] All price fetch attempts failed for ${parsedValue}:`, err);
        }
      }

      // If the field is 'cmp' and manually edited, mark it as manually set
      if (field === 'cmp') {
        updatedTrade._cmpAutoFetched = false;
      }

      // Recalculate dependent fields if needed
      if ([
        'entry', 'sl', 'tsl', 'initialQty', 'pyramid1Qty', 'pyramid2Qty',
        'exit1Price', 'exit2Price', 'exit3Price', 'cmp'
      ].includes(field as string)) {
        updatedTrade.openHeat = calcTradeOpenHeat(updatedTrade, portfolioSize, getPortfolioSize);
      }

      // Immediately update the trade in the local state for instant UI feedback
      updateTrade(updatedTrade);

      // Debounced update to reduce API calls (but UI is already updated)
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      updateTimeoutRef.current = setTimeout(async () => {
        try {
          // This is just for persistence - UI is already updated
          await updateTrade(updatedTrade);
        } catch (error) {
          // Handle error silently
        }
      }, 200); // Reduced debounce delay since UI updates immediately

    } catch (error) {
      // Handle error silently
    }
  }, [trades, isEditable, portfolioSize, getPortfolioSize, updateTrade]);





  // Format cell value based on its type
  const formatCellValue = (value: any, key: string) => {
    if (value === undefined || value === null || value === '') return '-';
    
    // Format dates
    if (key.endsWith('Date')) {
      return formatDate(value as string);
    }
    
    // Format currency values
    if ([
      'entry', 'avgEntry', 'sl', 'tsl', 'cmp', 'pyramid1Price', 'pyramid2Price', 
      'exit1Price', 'exit2Price', 'exit3Price', 'avgExitPrice', 'realisedAmount', 'plRs'
    ].includes(key)) {
      return formatCurrency(Number(value));
    }
    
    // Format percentage values
    if (['slPercent', 'openHeat', 'allocation', 'pfImpact', 'cummPf', 'stockMove'].includes(key)) {
      return `${Number(value).toFixed(2)}%`;
    }
    
    // Format position size to whole number
    if (key === 'positionSize') {
      return String(Math.round(Number(value)));
    }
    
    // Format reward/risk ratio
    if (key === 'rewardRisk') {
      const rr = Number(value);
      if (rr > 0) {
        const rrStr = rr % 1 === 0 ? rr.toFixed(0) : rr.toFixed(2);
        return `1:${rrStr} (${rrStr}R)`;
      } else {
        return '-';
      }
    }
    
    // Format boolean values
    if (key === 'planFollowed') {
      return value ? 'Yes' : 'No';
    }
    
    return String(value);
  };

  // Add color to P/L values
  const getValueColor = (value: any, key: string) => {
    if (key !== 'plRs') return '';
    const numValue = Number(value);
    return numValue < 0 ? 'text-danger' : numValue > 0 ? 'text-success' : '';
  };





  const renderCell = React.useCallback((trade: Trade, columnKey: string) => {
    const cellValue = trade[columnKey as keyof Trade];

    // Handle holding days display with detailed tooltip
    if (columnKey === 'holdingDays') {
      const displayDays = trade.holdingDays || 0;
      const isOpen = trade.positionStatus === 'Open';

      // Create detailed holding days tooltip
      const entryDate = trade.date ? new Date(trade.date) : null;
      const exitDates = [trade.exit1Date, trade.exit2Date, trade.exit3Date].filter(Boolean);
      const pyramidDates = [trade.pyramid1Date, trade.pyramid2Date].filter(Boolean);

      const holdingDaysTooltip = (
        <div className="p-2 text-xs max-w-xs">
          <div className="font-semibold mb-1">Holding Days Calculation:</div>
          <p className="mb-1">Days between entry and exit (or current date for open positions)</p>
          {entryDate && (
            <div className="space-y-1">
              <p><b>Entry Date:</b> {entryDate.toLocaleDateString()}</p>
              {exitDates.length > 0 ? (
                <div>
                  <b>Exit Dates:</b>
                  {exitDates.map((date, idx) => (
                    <div key={idx} className="ml-2">• {new Date(date).toLocaleDateString()}</div>
                  ))}
                </div>
              ) : (
                <p><b>Status:</b> {isOpen ? 'Still Open' : 'Closed'}</p>
              )}
              {pyramidDates.length > 0 && (
                <div>
                  <b>Pyramid Dates:</b>
                  {pyramidDates.map((date, idx) => (
                    <div key={idx} className="ml-2">• {new Date(date).toLocaleDateString()}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );

      return (
        <div className="flex items-center gap-1">
          <span className={`py-1 px-2 ${isOpen ? 'text-warning' : ''}`}>
            {displayDays}
          </span>
          <Tooltip
            content={holdingDaysTooltip}
            placement="right"
            classNames={{
              base: "py-1 px-2 shadow-soft-xl backdrop-blur-xl bg-background/80 dark:bg-background/40 border border-foreground-200/20",
              content: "text-foreground-700 dark:text-foreground-300"
            }}
          >
            <Icon icon="lucide:alert-circle" className="w-4 h-4 text-warning-500 cursor-help" />
          </Tooltip>
        </div>
      );
    }

    // Detailed Reward:Risk display with tooltip
    if (columnKey === 'rewardRisk') {
      const rrValue = trade.rewardRisk || 0;
      const formatRR = (value: number) => value > 0 ? `1:${value.toFixed(2)}` : '-';

      // Create detailed R:R tooltip
      const rrTooltip = (
        <div className="p-2 text-xs max-w-xs">
          <div className="font-semibold mb-1">Reward:Risk (R:R) Calculation:</div>
          <p className="mb-1">Indicates the ratio of potential/actual reward to the initial risk taken.</p>
          <p className="mb-0.5"><b>Risk (per share):</b> Absolute difference between Entry Price and Stop Loss (SL).</p>
          <div className="font-medium mt-1">Reward Basis (per share):</div>
          {trade.positionStatus === 'Open' && <p className="ml-2 text-[11px]">Potential: Current Market Price (CMP) - Entry Price</p>}
          {trade.positionStatus === 'Closed' && <p className="ml-2 text-[11px]">Actual: Average Exit Price - Entry Price</p>}
          {trade.positionStatus === 'Partial' && (
            <div className="ml-2 text-[11px]">
              <p>Weighted Average:</p>
              <p>• Realized: (Avg Exit - Entry) × Exited Qty</p>
              <p>• Potential: (CMP - Entry) × Open Qty</p>
            </div>
          )}
          <div className="mt-2 p-1 bg-content2 rounded">
            <p className="font-medium">Current R:R: {formatRR(rrValue)}</p>
            {rrValue > 0 && <p className="text-[10px] text-foreground-500">({rrValue.toFixed(2)}R)</p>}
          </div>
        </div>
      );

      return (
        <div className="flex items-center gap-1">
          <span className="py-1 px-2">
            {formatRR(rrValue)}
          </span>
          <Tooltip
            content={rrTooltip}
            placement="right"
            classNames={{
              base: "py-1 px-2 shadow-soft-xl backdrop-blur-xl bg-background/80 dark:bg-background/40 border border-foreground-200/20",
              content: "text-foreground-700 dark:text-foreground-300"
            }}
          >
            <Icon icon="lucide:alert-circle" className="w-4 h-4 text-warning-500 cursor-help" />
          </Tooltip>
        </div>
      );
    }

    // Detailed Stock Move display with tooltip
    if (columnKey === 'stockMove') {
      const stockMoveValue = trade.stockMove || 0;
      const formatPercentage = (value: number) => `${value.toFixed(2)}%`;

      // Create detailed stock move tooltip
      const entry = trade.avgEntry || trade.entry || 0;
      const cmp = trade.cmp || 0;
      const avgExit = trade.avgExitPrice || 0;
      const isBuy = trade.buySell === 'Buy';

      const stockMoveTooltip = (
        <div className="p-2 text-xs max-w-xs">
          <div className="font-semibold mb-1">Stock Move Calculation:</div>
          <p className="mb-1">Percentage change in stock price from entry to current/exit price.</p>

          <div className="space-y-1">
            <p><b>Entry Price:</b> ₹{entry.toFixed(2)}</p>
            {trade.positionStatus === 'Open' && (
              <>
                <p><b>Current Price (CMP):</b> ₹{cmp.toFixed(2)}</p>
                <p><b>Calculation:</b> {isBuy ? '(CMP - Entry)' : '(Entry - CMP)'} / Entry × 100</p>
                <p><b>Formula:</b> ({isBuy ? cmp.toFixed(2) : entry.toFixed(2)} - {isBuy ? entry.toFixed(2) : cmp.toFixed(2)}) / {entry.toFixed(2)} × 100</p>
              </>
            )}
            {trade.positionStatus === 'Closed' && avgExit > 0 && (
              <>
                <p><b>Average Exit Price:</b> ₹{avgExit.toFixed(2)}</p>
                <p><b>Calculation:</b> {isBuy ? '(Avg Exit - Entry)' : '(Entry - Avg Exit)'} / Entry × 100</p>
                <p><b>Formula:</b> ({isBuy ? avgExit.toFixed(2) : entry.toFixed(2)} - {isBuy ? entry.toFixed(2) : avgExit.toFixed(2)}) / {entry.toFixed(2)} × 100</p>
              </>
            )}
            {trade.positionStatus === 'Partial' && (
              <>
                <p><b>Current Price (CMP):</b> ₹{cmp.toFixed(2)}</p>
                <p><b>Average Exit Price:</b> ₹{avgExit.toFixed(2)}</p>
                <p><b>Calculation:</b> Weighted average of realized and unrealized moves</p>
              </>
            )}
          </div>

          <div className="mt-2 p-1 bg-content2 rounded">
            <p className="font-medium">Stock Move: {formatPercentage(stockMoveValue)}</p>
            <p className="text-[10px] text-foreground-500">
              {stockMoveValue > 0 ? 'Favorable' : stockMoveValue < 0 ? 'Unfavorable' : 'Neutral'} move
            </p>
          </div>
        </div>
      );

      return (
        <div className="flex items-center gap-1">
          <span className="py-1 px-2">
            {formatPercentage(stockMoveValue)}
          </span>
          <Tooltip
            content={stockMoveTooltip}
            placement="right"
            classNames={{
              base: "py-1 px-2 shadow-soft-xl backdrop-blur-xl bg-background/80 dark:bg-background/40 border border-foreground-200/20",
              content: "text-foreground-700 dark:text-foreground-300"
            }}
          >
            <Icon icon="lucide:alert-circle" className="w-4 h-4 text-warning-500 cursor-help" />
          </Tooltip>
        </div>
      );
    }



    // Skip rendering for non-editable fields
    if (!isEditable(columnKey)) {
      return (
        <div className={`py-1 px-2 ${getValueColor(cellValue, columnKey)}`}>
          {formatCellValue(cellValue, columnKey)}
        </div>
      );
    }

    // Handle special cell types
    if (columnKey === 'buySell') {
      return (
        <BuySellCell 
          value={trade.buySell} 
          onSave={(value) => handleInlineEditSave(trade.id, 'buySell', value)} 
        />
      );
    }

    if (columnKey === 'positionStatus') {
      return (
        <PositionStatusCell 
          value={trade.positionStatus} 
          onSave={(value) => handleInlineEditSave(trade.id, 'positionStatus', value)} 
        />
      );
    }

    if (columnKey === 'name') {
      // Simplified name cell without heavy tooltip calculations
      return (
        <div className="max-w-[200px] cursor-default">
          <NameCell
            value={trade.name}
            onSave={(value) => handleInlineEditSave(trade.id, "name", value)}
          />
        </div>
      );
    }

    if (columnKey === 'setup') {
      return (
        <SetupCell 
          value={trade.setup || ''} 
          onSave={(value) => handleInlineEditSave(trade.id, 'setup', value)} 
        />
      );
    }

    if (columnKey === 'exitTrigger') {
      return (
        <ExitTriggerCell 
          value={trade.exitTrigger || ''} 
          onSave={(value) => handleInlineEditSave(trade.id, 'exitTrigger', value)} 
        />
      );
    }

    if (columnKey === 'proficiencyGrowthAreas') {
      return (
        <ProficiencyGrowthAreasCell 
          value={trade.proficiencyGrowthAreas || ''} 
          onSave={(value) => handleInlineEditSave(trade.id, 'proficiencyGrowthAreas', value)} 
        />
      );
    }

    if (columnKey === 'planFollowed') {
      return (
        <PlanFollowedCell 
          value={trade.planFollowed} 
          onSave={(value) => handleInlineEditSave(trade.id, 'planFollowed', value)} 
        />
      );
    }

    if (columnKey === 'notes') {
      return (
        <NotesCell
          value={trade.notes || ''}
          onSave={(value) => handleInlineEditSave(trade.id, 'notes', value)}
        />
      );
    }

    switch (columnKey) {
      // Text fields - only allow editing non-required fields
      case "exitTrigger":
      case "proficiencyGrowthAreas":
      case "baseDuration":
      case "pyramid1Date":
      case "pyramid2Date":
      case "exit1Date":
      case "exit2Date":
      case "exit3Date":
        return (
          <EditableCell
            value={cellValue as string}
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)}
            type="date"
          />
        );
        
      // Trade number (editable)
      case "tradeNo":
        return (
          <EditableCell 
            value={cellValue as string} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} 
          />
        );
        
      // Date field (editable with date picker)
      case "date":
        return (
          <EditableCell 
            value={cellValue as string} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)}
            type="date"
          />
        );
        
      // Stock/Asset Name (editable)
      case "name":
        return (
          <EditableCell
            value={cellValue as string}
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)}
          />
        );
        
      // Exit Trigger field (editable with dropdown)
      case "exitTrigger":
        return (
          <EditableCell 
            value={cellValue as string} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)}
            type="select"
            options={[
              "Breakeven exit",
              "Market Pressure",
              "R multiples",
              "Random",
              "SL",
              "Target",
              "Trailing SL"
            ]}
          />
        );
        
      // Setup field (editable with dropdown)
      case "setup":
        return (
          <SetupCell 
            value={cellValue as string} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)}
          />
        );
        
      // Proficiency Growth Areas field (editable with dropdown)
      case "proficiencyGrowthAreas":
        return (
          <EditableCell 
            value={cellValue as string} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)}
          />
        );
        
      // Entry and SL fields (editable)
      case "entry":
      case "sl":
        return (
          <EditableCell 
            value={cellValue as number} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} 
            type="price"
          />
        );
        
      // CMP field with special handling for auto-fetch vs manual entry
      case "cmp":
        return (
          <CMPCell
            value={cellValue as number}
            isAutoFetched={trade._cmpAutoFetched}
            onSave={(value) => handleInlineEditSave(trade.id, "cmp", value)}
          />
        );

      // Other price fields
      case "tsl":
      case "pyramid1Price":
      case "pyramid2Price":
      case "exit1Price":
      case "exit2Price":
      case "exit3Price":
      case "avgEntry":
      case "avgExitPrice":
      case "positionSize":
      case "realisedAmount":
      case "plRs":
        return (
          <EditableCell
            value={cellValue as number}
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)}
            type="price"
            colorValue={columnKey === 'plRs'}
          />
        );
        
      // Number fields with percentage
      case "slPercent":
      case "openHeat":
      case "allocation":
      case "pfImpact":
      case "cummPf":
      case "stockMove":
      case "rewardRisk":
        return (
          <EditableCell 
            value={cellValue as number} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} 
            type="number"
          />
        );
        
      // Quantity fields - only pyramid and exit quantities are editable
      case "pyramid1Qty":
      case "pyramid2Qty":
      case "exit1Qty":
      case "exit2Qty":
      case "exit3Qty":
      case "initialQty":
        return (
          <EditableCell 
            value={cellValue as number} 
            onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} 
            type="number"
            min={0}
          />
        );
        
      // Non-editable quantity fields
      case "openQty":
      case "exitedQty":
      case "holdingDays":
        return (
          <div className="py-1 px-2 text-right">
            {formatCellValue(cellValue, columnKey)}
          </div>
        );
      case "date":
      case "pyramid1Date":
      case "pyramid2Date":
      case "exit1Date":
      case "exit2Date":
      case "exit3Date":
        return <EditableCell value={cellValue as string} type="date" onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} />;
      case "entry":
      case "avgEntry":
      case "sl":
      case "tsl":
      case "cmp":
      case "pyramid1Price":
      case "pyramid2Price":
      case "exit1Price":
      case "exit2Price":
      case "exit3Price":
      case "avgExitPrice":
        return <EditableCell value={cellValue as number} type="price" onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} />;
      case "realisedAmount":
      case "plRs":
        const accountingValues = getAccountingAwareValues(trade);
        const displayValue = columnKey === "realisedAmount" ? accountingValues.realisedAmount : accountingValues.plRs;
        return (
          <div className={`py-1 px-2 text-right ${getValueColor(displayValue, columnKey)}`}>
            {formatCellValue(displayValue, columnKey)}
          </div>
        );
      case "initialQty":
      case "pyramid1Qty":
      case "pyramid2Qty":
      case "positionSize":
      case "exit1Qty":
      case "exit2Qty":
      case "exit3Qty":
      case "openQty":
      case "exitedQty":
      case "holdingDays":
        return <EditableCell value={cellValue as number} type="number" onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} />;
      case "allocation":
      case "stockMove":
      case "openHeat":
        return <EditableCell value={cellValue as number} type="number" onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} />;
      case "pfImpact":
        const pfImpactValues = getAccountingAwareValues(trade);
        return (
          <div className="py-1 px-2 text-right">
            {formatCellValue(pfImpactValues.pfImpact, columnKey)}
          </div>
        );
      case "cummPf":
        return (
          <div className="py-1 px-2 text-right">
            {formatCellValue(cellValue, columnKey)}
          </div>
        );
      case "rewardRisk":
        return <EditableCell value={cellValue as number} type="number" onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} />;
      case "buySell":
        return <BuySellCell value={trade.buySell} onSave={(value) => handleInlineEditSave(trade.id, "buySell", value)} />;
      case "positionStatus":
        return <PositionStatusCell value={trade.positionStatus} onSave={(value) => handleInlineEditSave(trade.id, "positionStatus", value)} />;
      case "planFollowed":
        return <PlanFollowedCell value={trade.planFollowed} onSave={(value) => handleInlineEditSave(trade.id, "planFollowed", value)} />;
      case "slPercent":
        const slPercent = calcSLPercent(trade.sl, trade.entry);
        return (
          <div className="text-right font-medium text-small">
            {slPercent > 0 ? `${slPercent.toFixed(2)}%` : "-"}
          </div>
        );
      case "actions":
        return (
          <div className="flex items-center justify-end gap-2">
            <Tooltip content="Edit trade (modal)">
              <Button isIconOnly size="sm" variant="light" onPress={() => handleEdit(trade)}>
                <Icon icon="lucide:edit-3" className="w-4 h-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Delete trade">
              <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => handleDelete(trade)}>
                <Icon icon="lucide:trash-2" className="w-4 h-4" />
              </Button>
            </Tooltip>
          </div>
        );
      case 'unrealizedPL':
        if (trade.positionStatus === 'Open' || trade.positionStatus === 'Partial') {
          return (
            <div className="py-1 px-2 text-right">
              {formatCellValue(calcUnrealizedPL(trade.avgEntry, trade.cmp, trade.openQty, trade.buySell), 'plRs')}
            </div>
          );
        } else {
          return <div className="py-1 px-2 text-right">-</div>;
        }
      case 'openHeat':
        return (
          <div className="py-1 px-2 text-right">
            {calcTradeOpenHeat(trade, portfolioSize, getPortfolioSize).toFixed(2)}%
          </div>
        );
      case 'notes':
        return (
          <NotesCell
            value={trade.notes || ''}
            onSave={(value) => handleInlineEditSave(trade.id, 'notes', value)}
          />
        );
      default:
        const val = trade[columnKey as keyof Trade];
        return val !== undefined && val !== null ? String(val) : "-";
    }
  }, [editingId, handleInlineEditSave, isEditable, portfolioSize, getPortfolioSize]);

  // Stable stats calculation - prevent layout shifts and excessive recalculation
  const [statsLoaded, setStatsLoaded] = React.useState(true); // Start as loaded to prevent layout shift
  const [lazyStats, setLazyStats] = React.useState({
    totalUnrealizedPL: 0,
    openPfImpact: 0,
    totalRealizedPL: 0,
    realizedPfImpact: 0,
    openHeat: 0,
    winRate: 0
  });

  // Stats calculation that responds to trade data changes
  const stableStatsCalculation = React.useMemo(() => {
    if (trades.length === 0) {
      return {
        totalUnrealizedPL: 0,
        openPfImpact: 0,
        totalRealizedPL: 0,
        realizedPfImpact: 0,
        openHeat: 0,
        winRate: 0
      };
    }

    // Calculate unrealized P/L for open positions
    const unrealizedPL = trades
      .filter(trade => trade.positionStatus === 'Open' || trade.positionStatus === 'Partial')
      .reduce((sum, trade) => sum + calcUnrealizedPL(trade.avgEntry, trade.cmp, trade.openQty, trade.buySell), 0);

    const openImpact = portfolioSize > 0 ? (unrealizedPL / portfolioSize) * 100 : 0;

    // Calculate realized P/L based on accounting method
    const realizedPL = trades
      .filter(trade => trade.positionStatus !== 'Open')
      .reduce((sum, trade) => sum + calculateTradePL(trade, useCashBasis), 0);

    const realizedImpact = portfolioSize > 0 ? (realizedPL / portfolioSize) * 100 : 0;

    // Calculate open heat
    const openHeat = calcOpenHeat(trades, portfolioSize, getPortfolioSize);

    // Calculate win rate
    const tradesWithAccountingPL = trades.map(trade => ({
      ...trade,
      accountingPL: calculateTradePL(trade, useCashBasis)
    }));
    const winningTrades = tradesWithAccountingPL.filter(t => t.accountingPL > 0);
    const winRate = tradesWithAccountingPL.length > 0 ? (winningTrades.length / tradesWithAccountingPL.length) * 100 : 0;

    return {
      totalUnrealizedPL: unrealizedPL,
      openPfImpact: openImpact,
      totalRealizedPL: realizedPL,
      realizedPfImpact: realizedImpact,
      openHeat,
      winRate
    };
  }, [trades, portfolioSize, useCashBasis, getPortfolioSize]); // Now responds to all trade data changes

  // Update lazy stats when stable calculation changes
  React.useEffect(() => {
    setLazyStats(stableStatsCalculation);
  }, [stableStatsCalculation]);





  // Memoize open trades to prevent unnecessary price fetching
  const openTrades = React.useMemo(() =>
    trades.filter(t => t.positionStatus === 'Open' || t.positionStatus === 'Partial'),
    [trades]
  );

  // Memoize the price fetching function to prevent re-creation
  const fetchPricesForOpenTrades = React.useCallback(async () => {
    console.log(`[fetchPricesForOpenTrades] Fetching prices for ${openTrades.length} open trades`);

    for (const trade of openTrades) {
      if (trade.name) {
        try {
          console.log(`[fetchPricesForOpenTrades] Fetching price for ${trade.name}`);
          let priceData;

          try {
            // Try primary API first
            priceData = await fetchPriceTicks(trade.name);
          } catch (primaryError) {
            console.warn(`[fetchPricesForOpenTrades] Primary API failed for ${trade.name}, trying fallback:`, primaryError);
            // If primary fails, try fallback
            priceData = await fetchPriceTicksWithFallback(trade.name);
          }

          const ticks = priceData?.data?.ticks?.[trade.name.toUpperCase()];
          if (ticks && ticks.length > 0) {
            const latestTick = ticks[ticks.length - 1];
            const newPrice = latestTick[4];

            if (trade.cmp !== newPrice) {
              console.log(`[fetchPricesForOpenTrades] Updating ${trade.name} price from ${trade.cmp} to ${newPrice}`);
              updateTrade({ ...trade, cmp: newPrice, _cmpAutoFetched: true });
            }
          } else {
            console.warn(`[fetchPricesForOpenTrades] No price data available for ${trade.name}`);
          }
        } catch (err) {
          console.error(`[fetchPricesForOpenTrades] All price fetch attempts failed for ${trade.name}:`, err);
          // Continue with next trade instead of stopping
        }
      }
    }
  }, [openTrades, updateTrade]);

  useEffect(() => {
    // Immediate fetch on mount or open trades change
    fetchPricesForOpenTrades();

    // Continue polling every 15 seconds
    const interval = setInterval(fetchPricesForOpenTrades, 15000);
    return () => clearInterval(interval);
  }, [fetchPricesForOpenTrades]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 mb-6">
        <AnimatePresence>
          {/* <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          </div> */}
          <div className="flex flex-row justify-between items-center gap-4 w-full">
            <div className="flex items-center gap-3 flex-1">
              <Input
                classNames={{
                  base: "max-w-[300px]",
                  inputWrapper: "h-9 bg-content2 dark:bg-gray-900",
                  input: "text-foreground dark:text-white"
                }}
                placeholder="Search trades..."
                startContent={<Icon icon="lucide:search" className="text-default-400 dark:text-default-300" />}
                value={searchQuery}
                onValueChange={setSearchQuery}
                size="sm"
              />
              <Dropdown>
                <DropdownTrigger>
                  <Button 
                    variant="flat" 
                    size="sm"
                    className="bg-default-100 dark:bg-gray-900 text-foreground dark:text-white min-w-[120px] h-9"
                    endContent={<Icon icon="lucide:chevron-down" className="text-sm dark:text-gray-400" />}
                  >
                    Status: {statusFilter || "All"}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Status filter"
                  className="dark:bg-gray-900"
                  selectionMode="single"
                  selectedKeys={statusFilter ? [statusFilter] : []}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as string;
                    setStatusFilter(selected === "All" ? "" : selected);
                  }}
                  classNames={{
                    base: "dark:bg-gray-900",
                  }}
                >
                  <DropdownItem key="All" className="dark:text-white dark:hover:bg-gray-800">All</DropdownItem>
                  <DropdownItem key="Open" className="dark:text-white dark:hover:bg-gray-800">Open</DropdownItem>
                  <DropdownItem key="Closed" className="dark:text-white dark:hover:bg-gray-800">Closed</DropdownItem>
                  <DropdownItem key="Partial" className="dark:text-white dark:hover:bg-gray-800">Partial</DropdownItem>
                </DropdownMenu>
              </Dropdown>

              {/* Temporary debug button to clear filters */}
              {(searchQuery || statusFilter) && (
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  onPress={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    console.log('🔄 Cleared all filters');
                  }}
                  startContent={<Icon icon="lucide:x" />}
                >
                  Clear Filters
                </Button>
              )}

              <Dropdown>
                <DropdownTrigger>
                  <Button 
                    variant="flat" 
                    size="sm"
                    className="bg-default-100 dark:bg-gray-900 text-foreground dark:text-white min-w-[120px] h-9"
                    endContent={<Icon icon="lucide:chevron-down" className="text-sm dark:text-gray-400" />}
                  >
                    Columns
                  </Button>
                </DropdownTrigger>
                <DropdownMenu 
                  aria-label="Columns selection"
                  className="dark:bg-gray-900 max-h-60 overflow-y-auto" // <-- add scroller
                  closeOnSelect={false}
                  selectionMode="multiple"
                  selectedKeys={new Set(visibleColumns)}
                  onSelectionChange={(keys) => setVisibleColumns(Array.from(keys as Set<string>))}
                  classNames={{
                    base: "dark:bg-gray-900",
                  }}
                >
                  {allColumns.filter(col => col.key !== "actions").map((column) => (
                    <DropdownItem key={column.key} className="capitalize dark:text-white dark:hover:bg-gray-800">
                      {column.label}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
            </div>

            <motion.div
              className="flex items-center gap-1"
            >
              <Button
                isIconOnly
                color="primary"
                variant="light"
                onPress={onAddOpen}
                size="sm"
                className="rounded-md p-1 hover:bg-primary/10 transition"
              >
                <Icon icon="lucide:plus" className="text-base" />
              </Button>
            </motion.div>
            <Tooltip content="Import trades from Excel/CSV" placement="top">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                className="rounded-md p-1 hover:bg-success/10 transition"
                onPress={onUploadOpen}
              >
                <Icon icon="lucide:upload" className="text-base text-success" />
              </Button>
            </Tooltip>
            <Dropdown>
              <DropdownTrigger>
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  className="rounded-md p-1 hover:bg-primary/10 transition"
                >
                  <Icon icon="lucide:download" className="text-base" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Export options"
                onAction={(key) => handleExport(key as 'csv' | 'xlsx')}
              >
                <DropdownItem key="csv" startContent={<Icon icon="lucide:file-text" />}>
                  Export as CSV
                </DropdownItem>
                <DropdownItem key="xlsx" startContent={<Icon icon="lucide:file-spreadsheet" />}>
                  Export as Excel
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-center">
        {/* First three stats: Total Trades, Open Positions, Win Rate - Simple calculations */}
        {[{
          title: statsTitle.totalTrades,
          value: trades.length.toString(),
          icon: "lucide:list",
          color: "primary",
          tooltip: "Total number of trades you have recorded."
        }, {
          title: statsTitle.openPositions,
          value: trades.filter(t => t.positionStatus === "Open").length.toString(),
          icon: "lucide:activity",
          color: "warning",
          tooltip: "Number of trades that are currently open."
        }, {
          title: statsTitle.winRate,
          value: `${lazyStats.winRate.toFixed(2)}%`,
          icon: "lucide:target",
          color: "success",
          tooltip: `Percentage of trades that are profitable (${useCashBasis ? 'Cash Basis' : 'Accrual Basis'}).`
        }].map((stat, idx) => (
          <div key={stat.title} className="flex items-center gap-2">
            <StatsCard
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={idx === 0 ? "primary" : idx === 1 ? "warning" : "success"}
            />
            {/* Show info icon only on mobile for first three stats */}
            <div className="block sm:hidden">
              <Tooltip
                placement="top"
                className="max-w-xs text-xs p-1 bg-content1 border border-divider"
                content={<div>{stat.tooltip}</div>}
              >
                <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer inline-block align-middle ml-2" />
              </Tooltip>
            </div>
          </div>
        ))}
        {/* Last three stats: Realized P/L, Unrealized P/L, Open Heat - No more lazy loading */}
        <div className="flex items-center gap-2">
          <StatsCard
            title="Realized P/L"
            value={formatCurrency(lazyStats.totalRealizedPL)}
            icon="lucide:indian-rupee"
            color={lazyStats.totalRealizedPL >= 0 ? "success" : "danger"}
          />
          <Tooltip
            placement="top"
            className="max-w-xs text-xs p-1 bg-content1 border border-divider"
            content={(() => {

              const closedTrades = trades.filter(t => t.positionStatus === 'Closed' || t.positionStatus === 'Partial');
              const breakdown = closedTrades
                .map(t => {
                  const realizedPL = calculateTradePL(t, useCashBasis);
                  return {
                    name: t.name || 'N/A',
                    realizedPL: realizedPL,
                    pfImpact: portfolioSize > 0 ? (realizedPL / portfolioSize) * 100 : 0
                  };
                })
                .filter(t => Math.abs(t.realizedPL) > 0.01) // Filter out negligible amounts
                .sort((a, b) => Math.abs(b.realizedPL) - Math.abs(a.realizedPL)); // Sort by absolute value

              return (
                <div className="max-w-sm">
                  <div className="mb-2">
                    <div className="font-medium text-foreground-700">
                      <strong>PF Impact:</strong> {lazyStats.realizedPfImpact.toFixed(2)}%
                    </div>
                    <div className="text-foreground-400 text-xs">
                      This is the % of your portfolio that is realized as profit/loss.
                    </div>
                    <div className="text-warning-600 mt-1 text-xs">
                      <strong>Accounting Method:</strong> {useCashBasis ? 'Cash Basis' : 'Accrual Basis'}
                    </div>
                    <div className="text-xs text-foreground-400">
                      {useCashBasis
                        ? "P/L attributed to exit dates"
                        : "P/L attributed to entry dates"
                      }
                    </div>
                  </div>

                  {breakdown.length > 0 ? (
                    <div>
                      <div className="text-xs font-medium text-foreground-600 mb-2 border-b border-divider pb-1">
                        Top Realized Trades:
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {breakdown.slice(0, 10).map((t, idx) => ( // Show top 10
                          <div key={`${t.name}-${idx}`} className="flex justify-between items-center text-xs">
                            <span className="truncate max-w-[100px]" title={t.name}>
                              {t.name}
                            </span>
                            <div className="flex flex-col items-end ml-2">
                              <span className={`font-mono font-medium ${
                                t.realizedPL >= 0 ? 'text-success' : 'text-danger'
                              }`}>
                                {formatCurrency(t.realizedPL)}
                              </span>
                              <span className={`font-mono text-xs ${
                                t.pfImpact >= 0 ? 'text-success' : 'text-danger'
                              }`}>
                                ({t.pfImpact >= 0 ? '+' : ''}{t.pfImpact.toFixed(2)}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {breakdown.length > 10 && (
                        <div className="text-xs text-foreground-400 mt-2 pt-1 border-t border-divider">
                          Showing top 10 of {breakdown.length} realized trades
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-foreground-400 text-xs">No realized trades</div>
                  )}
                </div>
              );
            })()}
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer inline-block align-middle ml-2" />
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <StatsCard
            title="Unrealized P/L"
            value={formatCurrency(lazyStats.totalUnrealizedPL)}
            icon="lucide:indian-rupee"
            color={lazyStats.totalUnrealizedPL >= 0 ? "success" : "danger"}
          />
          <Tooltip
            placement="top"
            className="max-w-xs text-xs p-1 bg-content1 border border-divider"
            content={(() => {

              const openTrades = trades.filter(t => (t.positionStatus === 'Open' || t.positionStatus === 'Partial'));
              const breakdown = openTrades
                .map(t => {
                  const unrealizedPL = calcUnrealizedPL(t.avgEntry, t.cmp, t.openQty, t.buySell);
                  return {
                    name: t.name || 'N/A',
                    unrealizedPL: unrealizedPL
                  };
                })
                .filter(t => Math.abs(t.unrealizedPL) > 0.01) // Filter out negligible amounts
                .sort((a, b) => b.unrealizedPL - a.unrealizedPL); // Sort by P/L value (highest first)

              return (
                <div>
                  <div className="mb-2 font-medium text-foreground-700">This is the % of your portfolio that is currently (unrealized).</div>
                  {breakdown.length > 0 ? (
                    <ul className="space-y-1">
                      {breakdown.map((t, idx) => (
                        <li key={`${t.name}-unrealized-${idx}`} className="flex justify-between">
                          <span>{t.name}</span>
                          <span className={`font-mono ${t.unrealizedPL >= 0 ? 'text-success' : 'text-danger'}`}>
                            {formatCurrency(t.unrealizedPL)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-foreground-400">No unrealized positions</div>
                  )}
                </div>
              );
            })()}
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer inline-block align-middle ml-2" />
          </Tooltip>
        </div>
        <div className="flex items-center gap-1">
          <StatsCard
            title="Open Heat"
            value={`${lazyStats.openHeat.toFixed(2)}%`}
            icon="lucide:flame"
            color="warning"
          />
          <Tooltip
            placement="top"
            className="max-w-xs text-xs p-1 bg-content1 border border-divider"
            content={(() => {
              const openTrades = trades.filter(t => (t.positionStatus === 'Open' || t.positionStatus === 'Partial'));
              const breakdown = openTrades
                .map(t => ({
                  name: t.name || 'N/A',
                  risk: calcTradeOpenHeat(t, portfolioSize, getPortfolioSize)
                }))
                .filter(t => t.risk > 0)
                .sort((a, b) => b.risk - a.risk);
              return (
                <div>
                  <div className="mb-2 font-medium text-foreground-700">This is the % of your portfolio you will lose if all initial stops/TSLs are hit on your open/partial positions.</div>
                  {breakdown.length > 0 ? (
                    <ul className="space-y-1">
                      {breakdown.map((t, idx) => (
                        <li key={`${t.name}-risk-${idx}`} className="flex justify-between">
                          <span>{t.name}</span>
                          <span className="font-mono">{t.risk.toFixed(2)}%</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-foreground-400">No open risk</div>
                  )}
                </div>
              );
            })()}
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer inline-block align-middle" />
          </Tooltip>
        </div>
      </div>

      {/* Background recalculation and stats loading indicators */}
      <AnimatePresence>
        {(isRecalculating || !statsLoaded) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg"
          >
            <Icon icon="lucide:calculator" className="text-primary animate-pulse" />
            <span className="text-sm text-primary font-medium">
              {isRecalculating
                ? "Recalculating trade metrics in background..."
                : "Loading statistics..."
              }
            </span>
            <CircularLoader size={16} color="text-primary" />
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="border border-divider">
        <CardBody className="p-0">
          {/* Show empty state outside the scrollable table when no items */}
          {!isLoading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center min-h-[400px]">
              <div className="text-default-400 mb-2">
                <Icon
                  icon={trades.length === 0 ? "lucide:inbox" : "lucide:search-x"}
                  className="w-16 h-16 mx-auto mb-4 opacity-50"
                />
              </div>
              <div className="text-default-500 text-xl font-medium mb-2">
                {trades.length === 0 ? "No trades found" : "No matching trades"}
              </div>
              <div className="text-default-400 text-base mb-6">
                {trades.length === 0
                  ? "Add your first trade to get started"
                  : "Try adjusting your search or filter criteria"
                }
              </div>
              {trades.length === 0 && (
                <Button
                  color="primary"
                  variant="shadow"
                  size="sm"
                  onPress={handleAddNewBlankTrade}
                  startContent={<Icon icon="lucide:plus" className="w-4 h-4" />}
                  className="font-medium px-4 py-1.5 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 transition-all duration-300 shadow-lg shadow-primary/25 border-0 text-white rounded-full"
                >
                  Add Your First Trade
                </Button>
              )}
            </div>
          ) : (
            <div
              className="relative overflow-auto max-h-[70vh]
                [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-1
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb:hover]:bg-gray-400
                dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-500"
              style={{
                scrollbarWidth: 'thin', /* Firefox - thin horizontal only */
                scrollbarColor: 'rgb(156 163 175) transparent' /* Firefox - thumb and track colors */
              }}
            >
            <Table
              aria-label="Trade journal table"
            bottomContent={
              shouldUseProgressiveLoading ? (
                // Progressive loading controls for large datasets
                <div className="flex w-full justify-center items-center gap-4 py-4">
                  {loadedTradesCount < processedTrades.length ? (
                    <Button
                      color="primary"
                      variant="flat"
                      size="sm"
                      onPress={loadMoreTrades}
                      isLoading={isLoadingMore}
                      startContent={!isLoadingMore && <Icon icon="lucide:chevron-down" />}
                      className="min-w-[120px]"
                    >
                      {isLoadingMore ? 'Loading...' : `Load More (${processedTrades.length - loadedTradesCount} remaining)`}
                    </Button>
                  ) : (
                    <div className="text-sm text-default-500">
                      All {processedTrades.length} trades loaded
                    </div>
                  )}
                </div>
              ) : pages > 0 ? (
                // Traditional pagination for smaller datasets
                <div className="flex w-full justify-between items-center gap-4 py-2 px-4">
                  {/* Rows per page selector */}
                  <div className="flex items-center gap-2 text-sm text-default-500">
                    <span>Rows per page:</span>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          size="sm"
                          variant="bordered"
                          className="min-w-[60px] h-7"
                          endContent={<Icon icon="lucide:chevron-down" className="w-3 h-3" />}
                        >
                          {rowsPerPage}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="Rows per page"
                        selectionMode="single"
                        selectedKeys={[String(rowsPerPage)]}
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as string;
                          const newRowsPerPage = Number(selected);
                          setRowsPerPage(newRowsPerPage);
                          setPage(1); // Reset to first page
                          // localStorage persistence is handled by the useEffect hook
                        }}
                      >
                        {rowsPerPageOptions.map(option => (
                          <DropdownItem key={String(option)}>{option}</DropdownItem>
                        ))}
                      </DropdownMenu>
                    </Dropdown>
                  </div>

                  {/* Pagination */}
                  <Pagination
                    isCompact
                    showControls
                    showShadow={false}
                    color="primary"
                    size="sm"
                    variant="light"
                    page={page}
                    total={pages}
                    onChange={handlePageChange}
                    classNames={{
                      item: "rounded-full w-5 h-5 text-xs flex items-center justify-center",
                      cursor: "rounded-full w-5 h-5 text-xs flex items-center justify-center",
                      prev: "rounded-full w-5 h-5 text-xs flex items-center justify-center",
                      next: "rounded-full w-5 h-5 text-xs flex items-center justify-center",
                      ellipsis: "px-0.5 text-xs"
                    }}
                  />

                  {/* Trade count info */}
                  <div className="text-sm text-default-500">
                    {`${((page - 1) * rowsPerPage) + 1}-${Math.min(page * rowsPerPage, processedTrades.length)} of ${processedTrades.length}`}
                  </div>
                </div>
              ) : null
            }
              classNames={{
                base: "min-w-full",
                wrapper: "shadow-none p-0 rounded-none",
                table: "table-auto",
                thead: "[&>tr]:first:shadow-none",
                th: "bg-default-100 dark:bg-gray-950 text-foreground-600 dark:text-white text-xs font-medium uppercase border-b border-default-200 dark:border-gray-800 sticky top-0 z-20 backdrop-blur-sm",
                td: "py-2.5 text-sm border-b border-default-200 dark:border-gray-800 text-foreground-800 dark:text-gray-200"
              }}
              removeWrapper
            sortDescriptor={sortDescriptor as HeroSortDescriptor}
            onSortChange={setSortDescriptor as (descriptor: HeroSortDescriptor) => void}
          >
            <TableHeader columns={headerColumns}>
              {(column) => (
                <TableColumn 
                  key={column.key} 
                  align={column.key === "actions" ? "end" : "start"}
                  allowsSorting={column.sortable}
                >
                  {column.label}
                </TableColumn>
              )}
            </TableHeader>
            <TableBody
              items={items}
              isLoading={isLoading}
              emptyContent={isLoading ? " " : ""}
            >
              {(item, index) => (
                <TableRow
                  key={item.id || `trade-${index}`}
                  className="hover:bg-default-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                >
                  {headerColumns.map((column) => (
                    <TableCell key={`${item.id || `trade-${index}`}-${column.key}`}>
                      {renderCell(item, column.key)}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
            </Table>
            {/* Sleek, small add inline trade icon below the table - only show when there are trades */}
            {items.length > 0 && (
              <div className="p-2 border-t border-divider bg-white dark:bg-gray-900">
                <Tooltip content="Add new trade (inline)" placement="top">
                  <Button
                    isIconOnly
                    color="primary"
                    variant="light"
                    onPress={handleAddNewBlankTrade}
                    size="sm"
                    className="mx-auto block"
                  >
                    <Icon icon="lucide:list-plus" className="text-lg" />
                  </Button>
                </Tooltip>
              </div>
            )}
            </div>
          )}
        </CardBody>
      </Card>

      <AnimatePresence>
        {isAddOpen && (
          <TradeModal
            isOpen={isAddOpen}
            onOpenChange={onAddOpenChange}
            onSave={handleAddTrade}
            mode="add"
            symbol={searchQuery} // Pass the search query as the initial symbol
          />
        )}

        {selectedTrade && (
          <>
            <TradeModal
              isOpen={isEditOpen}
              onOpenChange={onEditOpenChange}
              trade={selectedTrade}
              onSave={handleUpdateTrade}
              mode="edit"
              symbol={selectedTrade?.name || ''}
            />

            <DeleteConfirmModal
              isOpen={isDeleteOpen}
              onOpenChange={onDeleteOpenChange}
              onDelete={handleDeleteConfirm}
              tradeName={selectedTrade.name}
            />
          </>
        )}

        <TradeUploadModal
          isOpen={isUploadOpen}
          onOpenChange={onUploadOpenChange}
          onImport={handleImportTrades}
          portfolioSize={portfolioSize}
          getPortfolioSize={getPortfolioSize}
        />
      </AnimatePresence>
    </div>
  );
});

interface StatsCardProps {
  title: string;
  value: string;
  icon: string;
  color: "primary" | "success" | "warning" | "danger";
  isLoading?: boolean;
}

// Smooth circular loading animation component
const CircularLoader: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "text-gray-400" }) => (
  <>
    <style>{`
      @keyframes circular-dash {
        0% {
          stroke-dasharray: 1, 150;
          stroke-dashoffset: 0;
        }
        50% {
          stroke-dasharray: 90, 150;
          stroke-dashoffset: -35;
        }
        100% {
          stroke-dasharray: 90, 150;
          stroke-dashoffset: -124;
        }
      }
      .circular-loader {
        animation: spin 2s linear infinite, circular-dash 1.5s ease-in-out infinite;
      }
    `}</style>
    <div className="flex items-center justify-center">
      <svg
        className={color}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="opacity-25"
        />
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="31.416"
          strokeDashoffset="23.562"
          className="opacity-75 circular-loader"
        />
      </svg>
    </div>
  </>
);

// Lazy loading stats card with smooth circular loading animation
const LazyStatsCard: React.FC<StatsCardProps & { isLoading?: boolean }> = React.memo(function LazyStatsCard({
  title,
  value,
  icon,
  color,
  isLoading = false
}) {
  const getColors = () => {
    switch (color) {
      case "primary":
        return {
          bg: "bg-blue-50 dark:bg-blue-900/10",
          text: "text-blue-700 dark:text-blue-400",
          icon: "text-blue-600 dark:text-blue-400",
          loader: "text-blue-500"
        };
      case "success":
        return {
          bg: "bg-emerald-50 dark:bg-emerald-900/10",
          text: "text-emerald-700 dark:text-emerald-400",
          icon: "text-emerald-600 dark:text-emerald-400",
          loader: "text-emerald-500"
        };
      case "warning":
        return {
          bg: "bg-amber-50 dark:bg-amber-900/10",
          text: "text-amber-700 dark:text-amber-400",
          icon: "text-amber-600 dark:text-amber-400",
          loader: "text-amber-500"
        };
      case "danger":
        return {
          bg: "bg-red-50 dark:bg-red-900/10",
          text: "text-red-700 dark:text-red-400",
          icon: "text-red-600 dark:text-red-400",
          loader: "text-red-500"
        };
      default:
        return {
          bg: "bg-gray-50 dark:bg-gray-900/10",
          text: "text-gray-700 dark:text-gray-400",
          icon: "text-gray-600 dark:text-gray-400",
          loader: "text-gray-500"
        };
    }
  };

  const colors = getColors();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900">
        <CardBody className="p-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                {title}
              </p>
              {isLoading ? (
                <div className="flex items-center gap-3">
                  <div className="w-20 h-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  <CircularLoader size={18} color={colors.loader} />
                </div>
              ) : (
                <motion.p
                  className={`text-2xl font-semibold tracking-tight ${colors.text}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {value}
                </motion.p>
              )}
            </div>
            <div className={`p-3 rounded-xl ${colors.bg} ${colors.icon}`}>
              <Icon icon={icon} className="text-xl" />
            </div>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
});

// Keep the original StatsCard for simple stats that don't need lazy loading
const StatsCard: React.FC<StatsCardProps> = React.memo(function StatsCard({ title, value, icon, color }) {
  const getColors = () => {
    switch (color) {
      case "primary":
        return {
          bg: "bg-blue-50 dark:bg-blue-900/10",
          text: "text-blue-700 dark:text-blue-400",
          icon: "text-blue-600 dark:text-blue-400"
        };
      case "success":
        return {
          bg: "bg-emerald-50 dark:bg-emerald-900/10",
          text: "text-emerald-700 dark:text-emerald-400",
          icon: "text-emerald-600 dark:text-emerald-400"
        };
      case "warning":
        return {
          bg: "bg-amber-50 dark:bg-amber-900/10",
          text: "text-amber-700 dark:text-amber-400",
          icon: "text-amber-600 dark:text-amber-400"
        };
      case "danger":
        return {
          bg: "bg-red-50 dark:bg-red-900/10",
          text: "text-red-700 dark:text-red-400",
          icon: "text-red-600 dark:text-red-400"
        };
      default:
        return {
          bg: "bg-gray-50 dark:bg-gray-900/10",
          text: "text-gray-700 dark:text-gray-400",
          icon: "text-gray-600 dark:text-gray-400"
        };
    }
  };

  const colors = getColors();

  return (
    <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900">
      <CardBody className="p-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {title}
            </p>
            <p className={`text-2xl font-semibold tracking-tight ${colors.text}`}>
              {value}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${colors.bg} ${colors.icon}`}>
            <Icon icon={icon} className="text-xl" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
});

interface EditableCellProps {
  value: string | number;
  onSave: (value: string | number) => void;
  type?: "text" | "number" | "price" | "date" | "select";
  colorValue?: boolean;
  min?: number;
  max?: number;
  options?: string[];
}

const EditableCell: React.FC<EditableCellProps> = React.memo(function EditableCell({
  value,
  onSave,
  type = "text",
  colorValue = false,
  min,
  max,
  options
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  
  // Format date as dd-mm-yyyy for display and editing
  const formatDateForDisplay = (dateStr: string) => {
    try {
      if (!dateStr || dateStr.trim() === '') return '';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');
    } catch (e) {
      return '';
    }
  };

  // Convert dd-mm-yyyy to yyyy-mm-dd for the native date input
  const convertToISODate = (displayDate: string) => {
    try {
      if (!displayDate || displayDate.trim() === '') return '';
      const parts = displayDate.split('-');
      if (parts.length !== 3) return '';
      const [day, month, year] = parts;
      if (!day || !month || !year || day === 'undefined' || month === 'undefined' || year === 'undefined') return '';
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch (e) {
      return '';
    }
  };

  // Convert yyyy-mm-dd to ISO string
  const convertToFullISO = (dateStr: string) => {
    try {
      return new Date(dateStr).toISOString();
    } catch (e) {
      return '';
    }
  };

  const getInitialEditValue = React.useCallback(() => {
    if (type === 'date') {
      if (!value || value === '' || value === null || value === undefined) {
        return '';
      }
      return formatDateForDisplay(value as string);
    }
    return String(value ?? '');
  }, [type, value]);

  const [editValue, setEditValue] = React.useState(() => getInitialEditValue());
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  React.useEffect(() => {
    setEditValue(getInitialEditValue());
  }, [getInitialEditValue]);

  const handleSave = () => {
    setIsEditing(false);
    if (type === "number" || type === "price") {
      onSave(Number(editValue));
    } else if (type === "date") {
      if (editValue) {
        // Convert the dd-mm-yyyy to ISO string
        const isoDate = convertToFullISO(convertToISODate(editValue));
        onSave(isoDate);
      } else {
        onSave("");
      }
    } else {
      onSave(editValue);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isoDate = e.target.value; // yyyy-mm-dd
    if (isoDate) {
      const displayDate = formatDateForDisplay(isoDate);
      setEditValue(displayDate);
      onSave(convertToFullISO(isoDate));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(String(value));
    }
  };

  const getValueColor = () => {
    if (!colorValue || type !== "price") return "";
    const numValue = Number(value);
    return numValue < 0 ? "text-danger" : numValue > 0 ? "text-success" : "";
  };

  const handleFocus = () => {
    // Don't allow editing if CMP was auto-fetched
    if (!isEditing && !isAutoFetched) {
      setIsEditing(true);
    }
  };

  const inputTypeForHero = (): "text" | "number" | "date" => {
    if (type === "price") return "number";
    if (type === "select") return "text";
    return type as "text" | "number" | "date";
  };

  return (
    <motion.div
      className="relative"
      initial={false}
      animate={{ height: "auto" }}
      transition={{ duration: 0.2 }}
    >
      <AnimatePresence mode="wait">
        {type === "date" ? (
          <input
            type="date"
            className="h-7 px-2 rounded-md border border-divider bg-content1 dark:bg-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 hover:bg-content2 dark:hover:bg-gray-800 transition-colors cursor-pointer w-[130px]"
            value={convertToISODate(editValue)}
            onChange={handleDateChange}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {isEditing ? (
              <Input
                ref={inputRef}
                type={inputTypeForHero()}
                value={editValue}
                onValueChange={setEditValue}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                size="sm"
                variant="bordered"
                classNames={{
                  base: "w-full max-w-[160px]",
                  input: "text-right font-medium text-small py-0 dark:text-white",
                  inputWrapper: "h-7 min-h-unit-7 bg-content1 dark:bg-gray-900 shadow-sm"
                }}
                startContent={type === "price" && <span className="text-default-400 dark:text-gray-400 text-small">₹</span>}
                step={type === "price" ? "0.05" : undefined}
                min={min !== undefined ? min : (type === "price" ? 0 : undefined)}
                max={max !== undefined ? max : undefined}
              />
            ) : (
              <motion.div
                className="py-1 px-2 rounded-md cursor-text hover:bg-content2 dark:hover:bg-gray-800 transition-colors w-full max-w-[160px] dark:bg-gray-900 dark:text-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setEditValue(String(value));
                  setIsEditing(true);
                }}
                tabIndex={0}
                onFocus={handleFocus}
              >
                <div className="flex items-center gap-1">
                  {type === "price" && <span className="text-default-400 dark:text-gray-400 text-small">₹</span>}
                  <span className={`font-medium text-small ${getValueColor()}`}>
                    {type === "price" ? formatCurrency(value as number) : String(value)}
                  </span>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

interface StockCellProps {
  name: string;
  setup: string;
  onSave: (field: "name" | "setup", value: string | number) => void;
}

const StockCell: React.FC<StockCellProps> = ({ name, setup, onSave }) => {
  return (
    <div className="flex flex-col gap-1">
      <div className="max-w-[200px]">
        <EditableCell
          value={name}
          onSave={(value) => onSave("name", value)}
        />
      </div>
    </div>
  );
};

interface BuySellCellProps {
  value: "Buy" | "Sell";
  onSave: (value: "Buy" | "Sell") => void;
}

const BuySellCell: React.FC<BuySellCellProps> = React.memo(function BuySellCell({ value, onSave }) {
  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          size="sm"
          variant={value === "Buy" ? "flat" : "bordered"}
          color={value === "Buy" ? "success" : "danger"}
          className="min-w-[80px] h-7"
          endContent={<Icon icon="lucide:chevron-down" className="w-3.5 h-3.5" />}
        >
          {value}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Buy/Sell selection"
        selectionMode="single"
        selectedKeys={[value]}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as "Buy" | "Sell";
          onSave(selected);
        }}
      >
        <DropdownItem key="Buy">Buy</DropdownItem>
        <DropdownItem key="Sell">Sell</DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
});

interface PositionStatusCellProps {
  value: "Open" | "Closed" | "Partial";
  onSave: (value: "Open" | "Closed" | "Partial") => void;
}

const PositionStatusCell: React.FC<PositionStatusCellProps> = React.memo(function PositionStatusCell({ value, onSave }) {
  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          size="sm"
          variant="flat"
          color={
            value === "Open" ? "primary" :
            value === "Closed" ? "success" : "warning"
          }
          className="min-w-[90px] h-7 capitalize"
          endContent={<Icon icon="lucide:chevron-down" className="w-3.5 h-3.5" />}
        >
          {value}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Position status selection"
        selectionMode="single"
        selectedKeys={[value]}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as "Open" | "Closed" | "Partial";
          onSave(selected);
        }}
      >
        <DropdownItem key="Open">Open</DropdownItem>
        <DropdownItem key="Closed">Closed</DropdownItem>
        <DropdownItem key="Partial">Partial</DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
});

interface ProficiencyGrowthAreasCellProps {
  value: string;
  onSave: (value: string) => void;
}

const PROFICIENCY_GROWTH_AREAS = [
  'Booked Early',
  "Didn't Book Loss",
  'FOMO',
  'Illiquid Stock',
  'Illogical SL',
  'Lack of Patience',
  'Late Entry',
  'Momentum-less stock',
  'Overconfidence',
  'Overtrading',
  'Poor Exit',
  'Poor Po Size',
  'Poor Sector',
  'Poor Stock',
  'Shifted SL Suickly',
  'Too Early Entry',
  'Too Tight SL'
];
const GROWTH_AREAS_LOCAL_KEY = 'custom_growth_areas_options';

const ProficiencyGrowthAreasCell: React.FC<ProficiencyGrowthAreasCellProps> = React.memo(function ProficiencyGrowthAreasCell({ value, onSave }) {
  const [customOptions, setCustomOptions] = React.useState<string[]>([]);
  const allOptions = React.useMemo(() => [...PROFICIENCY_GROWTH_AREAS, ...customOptions], [customOptions]);

  React.useEffect(() => {
    const stored = fetchMiscData(GROWTH_AREAS_LOCAL_KEY);
    if (stored && Array.isArray(stored)) {
      setCustomOptions(stored.filter(o => !PROFICIENCY_GROWTH_AREAS.includes(o)));
    }
  }, []);

  const handleAddOption = (newValue: string) => {
    if (newValue && !allOptions.some(o => o.toLowerCase() === newValue.toLowerCase())) {
      const newCustomOptions = [...customOptions, newValue];
      setCustomOptions(newCustomOptions);
      saveMiscData(GROWTH_AREAS_LOCAL_KEY, newCustomOptions);
      onSave(newValue);
    } else if (newValue) { // If it's an existing option, just select it
      onSave(newValue);
    }
  };

  const handleDeleteCustomOption = (optionToDelete: string) => {
    if (window.confirm(`Are you sure you want to delete "${optionToDelete}"?`)) {
      const updatedCustomOptions = customOptions.filter(o => o !== optionToDelete);
      setCustomOptions(updatedCustomOptions);
      saveMiscData(GROWTH_AREAS_LOCAL_KEY, updatedCustomOptions);
      // If the currently selected value is the one being deleted, clear it
      if (value === optionToDelete) {
        onSave(''); // Clear the selected value
      }
    }
  };

  const handleSelect = (selected: string) => {
    if (selected === '__add_new__') {
      const newValue = window.prompt('Enter new growth area:');
      if (newValue) {
        handleAddOption(newValue);
      }
    } else {
      onSave(selected);
    }
  };

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button size="sm" variant="flat" color="default" className="min-w-[180px] h-7 justify-between"
          endContent={<Icon icon="lucide:chevron-down" className="w-3.5 h-3.5" />}
        >
          {value || <span className="text-default-400">Select Growth Area</span>}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Growth areas selection"
        selectionMode="single"
        selectedKeys={value ? [value] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          handleSelect(selected);
        }}
      >
        {allOptions
          .map((area) => (
            <DropdownItem key={area} textValue={area}>
              <div className="flex items-center gap-1 w-full">
                <span>{area}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  className="min-w-unit-4 w-4 h-4 p-0"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onPress={() => {
                    handleDeleteCustomOption(area);
                  }}
                  aria-label={`Delete ${area}`}
                >
                  <Icon icon="lucide:trash-2" className="w-2.5 h-2.5" />
                </Button>
              </div>
            </DropdownItem>
          ))
          .concat([
            <DropdownItem key="__add_new__" className="text-primary">
              <span className="flex items-center gap-1">
                <Icon icon="lucide:plus" className="w-4 h-4" /> Add new growth area...
              </span>
            </DropdownItem>
          ])}
      </DropdownMenu>
    </Dropdown>
  );
});

interface NameCellProps {
  value: string;
  onSave: (value: string) => void;
}

const NameCell: React.FC<NameCellProps> = React.memo(function NameCell({ value, onSave }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [filtered, setFiltered] = React.useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Move stockNames state and effect here
  const [stockNames, setStockNames] = React.useState<string[]>([]);
  React.useEffect(() => {
    async function loadStockNames() {
      const response = await fetch(csvUrl);
      const csvText = await response.text();
      const Papa = (await import('papaparse')).default;
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const names = (results.data as any[]).map(row => row['Stock Name']).filter(Boolean);
          setStockNames(names);
        }
      });
    }
    loadStockNames();
  }, []);

  // Function to find closest matching stock name
  const findClosestMatch = (input: string): string | null => {
    if (!input || !stockNames.length) return null;
    
    const inputLower = input.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    // First try exact prefix match
    const exactPrefixMatch = stockNames.find(name => 
      name.toLowerCase().startsWith(inputLower)
    );
    if (exactPrefixMatch) return exactPrefixMatch;

    // Then try contains match
    const containsMatch = stockNames.find(name => 
      name.toLowerCase().includes(inputLower)
    );
    if (containsMatch) return containsMatch;

    // Finally try fuzzy match
    for (const name of stockNames) {
      const nameLower = name.toLowerCase();
      let score = 0;
      let inputIndex = 0;

      // Calculate similarity score
      for (let i = 0; i < nameLower.length && inputIndex < inputLower.length; i++) {
        if (nameLower[i] === inputLower[inputIndex]) {
          score++;
          inputIndex++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = name;
      }
    }

    // Only return match if it's reasonably similar
    return bestScore > (inputLower.length / 2) ? bestMatch : null;
  };

  React.useEffect(() => {
    if (isEditing && editValue) {
      const matches = stockNames.filter(n => 
        n.toLowerCase().includes(editValue.toLowerCase())
      );
      setFiltered(matches.slice(0, 10));
      setShowDropdown(matches.length > 0);
      setSelectedIndex(-1);
    } else {
      setShowDropdown(false);
    }
  }, [editValue, isEditing, stockNames]);

  const handleSave = (val?: string) => {
    const finalValue = val ?? editValue;

    // Allow empty values to be saved (clearing the field)
    if (!finalValue.trim()) {
      onSave(''); // Save empty string
      setIsEditing(false);
      setShowDropdown(false);
      setSelectedIndex(-1);
      return;
    }

    // Check if the value exists in stockNames
    const exactMatch = stockNames.find(
      name => name.toLowerCase() === finalValue.toLowerCase()
    );

    if (exactMatch) {
      onSave(exactMatch); // Use the exact case from database
    } else {
      // Try to find closest match
      const closestMatch = findClosestMatch(finalValue);
      if (closestMatch) {
        const confirmed = window.confirm(
          `"${finalValue}" not found. Did you mean "${closestMatch}"?`
        );
        if (confirmed) {
          onSave(closestMatch);
        } else {
          // Revert to previous value if user declines suggestion
           setEditValue(value);
        }
      } else {
         const addNew = window.confirm(`"${finalValue}" is not a valid stock name. Do you want to add it?`);
         if(addNew){
          onSave(finalValue.toUpperCase());
         } else {
          setEditValue(value); // Revert to previous value
         }
      }
    }
    setIsEditing(false);
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  // Scroll selected item into view
  React.useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const selectedElement = document.getElementById(`stock-suggestion-${selectedIndex}`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ 
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev + 1;
          return next >= filtered.length ? 0 : next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev - 1;
          return next < 0 ? filtered.length - 1 : next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSave(filtered[selectedIndex]);
        } else if (filtered.length === 1) {
          handleSave(filtered[0]);
        } else {
          handleSave();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
      case 'Tab':
        if (selectedIndex >= 0) {
          e.preventDefault();
          handleSave(filtered[selectedIndex]);
        }
        break;
    }
  };

  if (isEditing) {
    return (
      <div className="relative min-w-[220px]">
        <input
          ref={inputRef}
          type="text"
          className="w-full min-w-[220px] px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => setTimeout(() => handleSave(), 100)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute z-10 left-0 right-0 min-w-[220px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow max-h-48 overflow-y-auto overflow-x-auto mt-1"
            role="listbox"
            tabIndex={-1}
          >
            {filtered.map((name, i) => (
              <div
                key={name}
                id={`stock-suggestion-${i}`}
                role="option"
                aria-selected={i === selectedIndex}
                className={`px-3 py-1.5 text-sm cursor-pointer whitespace-nowrap ${
                  i === selectedIndex
                    ? 'bg-blue-100 dark:bg-blue-900'
                    : 'hover:bg-blue-50 dark:hover:bg-blue-800'
                }`}
                onMouseDown={() => handleSave(name)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {name}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-text"
      onClick={() => setIsEditing(true)}
    >
      {value || <span className="text-gray-400">Stock name</span>}
    </div>
  );
});

interface SetupCellProps {
  value: string;
  onSave: (value: string) => void;
}

const SETUP_OPTIONS = [
  'ITB',
  'Chop BO',
  'IPO Base',
  '3/5/8',
  '21/50',
  'Breakout',
  'Pullback',
  'Reversal',
  'Continuation',
  'Gap Fill',
  'OTB',
  'Stage 2',
  'ONP BO',
  'EP',
  'Pivot Bo',
  'Cheat',
  'Flag',
  'Other'
];
const SETUP_LOCAL_KEY = 'custom_setup_options';

const SetupCell: React.FC<SetupCellProps> = React.memo(function SetupCell({ value, onSave }) {
  const [customOptions, setCustomOptions] = React.useState<string[]>([]);
  const allOptions = React.useMemo(() => [...SETUP_OPTIONS, ...customOptions], [customOptions]);

  React.useEffect(() => {
    const stored = fetchMiscData(SETUP_LOCAL_KEY);
    if (stored && Array.isArray(stored)) {
      setCustomOptions(stored.filter(o => !SETUP_OPTIONS.includes(o)));
    }
  }, []);

  const handleAddOption = (newValue: string) => {
    if (newValue && !allOptions.some(o => o.toLowerCase() === newValue.toLowerCase())) {
      const newCustomOptions = [...customOptions, newValue];
      setCustomOptions(newCustomOptions);
      saveMiscData(SETUP_LOCAL_KEY, newCustomOptions);
      onSave(newValue);
    } else if (newValue) { // If it's an existing option, just select it
      onSave(newValue);
    }
  };

  const handleDeleteCustomOption = (optionToDelete: string) => {
    if (window.confirm(`Are you sure you want to delete "${optionToDelete}"?`)) {
      const updatedCustomOptions = customOptions.filter(o => o !== optionToDelete);
      setCustomOptions(updatedCustomOptions);
      saveMiscData(SETUP_LOCAL_KEY, updatedCustomOptions);
      if (value === optionToDelete) {
        onSave('');
      }
    }
  };

  const handleSelect = (selected: string) => {
    if (selected === '__add_new__') {
      const newValue = window.prompt('Enter new setup:');
      if (newValue) {
        handleAddOption(newValue);
      }
    } else {
      onSave(selected);
    }
  };

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button size="sm" variant="flat" color="primary" className="min-w-[120px] h-7 justify-between"
          endContent={<Icon icon="lucide:chevron-down" className="w-3.5 h-3.5" />}
        >
          {value || <span className="text-default-400">Setup</span>}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Setup type selection"
        selectionMode="single"
        selectedKeys={value ? [value] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          handleSelect(selected);
        }}
      >
        {allOptions
          .map((option) => (
            <DropdownItem key={option} textValue={option}>
              <div className="flex items-center gap-1 w-full">
                <span>{option}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  className="min-w-unit-4 w-4 h-4 p-0"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onPress={() => {
                    handleDeleteCustomOption(option);
                  }}
                  aria-label={`Delete ${option}`}
                >
                  <Icon icon="lucide:trash-2" className="w-2.5 h-2.5" />
                </Button>
              </div>
            </DropdownItem>
          ))
          .concat([
            <DropdownItem key="__add_new__" className="text-primary">
              <span className="flex items-center gap-1">
                <Icon icon="lucide:plus" className="w-4 h-4" /> Add new setup...
              </span>
            </DropdownItem>
          ])}
      </DropdownMenu>
    </Dropdown>
  );
});

interface ExitTriggerCellProps {
  value: string;
  onSave: (value: string) => void;
}

const EXIT_TRIGGER_OPTIONS = [
  'Breakeven exit',
  'Market Pressure',
  'R multiples',
  'Random',
  'SL',
  'Target',
  'Trailing SL exit',
  "Broke key MA's",
  'Panic sell',
  'Early sell off',
  'Failed BO'
];
const EXIT_TRIGGER_LOCAL_KEY = 'custom_exit_trigger_options';

const ExitTriggerCell: React.FC<ExitTriggerCellProps> = React.memo(function ExitTriggerCell({ value, onSave }) {
  const [customOptions, setCustomOptions] = React.useState<string[]>([]);
  const allOptions = React.useMemo(() => [...EXIT_TRIGGER_OPTIONS, ...customOptions], [customOptions]);

  React.useEffect(() => {
    const stored = fetchMiscData(EXIT_TRIGGER_LOCAL_KEY);
    if (stored && Array.isArray(stored)) {
      setCustomOptions(stored.filter(o => !EXIT_TRIGGER_OPTIONS.includes(o)));
    }
  }, []);

  const handleAddOption = (newValue: string) => {
    if (newValue && !allOptions.some(o => o.toLowerCase() === newValue.toLowerCase())) {
      const newCustomOptions = [...customOptions, newValue];
      setCustomOptions(newCustomOptions);
      saveMiscData(EXIT_TRIGGER_LOCAL_KEY, newCustomOptions);
      onSave(newValue);
    } else if (newValue) { // If it's an existing option, just select it
      onSave(newValue);
    }
  };

  const handleDeleteCustomOption = (optionToDelete: string) => {
    if (window.confirm(`Are you sure you want to delete "${optionToDelete}"?`)) {
      const updatedCustomOptions = customOptions.filter(o => o !== optionToDelete);
      setCustomOptions(updatedCustomOptions);
      saveMiscData(EXIT_TRIGGER_LOCAL_KEY, updatedCustomOptions);
      if (value === optionToDelete) {
        onSave('');
      }
    }
  };

  const handleSelect = (selected: string) => {
    if (selected === '__add_new__') {
      const newValue = window.prompt('Enter new exit trigger:');
      if (newValue) {
        handleAddOption(newValue);
      }
    } else {
      onSave(selected);
    }
  };

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button size="sm" variant="flat" color="default" className="min-w-[150px] h-7 justify-between"
          endContent={<Icon icon="lucide:chevron-down" className="w-3.5 h-3.5" />}
        >
          {value || <span className="text-default-400">Select Exit Trigger</span>}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Exit trigger selection"
        selectionMode="single"
        selectedKeys={value ? [value] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          handleSelect(selected);
        }}
      >
        {allOptions
          .map((option) => (
            <DropdownItem key={option} textValue={option}>
              <div className="flex items-center gap-1 w-full">
                <span>{option}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  className="min-w-unit-4 w-4 h-4 p-0"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onPress={() => {
                    handleDeleteCustomOption(option);
                  }}
                  aria-label={`Delete ${option}`}
                >
                  <Icon icon="lucide:trash-2" className="w-2.5 h-2.5" />
                </Button>
              </div>
            </DropdownItem>
          ))
          .concat([
            <DropdownItem key="__add_new__" className="text-primary">
              <span className="flex items-center gap-1">
                <Icon icon="lucide:plus" className="w-4 h-4" /> Add new exit trigger...
              </span>
            </DropdownItem>
          ])}
      </DropdownMenu>
    </Dropdown>
  );
});

interface PlanFollowedCellProps {
  value: boolean;
  onSave: (value: boolean) => void;
}

const PlanFollowedCell: React.FC<PlanFollowedCellProps> = ({ value, onSave }) => {
  const displayValue = value ? "Yes" : "No";
  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          size="sm"
          variant="flat"
          color={value ? "success" : "danger"}
          className="min-w-[70px] h-7"
          endContent={<Icon icon="lucide:chevron-down" className="w-3.5 h-3.5" />}
        >
          {displayValue}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Plan followed selection"
        selectionMode="single"
        selectedKeys={[displayValue]}
        onSelectionChange={(keys) => {
          const selectedKey = Array.from(keys)[0] as string;
          onSave(selectedKey === "Yes");
        }}
      >
        <DropdownItem key="Yes">Yes</DropdownItem>
        <DropdownItem key="No">No</DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};

interface NotesCellProps {
  value: string;
  onSave: (value: string) => void;
}

const NotesCell: React.FC<NotesCellProps> = React.memo(function NotesCell({ value, onSave }) {
  const {isOpen, onOpenChange, onClose, onOpen} = useDisclosure();
  const [editValue, setEditValue] = React.useState(value);

  // When opening the popover, ensure the edit value is up-to-date with the cell's value
  React.useEffect(() => {
    if (isOpen) {
      setEditValue(value);
    }
  }, [isOpen, value]);

  const handleSave = () => {
    onSave(editValue);
    onClose();
  };
  
  const handleCancel = () => {
    setEditValue(value); // Reset any changes
    onClose();
  };

  return (
    <Popover placement="bottom-start" isOpen={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <div
          onClick={onOpen}
          className="p-2 text-sm rounded-md cursor-pointer hover:bg-default-100 dark:hover:bg-default-900/40 transition-colors w-full max-w-[300px]"
        >
          {value ? (
            <p className="whitespace-pre-wrap truncate text-ellipsis">{value}</p>
          ) : (
            <span className="text-default-500">Add a note...</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <div className="w-[320px] p-4">
          <h4 className="font-bold text-lg mb-3">Trade Review & Notes</h4>
          <Textarea
            label="Notes"
            placeholder="Enter your review, observations, or thoughts..."
            value={editValue}
            onValueChange={setEditValue}
            minRows={6}
            maxRows={12}
            classNames={{
              input: "resize-y"
            }}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="flat" color="danger" onPress={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" color="primary" onPress={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

interface CMPCellProps {
  value: number;
  isAutoFetched?: boolean;
  onSave: (value: number) => void;
}

const CMPCell: React.FC<CMPCellProps> = React.memo(function CMPCell({ value, isAutoFetched, onSave }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(String(value || ''));
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  React.useEffect(() => {
    setEditValue(String(value || ''));
  }, [value]);

  const handleSave = () => {
    setIsEditing(false);
    const numValue = Number(editValue) || 0;
    onSave(numValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(String(value || ''));
    }
  };

  const handleFocus = () => {
    // Don't allow editing if CMP was auto-fetched
    if (!isEditing && !isAutoFetched) {
      setIsEditing(true);
    }
  };

  const formatCurrency = (val: number) => {
    if (val === 0) return '0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val).replace('₹', '').trim();
  };

  return (
    <div className="relative">
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editValue}
          onValueChange={setEditValue}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          type="number"
          step="0.01"
          min="0"
          size="sm"
          classNames={{
            input: "text-right",
            inputWrapper: "h-7 min-h-7"
          }}
        />
      ) : (
        <Tooltip
          content={
            <div className="text-xs">
              <div className="font-medium">Current Market Price</div>
              <div className="text-default-400">
                {isAutoFetched === false
                  ? "Manually entered - click to edit"
                  : isAutoFetched === true
                    ? "Auto-fetched from market data - not editable"
                    : "Click to enter manually"
                }
              </div>
            </div>
          }
          placement="top"
          delay={500}
        >
          <div
            onClick={handleFocus}
            className={`
              py-1 px-2 text-right rounded-md transition-colors
              flex items-center justify-end gap-1
              ${isAutoFetched === false
                ? 'border-l-2 border-warning cursor-pointer hover:bg-default-100 dark:hover:bg-default-800'
                : isAutoFetched === true
                  ? 'border-l-2 border-success cursor-not-allowed opacity-75'
                  : 'cursor-pointer hover:bg-default-100 dark:hover:bg-default-800'
              }
            `}
          >
            <span className="font-medium">
              {value > 0 ? formatCurrency(value) : '-'}
            </span>
            {isAutoFetched === false && (
              <Icon
                icon="lucide:edit-3"
                className="w-3 h-3 text-warning opacity-60"
              />
            )}
            {isAutoFetched === true && (
              <Icon
                icon="lucide:refresh-cw"
                className="w-3 h-3 text-success opacity-60"
              />
            )}
          </div>
        </Tooltip>
      )}
    </div>
  );
});

export default TradeJournal;