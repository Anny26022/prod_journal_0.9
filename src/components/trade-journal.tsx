import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useTrades, SortDescriptor } from "../hooks/use-trades";
import { format } from 'date-fns';
import { useTruePortfolioWithTrades } from "../hooks/use-true-portfolio-with-trades";
import { tableRowVariants, springTransition } from "../utils/animations";
import { calcSLPercent, calcHoldingDays, calcUnrealizedPL, calcRealizedPL_FIFO, calcOpenHeat, calcIndividualMoves } from "../utils/tradeCalculations";
import { fetchPriceTicks } from '../utils/priceTickApi';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useAccountingMethod } from "../context/AccountingMethodContext";
import { calculateTradePL } from "../utils/accountingUtils";
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
    isLoading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortDescriptor,
    setSortDescriptor,
    visibleColumns,
    setVisibleColumns
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

  // Memoize trade statistics calculations based on accounting method
  const tradeStats = useMemo(() => {
    const openPositions = processedTrades.filter(t => t.positionStatus === "Open" || t.positionStatus === "Partial");
    const closedTrades = processedTrades.filter(t => t.positionStatus === "Closed");

    // Calculate P/L based on accounting method
    const tradesWithAccountingPL = processedTrades.map(trade => ({
      ...trade,
      accountingPL: calculateTradePL(trade, useCashBasis)
    }));

    const winningTrades = tradesWithAccountingPL.filter(t => t.accountingPL > 0);

    return {
      totalTrades: processedTrades.length,
      openPositionsCount: openPositions.length,
      winRate: tradesWithAccountingPL.length > 0 ? (winningTrades.length / tradesWithAccountingPL.length) * 100 : 0,
      totalPL: tradesWithAccountingPL.reduce((sum, t) => sum + (t.accountingPL || 0), 0)
    };
  }, [processedTrades, useCashBasis]);

  // Defer heavy calculations using requestIdleCallback
  useEffect(() => {
    if (typeof window.requestIdleCallback !== 'undefined') {
      const handle = requestIdleCallback(
        (deadline: IdleDeadline) => {
          if (deadline.timeRemaining() > 0) {
            processedTrades.forEach(trade => {
              if (trade.positionStatus === "Open" || trade.positionStatus === "Partial") {
                calcUnrealizedPL(trade.avgEntry, trade.cmp, trade.openQty, trade.buySell);
                calcTradeOpenHeat(trade, portfolioSize, getPortfolioSize);
              }
            });
          }
        },
        { timeout: 1000 }
      );
      return () => cancelIdleCallback(handle);
    }
  }, [processedTrades, portfolioSize, getPortfolioSize]);

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
    };
    addTrade(newTrade);
  }, [addTrade, trades]);
  
  const { isOpen: isAddOpen, onOpen: onAddOpen, onOpenChange: onAddOpenChange } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onOpenChange: onEditOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();
  
  const [selectedTrade, setSelectedTrade] = React.useState<Trade | null>(null);
  const [page, setPage] = React.useState(1);
  const rowsPerPage = 10;
  
  const pages = Math.ceil(trades.length / rowsPerPage);
  const items = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return trades.slice(start, end);
  }, [page, trades, rowsPerPage]);



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





  // List of calculated fields that should not be editable
  const nonEditableFields = [
    // Calculated fields
    'avgEntry', 'positionSize', 'allocation', 'openQty', 'exitedQty',
    'avgExitPrice', 'stockMove', 'slPercent', 'openHeat', 'rewardRisk',
    'holdingDays', 'realisedAmount', 'plRs', 'pfImpact', 'cummPf',
    'cmp' // CMP should not be editable inline
    // 'initialQty' REMOVED to allow inline editing
  ];

  // Check if a field is editable
  const isEditable = (field: string) => !nonEditableFields.includes(field);



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

      // If the field is 'name', fetch the latest price and update cmp
      if (field === 'name' && parsedValue) {
        try {
          const priceData = await fetchPriceTicks(parsedValue);
          const ticks = priceData?.data?.ticks?.[parsedValue.toUpperCase()];
          if (ticks && ticks.length > 0) {
            const latestTick = ticks[ticks.length - 1];
            updatedTrade.cmp = latestTick[4]; // index 4 is close price
          }
        } catch (err) {
          updatedTrade.cmp = 0;
        }
      }

      // Recalculate dependent fields if needed
      if ([
        'entry', 'sl', 'tsl', 'initialQty', 'pyramid1Qty', 'pyramid2Qty',
        'exit1Price', 'exit2Price', 'exit3Price', 'cmp'
      ].includes(field as string)) {
        updatedTrade.openHeat = calcTradeOpenHeat(updatedTrade, portfolioSize, getPortfolioSize);
      }



      // Update immediately without debouncing to prevent flickering
      try {
        await updateTrade(updatedTrade);
      } catch (error) {
        // Handle error silently
      }

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

  // Format holding days with tooltip
  const renderHoldingDays = (trade: Trade) => {
    const isOpenPosition = trade.positionStatus === 'Open';
    const isPartialPosition = trade.positionStatus === 'Partial';
    const isClosedPosition = trade.positionStatus === 'Closed';
    // Gather all entry lots
    const entryLots = [
      { label: 'Initial Entry', date: trade.date, qty: Number(trade.initialQty) },
      { label: 'Pyramid 1', date: trade.pyramid1Date, qty: Number(trade.pyramid1Qty) },
      { label: 'Pyramid 2', date: trade.pyramid2Date, qty: Number(trade.pyramid2Qty) }
    ].filter(e => e.date && e.qty > 0);
    // Gather all exit lots (FIFO)
    const exitLots = [
      { date: trade.exit1Date, qty: Number(trade.exit1Qty) },
      { date: trade.exit2Date, qty: Number(trade.exit2Qty) },
      { date: trade.exit3Date, qty: Number(trade.exit3Qty) }
    ].filter(e => e.date && e.qty > 0);
    // Calculate per-lot holding days (FIFO for exits)
    let remainingExits = exitLots.map(e => ({ ...e }));
    const today = new Date();
    today.setHours(0,0,0,0);
    const lotBreakdown: { label: string, qty: number, days: number, exited: boolean, exitDate?: string }[] = [];
    for (const lot of entryLots) {
      let qtyLeft = lot.qty;
      let entryDate = new Date(lot.date);
      entryDate.setHours(0,0,0,0);
      // For each exit, match qty FIFO
      while (qtyLeft > 0 && remainingExits.length > 0) {
        const exit = remainingExits[0];
        const exitDate = new Date(exit.date);
        exitDate.setHours(0,0,0,0);
        const usedQty = Math.min(qtyLeft, exit.qty);
        const days = Math.max(1, Math.ceil((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
        lotBreakdown.push({ label: lot.label, qty: usedQty, days, exited: true, exitDate: exit.date });
        qtyLeft -= usedQty;
        exit.qty -= usedQty;
        if (exit.qty === 0) remainingExits.shift();
      }
      // If any qty left, it's still open
      if (qtyLeft > 0) {
        const days = Math.max(1, Math.ceil((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)));
        lotBreakdown.push({ label: lot.label, qty: qtyLeft, days, exited: false });
      }
    }
    // Tooltip content
    let tooltipContent;
    if (isOpenPosition) {
      tooltipContent = (
        <div className="flex flex-col gap-1 text-xs max-w-xs min-w-[120px]">
          <div className="font-semibold">Holding Days</div>
          {lotBreakdown.filter(l => !l.exited).map((l, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{l.label}</span>
              <span className="font-mono">{l.days} day{l.days !== 1 ? 's' : ''}</span>
            </div>
          ))}
          <div className="text-foreground-500 mt-1 text-[10px]">
            Days since entry for each open lot.
          </div>
        </div>
      );
    } else if (isPartialPosition) {
      tooltipContent = (
        <div className="flex flex-col gap-1 text-xs max-w-xs min-w-[120px]">
          <div className="font-semibold">Holding Days</div>
          {lotBreakdown.map((l, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{l.label} {l.exited ? '(sold)' : '(open)'}</span>
              <span className="font-mono">{l.days} day{l.days !== 1 ? 's' : ''}</span>
            </div>
          ))}
          <div className="text-foreground-500 mt-1 text-[10px]">
            Days since entry for open lots, entry to exit for sold lots (FIFO).
          </div>
        </div>
      );
    } else {
      tooltipContent = (
        <div className="flex flex-col gap-1 text-xs max-w-xs min-w-[120px]">
          <div className="font-semibold">Holding Days</div>
          {lotBreakdown.map((l, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{l.label}</span>
              <span className="font-mono">{l.days} day{l.days !== 1 ? 's' : ''}</span>
            </div>
          ))}
          <div className="text-foreground-500 mt-1 text-[10px]">
            Entry to exit for each lot (FIFO).
          </div>
        </div>
      );
    }
    // Display: weighted avg for exited, days for open (if any open)
    let displayDays = 0;
    if (isOpenPosition) {
      // Show weighted avg for open lots
      const openLots = lotBreakdown.filter(l => !l.exited);
      const totalQty = openLots.reduce((sum, l) => sum + l.qty, 0);
      displayDays = totalQty > 0 ? Math.round(openLots.reduce((sum, l) => sum + l.days * l.qty, 0) / totalQty) : 0;
    } else if (isPartialPosition) {
      // Show weighted avg for open lots (if any), else exited
      const openLots = lotBreakdown.filter(l => !l.exited);
      const exitedLots = lotBreakdown.filter(l => l.exited);
      const openQty = openLots.reduce((sum, l) => sum + l.qty, 0);
      const exitedQty = exitedLots.reduce((sum, l) => sum + l.qty, 0);
      if (openQty > 0) {
        displayDays = Math.round(openLots.reduce((sum, l) => sum + l.days * l.qty, 0) / openQty);
      } else if (exitedQty > 0) {
        displayDays = Math.round(exitedLots.reduce((sum, l) => sum + l.days * l.qty, 0) / exitedQty);
      }
    } else {
      // Closed: weighted avg for all exited lots
      const exitedLots = lotBreakdown.filter(l => l.exited);
      const exitedQty = exitedLots.reduce((sum, l) => sum + l.qty, 0);
      displayDays = exitedQty > 0 ? Math.round(exitedLots.reduce((sum, l) => sum + l.days * l.qty, 0) / exitedQty) : 0;
    }
    return (
      <Tooltip 
        content={tooltipContent}
        placement="top"
        delay={100}
        closeDelay={0}
        radius="sm"
        shadow="md"
        classNames={{ content: "bg-content1 border border-divider z-50 max-w-xs" }}
      >
        <div className={`py-1 px-2 flex items-center gap-0.5${isOpenPosition ? ' text-warning' : ''} relative`}>
          {displayDays}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-alert-circle text-warning cursor-help" style={{marginLeft: 2}}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
      </Tooltip>
    );
  };

  const renderCell = React.useCallback((trade: Trade, columnKey: string) => {
    const cellValue = trade[columnKey as keyof Trade];

    // Handle holding days display
    if (columnKey === 'holdingDays') {
      return renderHoldingDays(trade);
    }

    // Tooltip for Reward:Risk (R:R)
    if (columnKey === 'rewardRisk') {
      const rr = Number(trade.rewardRisk);
      const entry = Number(trade.entry);
      const sl = Number(trade.sl);
      const cmp = Number(trade.cmp);
      const avgExit = Number(trade.avgExitPrice);
      const buySell = trade.buySell;
      const positionStatus = trade.positionStatus;
      const exitedQty = Number(trade.exitedQty);
      const openQty = Number(trade.openQty);
      const totalQty = exitedQty + openQty;

      // Gather all entry lots
      const entries = [
        { label: 'Initial Entry', price: Number(trade.entry), qty: Number(trade.initialQty) },
        { label: 'Pyramid 1', price: Number(trade.pyramid1Price), qty: Number(trade.pyramid1Qty) },
        { label: 'Pyramid 2', price: Number(trade.pyramid2Price), qty: Number(trade.pyramid2Qty) }
      ].filter(e => e.price > 0 && e.qty > 0);

      // Calculate total quantity first - moved to top
      const totalQtyAll = entries.reduce((sum, e) => sum + (e.qty || 0), 0);

      // Per-entry R:R breakdown
      const tsl = Number(trade.tsl);
      const entryBreakdown = entries.map(e => {
        // For initial entry, always use SL; for pyramids, use TSL if set and > 0, otherwise SL
        let stop;
        if (e.label === 'Initial Entry') {
          stop = sl;
        } else {
          stop = tsl > 0 ? tsl : sl;
        }
        const rawRisk = e.price - stop; // For Buy
        const risk = Math.abs(rawRisk); // For R:R calculation
        let reward = 0;
        let rewardFormula = '';
        if (positionStatus === 'Open') {
          reward = buySell === 'Buy' ? cmp - e.price : e.price - cmp;
          rewardFormula = buySell === 'Buy'
            ? `CMP - Entry = ${cmp} - ${e.price} = ${(cmp - e.price).toFixed(2)}`
            : `Entry - CMP = ${e.price} - ${cmp} = ${(e.price - cmp).toFixed(2)}`;
        } else if (positionStatus === 'Closed') {
          reward = buySell === 'Buy' ? avgExit - e.price : e.price - avgExit;
          rewardFormula = buySell === 'Buy'
            ? `Avg. Exit - Entry = ${avgExit} - ${e.price} = ${(avgExit - e.price).toFixed(2)}`
            : `Entry - Avg. Exit = ${e.price} - ${avgExit} = ${(e.price - avgExit).toFixed(2)}`;
        } else if (positionStatus === 'Partial') {
          const realizedReward = buySell === 'Buy' ? avgExit - e.price : e.price - avgExit;
          const potentialReward = buySell === 'Buy' ? cmp - e.price : e.price - cmp;
          reward = totalQtyAll > 0 ? ((realizedReward * exitedQty + potentialReward * openQty) / totalQtyAll) : 0;
          rewardFormula = `Weighted: ((Exited: ${realizedReward.toFixed(2)} × ${exitedQty}) + (Open: ${potentialReward.toFixed(2)} × ${openQty})) / ${totalQtyAll} = ${reward.toFixed(2)}`;
        }
        const rrValue = risk !== 0 ? Math.abs(reward / risk) : 0;
        return {
          label: e.label,
          price: e.price,
          risk, // always positive for R:R
          rawRisk, // signed for display and note
          reward,
          rewardFormula,
          rrValue,
          qty: e.qty,
          stop // for tooltip display
        };
      });
      // Calculate weighted average R:R for all entries (using totalQtyAll from above)
      const weightedRR = totalQtyAll > 0
        ? entryBreakdown.reduce((sum, e) => sum + (e.rrValue * (e.qty || 0)), 0) / totalQtyAll
        : 0;
      // Overall R:R (as before)
      let risk = Math.abs(entry - sl);
      let reward = 0;
      let rewardFormula = '';
      let rewardValue = 0;
      if (positionStatus === 'Open') {
        reward = buySell === 'Buy' ? cmp - entry : entry - cmp;
        rewardFormula = buySell === 'Buy'
          ? `CMP - Entry = ${cmp} - ${entry} = ${(cmp - entry).toFixed(2)}`
          : `Entry - CMP = ${entry} - ${cmp} = ${(entry - cmp).toFixed(2)}`;
        rewardValue = reward;
      } else if (positionStatus === 'Closed') {
        reward = buySell === 'Buy' ? avgExit - entry : entry - avgExit;
        rewardFormula = buySell === 'Buy'
          ? `Avg. Exit - Entry = ${avgExit} - ${entry} = ${(avgExit - entry).toFixed(2)}`
          : `Entry - Avg. Exit = ${entry} - ${avgExit} = ${(entry - avgExit).toFixed(2)}`;
        rewardValue = reward;
      } else if (positionStatus === 'Partial') {
        const realizedReward = buySell === 'Buy' ? avgExit - entry : entry - avgExit;
        const potentialReward = buySell === 'Buy' ? cmp - entry : entry - cmp;
        reward = totalQty > 0 ? ((realizedReward * exitedQty + potentialReward * openQty) / totalQty) : 0;
        rewardFormula = `Weighted: ((Exited: ${realizedReward.toFixed(2)} × ${exitedQty}) + (Open: ${potentialReward.toFixed(2)} × ${openQty})) / ${totalQty} = ${reward.toFixed(2)}`;
        rewardValue = reward;
      }
      const rrValue = risk !== 0 ? Math.abs(rewardValue / risk) : 0;
      const weightedRRDisplay = totalQtyAll > 0 ? weightedRR.toFixed(2) : '0.00';
      const rrTooltipContent = (
        <div className="flex flex-col gap-1 text-xs max-w-xs min-w-[180px]">
          <div className="font-semibold">Reward:Risk Breakdown</div>
          {entryBreakdown.map((e, idx) => (
            <div key={idx} className="flex flex-col gap-0.5 border-b border-divider pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
              <div className="font-medium">{e.label} (Entry: {e.price})</div>
              <div><b>Risk:</b> |Entry - {(e.label === 'Initial Entry' ? 'SL' : (e.stop === tsl && tsl > 0 ? 'TSL' : 'SL'))}| = {e.price} - {e.stop} = {e.rawRisk.toFixed(2)}</div>
              {e.rawRisk < 0 && e.label !== 'Initial Entry' && (
                <div className="text-warning-600 text-[10px]">
                  Negative risk: This pyramid is financed from the cushion of earlier profits.
                </div>
              )}
              <div><b>Reward:</b> {e.rewardFormula}</div>
              <div><b>R:R:</b> |{e.reward.toFixed(2)} / {e.risk.toFixed(2)}| = <span className='text-primary'>{e.rrValue.toFixed(2)}</span></div>
            </div>
          ))}
          <div className="font-semibold mt-1">Overall R:R (Weighted Avg)</div>
          <div>
            <b>
              {entryBreakdown.map((e, idx) =>
                <span key={idx}>
                  {idx > 0 && ' + '}
                  ({e.rrValue.toFixed(2)} × {e.qty})
                </span>
              )}
              {' '} / {totalQtyAll} = <span className='text-primary'>{weightedRRDisplay}</span>
            </b>
          </div>
        </div>
      );
      return (
        <Tooltip 
          content={rrTooltipContent}
          placement="top"
          delay={100}
          closeDelay={0}
          radius="sm"
          shadow="md"
          classNames={{ content: "bg-content1 border border-divider z-50 max-w-xs" }}
        >
          <div className="py-1 px-2 flex items-center gap-1 relative">
            {weightedRR > 0 ? `1:${weightedRR.toFixed(2)} (${weightedRR.toFixed(2)}R)` : '-'}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-alert-circle text-warning cursor-help" style={{marginLeft: 2}}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </Tooltip>
      );
    }

    // Tooltip for Stock Move (%)
    if (columnKey === 'stockMove') {
      // Prepare entries for breakdown
      const entries = [
        { price: trade.entry, qty: trade.initialQty, description: 'Initial Entry' },
        { price: trade.pyramid1Price, qty: trade.pyramid1Qty, description: 'Pyramid 1' },
        { price: trade.pyramid2Price, qty: trade.pyramid2Qty, description: 'Pyramid 2' }
      ].filter(e => e.price > 0 && e.qty > 0);
      // Use calcIndividualMoves
      const individualMoves = calcIndividualMoves(
        entries,
        trade.cmp,
        trade.avgExitPrice,
        trade.positionStatus,
        trade.buySell
      );
      const formatPercentage = (value: number | null | undefined): string => {
        if (value === null || value === undefined) return "-";
        return `${value.toFixed(2)}%`;
      };
      const tooltipContent = (
        <div className="flex flex-col gap-1 text-xs max-w-xs min-w-[180px]">
          <div className="font-semibold">Individual Stock Moves:</div>
          {individualMoves.map((move: any, index: number) => (
            <div key={index} className="flex justify-between">
              <span>{move.description} <span className="text-foreground-400">({move.qty} qty)</span></span>
              <span className="font-mono">{formatPercentage(move.movePercent)}</span>
            </div>
          ))}
          <div className="text-foreground-500 mt-1 text-[10px]">
            {trade.positionStatus === 'Open'
              ? '* Moves based on CMP vs. entry prices.'
              : trade.positionStatus === 'Partial'
                ? '* Moves weighted: Avg. Exit for exited qty, CMP for open qty, vs. entry prices.'
                : '* Moves based on Avg. Exit vs. entry prices.'}
          </div>
        </div>
      );
      return (
        <Tooltip 
          content={tooltipContent}
          placement="top"
          delay={100}
          closeDelay={0}
          radius="sm"
          shadow="md"
          classNames={{ content: "bg-content1 border border-divider z-50 max-w-xs" }}
        >
          <div className="py-1 px-2 flex items-center gap-1 relative">
            {cellValue !== undefined && cellValue !== null ? `${Number(cellValue).toFixed(2)}%` : '-'}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-alert-circle text-warning cursor-help" style={{marginLeft: 2}}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </Tooltip>
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
      const fieldsForTooltip = allColumns.slice(allColumns.findIndex(col => col.key === "initialQty")).filter(col => col.key !== 'openHeat');
      const tooltipContent = (
        <div className="p-3 text-xs max-w-2xl break-words">
          <h4 className="font-semibold text-sm mb-2">Trade Details: {trade.name}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {fieldsForTooltip.map(col => {
              if (col.key === "actions") return null;
              let value = trade[col.key as keyof Trade];
              if (col.key === 'unrealizedPL') {
                if (trade.positionStatus === 'Open' || trade.positionStatus === 'Partial') {
                  value = calcUnrealizedPL(trade.avgEntry, trade.cmp, trade.openQty, trade.buySell);
                } else {
                  value = "-";
                }
              }
              if (["pyramid1Date", "pyramid2Date", "exit1Date", "exit2Date", "exit3Date"].includes(col.key)) {
                value = value ? formatDate(value as string) : "-";
              } else if (["entry", "avgEntry", "sl", "tsl", "cmp", "pyramid1Price", "pyramid2Price", "exit1Price", "exit2Price", "exit3Price", "avgExitPrice", "realisedAmount", "plRs", "unrealizedPL"].includes(col.key)) {
                value = typeof value === 'number' ? formatCurrency(value) : value;
              } else if (["pfImpact", "cummPf", "rewardRisk", "stockMove", "openHeat", "allocation", "slPercent"].includes(col.key)) {
                let originalValue = Number(value);
                value = `${originalValue.toFixed(2)}`;
                if (col.key !== "rewardRisk" && !(col.key.includes("Price") || col.key.includes("Amount") || col.key.includes("Rs"))) {
                   value += "%" 
                }
              } else if (col.key === "planFollowed") {
                value = trade.planFollowed ? "Yes" : "No";
              } else if (value === undefined || value === null || value === ""){
                value = "-";
              }
              return (
                <div key={col.key} className="bg-content2/40 dark:bg-content2/30 p-1.5 rounded shadow-sm overflow-hidden text-ellipsis whitespace-nowrap">
                  <span className="font-medium text-default-700 dark:text-default-300">{col.label}: </span>
                  <span className="text-default-600 dark:text-default-400">{String(value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
      
      return (
        <Tooltip 
          content={tooltipContent} 
          placement="right-start" 
          delay={0}
          closeDelay={0}
          radius="sm"
          shadow="md"
          classNames={{ content: "bg-content1 border border-divider" }}
        >
          <div className="max-w-[200px] cursor-default">
            <NameCell 
              value={trade.name} 
              onSave={(value) => handleInlineEditSave(trade.id, "name", value)} 
            />
          </div>
        </Tooltip>
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
        
      // Other price fields
      case "tsl":
      case "cmp":
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
      case "realisedAmount":
      case "plRs":
        return <EditableCell value={cellValue as number} type="price" onSave={(value) => handleInlineEditSave(trade.id, columnKey as keyof Trade, value)} />;
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
      case "pfImpact":
      case "cummPf":
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

  // Memoize expensive calculations to prevent unnecessary re-renders
  const { totalUnrealizedPL, openPfImpact, totalRealizedPL, realizedPfImpact } = React.useMemo(() => {
    const unrealizedPL = trades
      .filter(trade => trade.positionStatus === 'Open' || trade.positionStatus === 'Partial')
      .reduce((sum, trade) => sum + calcUnrealizedPL(trade.avgEntry, trade.cmp, trade.openQty, trade.buySell), 0);

    const openImpact = portfolioSize > 0 ? (unrealizedPL / portfolioSize) * 100 : 0;

    // Calculate realized P/L based on accounting method
    const realizedPL = trades
      .filter(trade => trade.positionStatus !== 'Open')
      .reduce((sum, trade) => sum + calculateTradePL(trade, useCashBasis), 0);

    const realizedImpact = portfolioSize > 0 ? (realizedPL / portfolioSize) * 100 : 0;

    return {
      totalUnrealizedPL: unrealizedPL,
      openPfImpact: openImpact,
      totalRealizedPL: realizedPL,
      realizedPfImpact: realizedImpact
    };
  }, [trades, portfolioSize, useCashBasis]);



  // Memoize open trades to prevent unnecessary price fetching
  const openTrades = React.useMemo(() =>
    trades.filter(t => t.positionStatus === 'Open' || t.positionStatus === 'Partial'),
    [trades]
  );

  // Memoize the price fetching function to prevent re-creation
  const fetchPricesForOpenTrades = React.useCallback(async () => {
    for (const trade of openTrades) {
      if (trade.name) {
        try {
          const priceData = await fetchPriceTicks(trade.name);
          const ticks = priceData?.data?.ticks?.[trade.name.toUpperCase()];
          if (ticks && ticks.length > 0) {
            const latestTick = ticks[ticks.length - 1];
            if (trade.cmp !== latestTick[4]) {
              updateTrade({ ...trade, cmp: latestTick[4] });
            }
          }
        } catch (err) {
          // Optionally handle error
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
        {/* First three stats: Total Trades, Open Positions, Win Rate */}
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
          value: (() => {
            const tradesWithAccountingPL = trades.map(trade => ({
              ...trade,
              accountingPL: calculateTradePL(trade, useCashBasis)
            }));
            const winningTrades = tradesWithAccountingPL.filter(t => t.accountingPL > 0);
            return tradesWithAccountingPL.length > 0 ? ((winningTrades.length / tradesWithAccountingPL.length) * 100).toFixed(2) + '%' : '0.00%';
          })(),
          icon: "lucide:target",
          color: "success",
          tooltip: `Percentage of trades that are profitable (${useCashBasis ? 'Cash Basis' : 'Accrual Basis'}).`
        }].map((stat, idx) => (
          <div key={stat.title} className="flex items-center gap-2">
            <StatsCard 
              title={stat.title} 
              value={stat.value} 
              icon={stat.icon} 
              color={
                idx === 0 ? "primary" : idx === 1 ? "warning" : "success"
              }
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
        {/* Last three stats: Realized P/L, Unrealized P/L, Open Heat */}
        <div className="flex items-center gap-2">
          <StatsCard 
            title="Realized P/L" 
            value={formatCurrency(totalRealizedPL)}
            icon="lucide:indian-rupee" 
            color={totalRealizedPL >= 0 ? "success" : "danger"}
          />
          <Tooltip
            placement="top"
            className="max-w-xs text-xs p-1 bg-content1 border border-divider"
            content={
              <>
                <div>
                  <strong>PF Impact:</strong> {realizedPfImpact.toFixed(2)}%
                </div>
                <div className="text-foreground-400">
                  This is the % of your portfolio that is realized as profit/loss.
                </div>
                <div className="text-warning-600 mt-2">
                  <strong>Accounting Method:</strong> {useCashBasis ? 'Cash Basis' : 'Accrual Basis'}
                </div>
                <div className="text-xs text-foreground-400">
                  {useCashBasis
                    ? "P/L attributed to exit dates"
                    : "P/L attributed to entry dates"
                  }
                </div>
              </>
            }
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer inline-block align-middle ml-2" />
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <StatsCard 
            title="Unrealized P/L" 
            value={formatCurrency(totalUnrealizedPL)}
            icon="lucide:indian-rupee" 
            color={totalUnrealizedPL >= 0 ? "success" : "danger"}
          />
          <Tooltip
            placement="top"
            className="max-w-xs text-xs p-1 bg-content1 border border-divider"
            content={
              <>
                <div>
                  <strong>Open PF Impact:</strong> {openPfImpact.toFixed(2)}%
                </div>
                <div className="text-foreground-400">
                  This is the % of your portfolio that is currently (unrealized).
                </div>
              </>
            }
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer inline-block align-middle ml-2" />
          </Tooltip>
        </div>
        <div className="flex items-center gap-1">
          <StatsCard
            title="Open Heat"
            value={calcOpenHeat(trades, portfolioSize, getPortfolioSize).toFixed(2) + "%"}
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
                      {breakdown.map(t => (
                        <li key={t.name} className="flex justify-between">
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

      <Card className="border border-divider">
        <CardBody className="p-0">
          <div className="relative">
          <Table
            aria-label="Trade journal table"
            bottomContent={
              pages > 0 ? (
                <div className="flex w-full justify-center items-center gap-4 py-2">
                  <Pagination
                    isCompact
                    showControls
                    showShadow={false}
                    color="primary"
                    size="sm"
                    variant="light"
                    page={page}
                    total={pages}
                    onChange={(p) => setPage(p)}
                    classNames={{
                      item: "rounded-full w-5 h-5 text-xs flex items-center justify-center", // Even smaller and circular
                      cursor: "rounded-full w-5 h-5 text-xs flex items-center justify-center", // Even smaller and circular
                      prev: "rounded-full w-5 h-5 text-xs flex items-center justify-center", // Even smaller and circular
                      next: "rounded-full w-5 h-5 text-xs flex items-center justify-center", // Even smaller and circular
                      ellipsis: "px-0.5 text-xs" // Adjusted padding for ellipsis
                    }}
                  />
                </div>
              ) : null
            }
            classNames={{
              wrapper: "min-h-[222px] p-0",
              th: "bg-transparent border-b border-divider text-xs font-medium text-default-500 dark:text-default-300 uppercase tracking-wider",
              td: "py-2.5 text-sm",
              base: "max-w-full"
            }}
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
            <TableBody items={items} isLoading={isLoading} emptyContent={isLoading ? " " : "No trades found. Add your first trade!"}>
              {(item) => (
                <TableRow
                  key={item.id}
                  className="hover:bg-default-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                >
                  {headerColumns.map((column) => (
                    <TableCell key={`${item.id}-${column.key}`}>
                      {renderCell(item, column.key)}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
          {/* Sleek, small add inline trade icon below the table */}
          <Tooltip content="Add new trade (inline)" placement="top">
            <Button
              isIconOnly
              color="primary"
              variant="light"
              onPress={handleAddNewBlankTrade}
              size="sm"
              className="mt-2"
              style={{ display: 'block', margin: '0 auto' }}
            >
              <Icon icon="lucide:list-plus" className="text-lg" />
            </Button>
          </Tooltip>
          </div>
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
      </AnimatePresence>
    </div>
  );
});

interface StatsCardProps {
  title: string;
  value: string;
  icon: string;
  color: "primary" | "success" | "warning" | "danger";
}

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
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{
        y: -2,
        transition: { type: "spring", stiffness: 180, damping: 22 }
      }}
      className="will-change-transform"
    >
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900">
        <CardBody className="p-4">
          <motion.div 
            className="flex justify-between items-start will-change-transform"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="space-y-2">
              <motion.p 
                className="text-gray-500 dark:text-gray-400 text-sm font-medium"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                {title}
              </motion.p>
              <motion.p 
                className={`text-2xl font-semibold tracking-tight ${colors.text}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                {value}
              </motion.p>
            </div>
            <motion.div 
              className={`p-3 rounded-xl ${colors.bg} ${colors.icon}`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.5,
                type: "spring",
                stiffness: 400,
                damping: 10
              }}
            >
              <Icon icon={icon} className="text-xl" />
            </motion.div>
          </motion.div>
        </CardBody>
      </Card>
    </motion.div>
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
    if (!isEditing) setIsEditing(true);
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
    if (finalValue.trim()) {
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

// Utility to calculate open heat for a single trade
function calcTradeOpenHeat(trade, defaultPortfolioSize, getPortfolioSize) {
  // Get the trade date and extract month/year
  const tradeDate = new Date(trade.date);
  const month = tradeDate.toLocaleString('default', { month: 'short' });
  const year = tradeDate.getFullYear();
  
  // Get the portfolio size for the specific month/year of the trade
  const monthlyPortfolioSize = getPortfolioSize ? getPortfolioSize(month, year) || defaultPortfolioSize : defaultPortfolioSize;
  
  const entryPrice = trade.avgEntry || trade.entry || 0;
  const sl = trade.sl || 0;
  const tsl = trade.tsl || 0;
  const qty = trade.openQty || 0;
  let stop = 0;
  if (tsl > 0 && sl > 0) {
    stop = tsl; // Both entered, use TSL
  } else if (tsl > 0) {
    stop = tsl; // Only TSL entered
  } else if (sl > 0) {
    stop = sl; // Only SL entered
  } else {
    stop = 0; // Neither entered
  }
  if (!entryPrice || !stop || !qty) return 0;
  if (stop >= entryPrice) return 0;
  const risk = (entryPrice - stop) * qty;
  return monthlyPortfolioSize > 0 ? (Math.max(0, risk) / monthlyPortfolioSize) * 100 : 0;
}

export default TradeJournal;