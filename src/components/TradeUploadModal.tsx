import React, { useState, useCallback, useMemo } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  SelectItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Progress,
  Chip,
  Divider,
  ScrollShadow
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Trade } from "../types/trade";
import { generateId } from "../utils/helpers";
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


interface TradeUploadModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (trades: Trade[]) => void;
  portfolioSize?: number;
  getPortfolioSize?: (month: string, year: number) => number;
}

interface ParsedData {
  headers: string[];
  rows: any[][];
  fileName: string;
}

interface ColumnMapping {
  [key: string]: string; // Our field -> Their column
}

interface MappingConfidence {
  [key: string]: number; // Our field -> confidence score (0-100)
}

// Fields that should be imported from user data (manual input fields)
const USER_INPUT_FIELDS = [
  { key: 'tradeNo', label: 'Trade No.', required: false },
  { key: 'date', label: 'Date', required: true },
  { key: 'name', label: 'Stock Name', required: true },
  { key: 'setup', label: 'Setup', required: false },
  { key: 'buySell', label: 'Buy/Sell', required: false },
  { key: 'entry', label: 'Entry Price', required: false },
  { key: 'sl', label: 'Stop Loss', required: false },
  { key: 'tsl', label: 'Trailing SL', required: false },
  { key: 'initialQty', label: 'Initial Quantity', required: false },
  { key: 'pyramid1Price', label: 'Pyramid 1 Price', required: false },
  { key: 'pyramid1Qty', label: 'Pyramid 1 Qty', required: false },
  { key: 'pyramid1Date', label: 'Pyramid 1 Date', required: false },
  { key: 'pyramid2Price', label: 'Pyramid 2 Price', required: false },
  { key: 'pyramid2Qty', label: 'Pyramid 2 Qty', required: false },
  { key: 'pyramid2Date', label: 'Pyramid 2 Date', required: false },
  { key: 'exit1Price', label: 'Exit 1 Price', required: false },
  { key: 'exit1Qty', label: 'Exit 1 Qty', required: false },
  { key: 'exit1Date', label: 'Exit 1 Date', required: false },
  { key: 'exit2Price', label: 'Exit 2 Price', required: false },
  { key: 'exit2Qty', label: 'Exit 2 Qty', required: false },
  { key: 'exit2Date', label: 'Exit 2 Date', required: false },
  { key: 'exit3Price', label: 'Exit 3 Price', required: false },
  { key: 'exit3Qty', label: 'Exit 3 Qty', required: false },
  { key: 'exit3Date', label: 'Exit 3 Date', required: false },
  { key: 'planFollowed', label: 'Plan Followed', required: false },
  { key: 'exitTrigger', label: 'Exit Trigger', required: false },
  { key: 'proficiencyGrowthAreas', label: 'Growth Areas', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

// Fields that are auto-populated and should NOT be imported from user data
const AUTO_POPULATED_FIELDS = [
  'cmp',           // Fetched from API
  'avgEntry',      // Calculated from entry + pyramids
  'positionSize',  // Calculated from avgEntry * totalQty
  'allocation',    // Calculated from positionSize / portfolioSize
  'slPercent',     // Calculated from SL vs Entry
  'openQty',       // Calculated from total - exited
  'exitedQty',     // Calculated from exit quantities
  'avgExitPrice',  // Calculated from exit prices/quantities
  'stockMove',     // Calculated from price movement
  'openHeat',      // Calculated from portfolio context
  'rewardRisk',    // Calculated from risk/reward ratio
  'holdingDays',   // Calculated from dates
  'positionStatus', // Calculated from open/exited quantities
  'realisedAmount', // Calculated from exits
  'plRs',          // Calculated using FIFO/accounting method
  'pfImpact',      // Calculated from P/L vs portfolio
  'cummPf',        // Calculated cumulatively across trades
  'unrealizedPL'   // Calculated for open positions
];

// Our trade fields that can be mapped (only user input fields)
const MAPPABLE_FIELDS = USER_INPUT_FIELDS;

export const TradeUploadModal: React.FC<TradeUploadModalProps> = ({
  isOpen,
  onOpenChange,
  onImport,
  portfolioSize = 100000,
  getPortfolioSize
}) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [mappingConfidence, setMappingConfidence] = useState<MappingConfidence>({});
  const [previewTrades, setPreviewTrades] = useState<Trade[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // Function to recalculate all auto-populated fields for a trade
  // NOTE: CMP will be auto-fetched from API when trade name is set, not imported from CSV
  const recalculateTradeFields = useCallback((trade: Trade): Trade => {
    // Get portfolio size for the trade date
    const tradeDate = new Date(trade.date);
    const month = tradeDate.toLocaleString('default', { month: 'short' });
    const year = tradeDate.getFullYear();
    const tradePortfolioSize = getPortfolioSize ? getPortfolioSize(month, year) : portfolioSize;

    // Gather all entry lots (initial + pyramids)
    const allEntries = [
      { price: trade.entry, qty: trade.initialQty },
      ...(trade.pyramid1Price && trade.pyramid1Qty ? [{ price: trade.pyramid1Price, qty: trade.pyramid1Qty }] : []),
      ...(trade.pyramid2Price && trade.pyramid2Qty ? [{ price: trade.pyramid2Price, qty: trade.pyramid2Qty }] : [])
    ].filter(e => e.price > 0 && e.qty > 0);

    // Gather all exit lots with dates
    const allExits = [
      ...(trade.exit1Price && trade.exit1Qty ? [{
        price: trade.exit1Price,
        qty: trade.exit1Qty,
        date: trade.exit1Date || trade.date
      }] : []),
      ...(trade.exit2Price && trade.exit2Qty ? [{
        price: trade.exit2Price,
        qty: trade.exit2Qty,
        date: trade.exit2Date || trade.date
      }] : []),
      ...(trade.exit3Price && trade.exit3Qty ? [{
        price: trade.exit3Price,
        qty: trade.exit3Qty,
        date: trade.exit3Date || trade.date
      }] : [])
    ].filter(e => e.price > 0 && e.qty > 0);

    // Calculate derived values
    const totalInitialQty = allEntries.reduce((sum, e) => sum + e.qty, 0);
    const avgEntry = calcAvgEntry(allEntries);
    const positionSize = calcPositionSize(avgEntry, totalInitialQty);
    const allocation = calcAllocation(positionSize, tradePortfolioSize);
    const slPercent = calcSLPercent(trade.sl, trade.entry);

    const exitedQty = allExits.reduce((sum, e) => sum + e.qty, 0);
    const openQty = Math.max(0, totalInitialQty - exitedQty);
    const avgExitPrice = calcAvgExitPrice(allExits);

    // Determine position status
    let positionStatus: 'Open' | 'Closed' | 'Partial' = trade.positionStatus || 'Open';
    if (exitedQty === 0) {
      positionStatus = 'Open';
    } else if (exitedQty >= totalInitialQty) {
      positionStatus = 'Closed';
    } else {
      positionStatus = 'Partial';
    }

    const stockMove = calcStockMove(
      avgEntry,
      avgExitPrice,
      trade.cmp,
      openQty,
      exitedQty,
      positionStatus,
      trade.buySell
    );

    const rewardRisk = calcRewardRisk(
      trade.cmp || avgExitPrice || trade.entry,
      trade.entry,
      trade.sl,
      positionStatus,
      avgExitPrice,
      openQty,
      exitedQty,
      trade.buySell
    );

    const holdingDays = calcHoldingDays(
      trade.date,
      allExits.length > 0 ? allExits[allExits.length - 1].date : trade.date
    );

    const realisedAmount = calcRealisedAmount(exitedQty, avgExitPrice);

    // Calculate P/L using FIFO method
    const entryLotsForFifo = allEntries.map(e => ({ price: e.price, qty: e.qty }));
    const exitLotsForFifo = allExits.map(e => ({ price: e.price, qty: e.qty }));
    const plRs = exitedQty > 0 ? calcRealizedPL_FIFO(entryLotsForFifo, exitLotsForFifo, trade.buySell as 'Buy' | 'Sell') : 0;

    const pfImpact = calcPFImpact(plRs, tradePortfolioSize);

    return {
      ...trade,
      avgEntry,
      positionSize,
      allocation,
      slPercent,
      openQty,
      exitedQty,
      avgExitPrice,
      stockMove,
      rewardRisk,
      holdingDays,
      positionStatus,
      realisedAmount,
      plRs,
      pfImpact,
      cummPf: 0, // This would need to be calculated across all trades
      openHeat: 0 // This would need portfolio context
    };
  }, [portfolioSize, getPortfolioSize]);

  // Smart column mapping based on header similarity
  const generateSmartMapping = useCallback((headers: string[]): { mapping: ColumnMapping; confidence: MappingConfidence } => {
    const mapping: ColumnMapping = {};
    const confidence: MappingConfidence = {};

    // Enhanced similarity mapping - ONLY for user input fields (auto-populated fields excluded)
    // Special handling for ambiguous "Date" columns by considering context
    const similarityMap: { [key: string]: string[] } = {
      'tradeNo': ['trade no', 'trade number', 'trade id', 'id', 'sr no', 'serial', 'trade #', '#', 'trade no.'],
      'date': ['date', 'entry date', 'trade date', 'timestamp', 'entry dt', 'dt'],
      'name': ['name', 'stock', 'symbol', 'stock name', 'company', 'scrip', 'ticker', 'instrument'],
      'setup': ['setup', 'strategy', 'pattern', 'type', 'trade type', 'setup type'],
      'buySell': ['buy/sell', 'buysell', 'side', 'action', 'transaction type', 'buy sell', 'direction', 'buy/ sell'],
      'entry': ['entry', 'entry price', 'buy price', 'price', 'entry rate', 'buy rate'],
      'sl': ['sl', 'stop loss', 'stoploss', 'stop', 'sl price', 'stop price'],
      'tsl': ['tsl', 'trailing sl', 'trailing stop', 'trail sl', 'trailing stop loss'],
      'initialQty': ['qty', 'quantity', 'initial qty', 'shares', 'units', 'volume', 'size', 'initial\nqty'],
      'pyramid1Price': ['pyramid 1 price', 'p1 price', 'p-1 price', 'pyramid1 price', 'pyr1 price', 'pyramid-1\nprice', 'pyramid-1 price'],
      'pyramid1Qty': ['pyramid 1 qty', 'p1 qty', 'p-1 qty', 'pyramid1 qty', 'pyr1 qty', 'p-1\nqty'],
      'pyramid1Date': ['pyramid 1 date', 'p1 date', 'p-1 date', 'pyramid1 date', 'pyr1 date', 'p-1\ndate'],
      'pyramid2Price': ['pyramid 2 price', 'p2 price', 'p-2 price', 'pyramid2 price', 'pyr2 price', 'pyramid-2\nprice', 'pyramid-2 price'],
      'pyramid2Qty': ['pyramid 2 qty', 'p2 qty', 'p-2 qty', 'pyramid2 qty', 'pyr2 qty', 'p-2\nqty'],
      'pyramid2Date': ['pyramid 2 date', 'p2 date', 'p-2 date', 'pyramid2 date', 'pyr2 date', 'p-2\ndate'],
      'exit1Price': ['exit 1 price', 'e1 price', 'exit1 price', 'sell 1 price', 'exit price', 'exit-1\nprice', 'exit-1 price'],
      'exit1Qty': ['exit 1 qty', 'e1 qty', 'exit1 qty', 'sell 1 qty', 'exit qty', 'exit-1\nqty'],
      'exit1Date': ['exit 1 date', 'e1 date', 'exit1 date', 'sell 1 date', 'exit date'],
      'exit2Price': ['exit 2 price', 'e2 price', 'exit2 price', 'sell 2 price', 'exit-2\nprice', 'exit-2 price'],
      'exit2Qty': ['exit 2 qty', 'e2 qty', 'exit2 qty', 'sell 2 qty', 'exit-2\nqty'],
      'exit2Date': ['exit 2 date', 'e2 date', 'exit2 date', 'sell 2 date'],
      'exit3Price': ['exit 3 price', 'e3 price', 'exit3 price', 'sell 3 price', 'exit-3\nprice', 'exit-3 price'],
      'exit3Qty': ['exit 3 qty', 'e3 qty', 'exit3 qty', 'sell 3 qty', 'exit-3\nqty'],
      'exit3Date': ['exit 3 date', 'e3 date', 'exit3 date', 'sell 3 date'],
      'planFollowed': ['plan followed', 'plan followed?', 'followed plan', 'plan \nfollowed?'],
      'exitTrigger': ['exit trigger', 'trigger', 'exit reason', 'exit trigger'],
      'proficiencyGrowthAreas': ['growth areas', 'proficiency', 'improvement areas', 'growth areas'],
      'notes': ['notes', 'comments', 'remarks', 'description', 'memo', 'observation', 'note']
    };

    // Function to calculate similarity score between two strings
    const calculateSimilarity = (str1: string, str2: string): number => {
      const s1 = str1.toLowerCase().trim();
      const s2 = str2.toLowerCase().trim();

      // Exact match
      if (s1 === s2) return 100;

      // Contains match
      if (s1.includes(s2) || s2.includes(s1)) return 80;

      // Remove common separators, newlines, and special characters for better matching
      const clean1 = s1.replace(/[-_\s\n\r\/\(\)\.\?:]/g, '');
      const clean2 = s2.replace(/[-_\s\n\r\/\(\)\.\?:]/g, '');
      if (clean1 === clean2) return 95;
      if (clean1.includes(clean2) || clean2.includes(clean1)) return 85;

      // Handle multi-line headers by removing newlines and extra spaces
      const normalized1 = s1.replace(/\s+/g, ' ').replace(/\n/g, ' ');
      const normalized2 = s2.replace(/\s+/g, ' ').replace(/\n/g, ' ');
      if (normalized1 === normalized2) return 90;
      if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return 75;

      // Word-based matching with better tokenization
      const words1 = s1.split(/[-_\s\n\r\/\(\)\.\?:]+/).filter(w => w.length > 0);
      const words2 = s2.split(/[-_\s\n\r\/\(\)\.\?:]+/).filter(w => w.length > 0);
      const commonWords = words1.filter(word => words2.includes(word));
      if (commonWords.length > 0) {
        return (commonWords.length / Math.max(words1.length, words2.length)) * 60;
      }

      return 0;
    };

    // Special context-aware mapping for ambiguous "Date" columns
    const mapDateColumnsWithContext = () => {
      const dateColumns: Array<{header: string, index: number}> = [];

      // Find all "Date" columns with their positions
      headers.forEach((header, index) => {
        if (header.toLowerCase().trim() === 'date') {
          dateColumns.push({ header, index });
        }
      });

      if (dateColumns.length > 1) {
        // Multiple "Date" columns - use context and position to map them
        dateColumns.forEach((dateCol, arrayIndex) => {
          const colIndex = dateCol.index;

          // Look at previous 2 columns for better context
          const prev1Col = colIndex > 0 ? headers[colIndex - 1]?.toLowerCase().trim() : '';
          const prev2Col = colIndex > 1 ? headers[colIndex - 2]?.toLowerCase().trim() : '';

          // Map based on context and position
          if (arrayIndex === 0 && colIndex < 10) {
            // First "Date" column early in the CSV is likely the main trade date
            if (!mapping['date']) {
              mapping['date'] = dateCol.header;
              confidence['date'] = 95;
            }
          } else {
            // Subsequent "Date" columns - check context
            if (prev1Col.includes('qty') && (prev2Col.includes('exit-1') || prev2Col.includes('e1') || prev1Col.includes('exit'))) {
              if (!mapping['exit1Date']) {
                mapping['exit1Date'] = dateCol.header;
                confidence['exit1Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && (prev2Col.includes('exit-2') || prev2Col.includes('e2'))) {
              if (!mapping['exit2Date']) {
                mapping['exit2Date'] = dateCol.header;
                confidence['exit2Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && (prev2Col.includes('exit-3') || prev2Col.includes('e3'))) {
              if (!mapping['exit3Date']) {
                mapping['exit3Date'] = dateCol.header;
                confidence['exit3Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && prev2Col.includes('p-1')) {
              if (!mapping['pyramid1Date']) {
                mapping['pyramid1Date'] = dateCol.header;
                confidence['pyramid1Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && prev2Col.includes('p-2')) {
              if (!mapping['pyramid2Date']) {
                mapping['pyramid2Date'] = dateCol.header;
                confidence['pyramid2Date'] = 90;
              }
            }
          }
        });
      }
    };

    // Apply context-aware date mapping first
    mapDateColumnsWithContext();



    // For each field, find the best matching header (skip date if already mapped)
    Object.entries(similarityMap).forEach(([field, keywords]) => {
      // Skip if already mapped by context-aware function
      if (mapping[field]) return;

      let bestMatch = '';
      let bestScore = 0;

      headers.forEach(header => {
        keywords.forEach(keyword => {
          const score = calculateSimilarity(header, keyword);
          if (score > bestScore && score >= 60) { // Minimum threshold of 60%
            bestScore = score;
            bestMatch = header;
          }
        });
      });

      if (bestMatch && !Object.values(mapping).includes(bestMatch)) {
        mapping[field] = bestMatch;
        confidence[field] = bestScore;
      }
    });

    return { mapping, confidence };
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      Papa.parse(file, {
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            const headers = results.data[0] as string[];
            const rows = results.data.slice(1) as any[][];

            // Filter out completely empty rows and clean headers
            const cleanHeaders = headers.filter(h => h && String(h).trim() !== '');
            const cleanRows = rows.filter(row => {
              // Keep row if it has at least one non-empty, non-whitespace cell
              return row.some(cell =>
                cell !== null &&
                cell !== undefined &&
                String(cell).trim() !== '' &&
                String(cell).toLowerCase() !== 'stock name'
              );
            });

            console.log(`📄 CSV parsed: ${cleanHeaders.length} columns, ${cleanRows.length} data rows (${rows.length - cleanRows.length} empty rows filtered)`);

            setParsedData({
              headers: cleanHeaders,
              rows: cleanRows,
              fileName: file.name
            });

            const smartMapping = generateSmartMapping(cleanHeaders);
            setColumnMapping(smartMapping.mapping);
            setMappingConfidence(smartMapping.confidence);
            setStep('mapping');
          }
        },
        header: false,
        skipEmptyLines: true,
        transform: (value) => {
          // Clean up cell values and handle multi-line headers
          if (typeof value === 'string') {
            return value.trim()
              .replace(/\r\n/g, '\n')  // Normalize line endings
              .replace(/\r/g, '\n');   // Handle old Mac line endings
          }
          return value;
        }
      });
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (jsonData.length > 0) {
            const headers = jsonData[0] as string[];
            const rows = jsonData.slice(1);

            // Filter out completely empty rows and clean headers
            const cleanHeaders = headers.filter(h => h && String(h).trim() !== '');
            const cleanRows = rows.filter(row => {
              // Keep row if it has at least one non-empty, non-whitespace cell
              return row.some(cell =>
                cell !== null &&
                cell !== undefined &&
                String(cell).trim() !== '' &&
                String(cell).toLowerCase() !== 'stock name'
              );
            });

            console.log(`📊 Excel parsed: ${cleanHeaders.length} columns, ${cleanRows.length} data rows (${rows.length - cleanRows.length} empty rows filtered)`);

            setParsedData({
              headers: cleanHeaders,
              rows: cleanRows,
              fileName: file.name
            });

            const smartMapping = generateSmartMapping(cleanHeaders);
            setColumnMapping(smartMapping.mapping);
            setMappingConfidence(smartMapping.confidence);
            setStep('mapping');
          }
        } catch (error) {
          console.error('Error parsing Excel file:', error);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [generateSmartMapping]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Helper function to check if a trade is completely blank
  const isTradeCompletelyBlank = useCallback((trade: Partial<Trade>) => {
    // Check essential fields that indicate a valid trade
    const essentialFields = [
      'name', 'entry', 'initialQty', 'date'
    ];

    // A trade is considered blank if all essential fields are empty/zero
    return essentialFields.every(field => {
      const value = trade[field as keyof Trade];
      if (typeof value === 'string') {
        return !value || value.trim() === '' || value.toLowerCase() === 'stock name';
      }
      if (typeof value === 'number') {
        return value === 0;
      }
      return !value;
    });
  }, []);

  // Generate preview trades based on mapping
  const generatePreview = useCallback(() => {
    if (!parsedData) return;

    const trades: Trade[] = [];
    let validTradeCount = 0;
    let processedRows = 0;

    // Process rows until we have 5 valid trades for preview or run out of rows
    for (const row of parsedData.rows) {
      if (trades.length >= 5) break;

      processedRows++;
      const trade: Partial<Trade> = {
        id: generateId(),
        tradeNo: '',
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

      // Map values based on column mapping
      Object.entries(columnMapping).forEach(([field, column]) => {
        const columnIndex = parsedData.headers.indexOf(column);
        if (columnIndex !== -1 && row[columnIndex] !== undefined) {
          const value = row[columnIndex];

          // Type conversion based on field - ONLY for user input fields
          if (['entry', 'sl', 'tsl', 'pyramid1Price', 'pyramid2Price',
               'exit1Price', 'exit2Price', 'exit3Price'].includes(field)) {
            // Handle currency symbols for price fields
            let cleanValue = String(value || '').replace(/[₹,]/g, '').trim();
            trade[field as keyof Trade] = Number(cleanValue) || 0;
          } else if (['initialQty', 'pyramid1Qty', 'pyramid2Qty', 'exit1Qty', 'exit2Qty', 'exit3Qty'].includes(field)) {
            trade[field as keyof Trade] = Number(value) || 0;
          } else if (field === 'buySell') {
            // Handle Buy/Sell field - normalize common variations
            const buySellValue = String(value || '').toLowerCase().trim();
            if (buySellValue === 'b' || buySellValue === 'buy' || buySellValue === 'long') {
              trade[field as keyof Trade] = 'Buy';
            } else if (buySellValue === 's' || buySellValue === 'sell' || buySellValue === 'short') {
              trade[field as keyof Trade] = 'Sell';
            } else {
              trade[field as keyof Trade] = 'Buy'; // Default to Buy if unclear
            }
          } else if (field === 'planFollowed') {
            // Handle boolean fields
            const boolValue = String(value || '').toLowerCase();
            trade[field as keyof Trade] = boolValue === 'true' || boolValue === 'yes' || boolValue === '1';
          } else if (field.includes('Date') && value) {
            try {
              trade[field as keyof Trade] = new Date(value).toISOString();
            } catch {
              trade[field as keyof Trade] = value;
            }
          } else {
            trade[field as keyof Trade] = String(value || '');
          }
        }
      });

      // Only include non-blank trades in preview
      if (!isTradeCompletelyBlank(trade)) {
        validTradeCount++;
        trade.tradeNo = String(validTradeCount);
        trades.push(recalculateTradeFields(trade as Trade));
      }
    }

    console.log(`📋 Preview generated: ${trades.length} valid trades from first ${processedRows} rows`);
    setPreviewTrades(trades);
    setStep('preview');
  }, [parsedData, columnMapping, recalculateTradeFields, isTradeCompletelyBlank]);

  const handleImport = useCallback(async () => {
    if (!parsedData) return;

    setStep('importing');
    setImportProgress(0);

    const trades: Trade[] = [];
    const totalRows = parsedData.rows.length;
    let validTradeCount = 0;
    let skippedBlankTrades = 0;

    // Batch size for progress updates - larger batches for better performance
    const batchSize = Math.max(1, Math.floor(totalRows / 20)); // Update progress 20 times max

    console.log(`🔍 Processing ${totalRows} rows from import file...`);

    for (let i = 0; i < totalRows; i++) {
      const row = parsedData.rows[i];

      // Create base trade object
      const trade: Partial<Trade> = {
        id: generateId(),
        tradeNo: '', // Will be set after filtering
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

      // Map values based on column mapping
      Object.entries(columnMapping).forEach(([field, column]) => {
        const columnIndex = parsedData.headers.indexOf(column);
        if (columnIndex !== -1 && row[columnIndex] !== undefined) {
          const value = row[columnIndex];

          // Type conversion based on field - ONLY for user input fields
          if (['entry', 'sl', 'tsl', 'pyramid1Price', 'pyramid2Price',
               'exit1Price', 'exit2Price', 'exit3Price'].includes(field)) {
            // Handle currency symbols for price fields
            let cleanValue = String(value || '').replace(/[₹,]/g, '').trim();
            trade[field as keyof Trade] = Number(cleanValue) || 0;
          } else if (['initialQty', 'pyramid1Qty', 'pyramid2Qty', 'exit1Qty', 'exit2Qty', 'exit3Qty'].includes(field)) {
            trade[field as keyof Trade] = Number(value) || 0;
          } else if (field === 'buySell') {
            // Handle Buy/Sell field - normalize common variations
            const buySellValue = String(value || '').toLowerCase().trim();
            if (buySellValue === 'b' || buySellValue === 'buy' || buySellValue === 'long') {
              trade[field as keyof Trade] = 'Buy';
            } else if (buySellValue === 's' || buySellValue === 'sell' || buySellValue === 'short') {
              trade[field as keyof Trade] = 'Sell';
            } else {
              trade[field as keyof Trade] = 'Buy'; // Default to Buy if unclear
            }
          } else if (field === 'planFollowed') {
            // Handle boolean fields
            const boolValue = String(value || '').toLowerCase();
            trade[field as keyof Trade] = boolValue === 'true' || boolValue === 'yes' || boolValue === '1';
          } else if (field.includes('Date') && value) {
            try {
              trade[field as keyof Trade] = new Date(value).toISOString();
            } catch {
              trade[field as keyof Trade] = value;
            }
          } else {
            trade[field as keyof Trade] = String(value || '');
          }
        }
      });

      // Check if trade is completely blank and skip if so
      if (isTradeCompletelyBlank(trade)) {
        skippedBlankTrades++;
        console.log(`⏭️ Skipping blank trade at row ${i + 1}`);
      } else {
        // Assign sequential trade number only for valid trades
        validTradeCount++;
        trade.tradeNo = String(validTradeCount);

        // Recalculate all auto-populated fields
        const recalculatedTrade = recalculateTradeFields(trade as Trade);
        trades.push(recalculatedTrade);
      }

      // Update progress in batches for better performance
      if (i % batchSize === 0 || i === totalRows - 1) {
        setImportProgress(((i + 1) / totalRows) * 100);
        // Small delay only for UI updates, not every trade
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    console.log(`✅ Import completed: ${trades.length} valid trades imported, ${skippedBlankTrades} blank rows skipped`);

    // Import trades
    onImport(trades);

    console.log('✅ Import completed successfully');
    setImportProgress(100);

    // Small delay to show completion before closing
    setTimeout(() => {
      onOpenChange(false);

      // Reset state
      setStep('upload');
      setParsedData(null);
      setColumnMapping({});
      setMappingConfidence({});
      setPreviewTrades([]);
      setImportProgress(0);
    }, 1000);
  }, [parsedData, columnMapping, onImport, onOpenChange, recalculateTradeFields, isTradeCompletelyBlank]);



  const resetModal = useCallback(() => {
    setStep('upload');
    setParsedData(null);
    setColumnMapping({});
    setMappingConfidence({});
    setPreviewTrades([]);
    setImportProgress(0);
  }, []);

  // Test function to verify mapping with your exact CSV format
  const testMappingWithUserFormat = useCallback(() => {
    const userHeaders = [
      "Trade\nNo.", "Date", "Name", "Entry", "Avg\nEntry", "SL", "TSL", "Buy/\nSell", "CMP", "Setup",
      "Base\n Duration", "Initial\nQTY", "Pyramid-1\nPrice", "P-1\nQTY", "P-1\nDate", "Pyramid-2\nPrice",
      "P-2\nQTY", "P-2\nDate", "Position\nSize", "Allocation", "SL", "Exit-1\nPrice", "Exit-1\nQty",
      "Date", "Exit-2\nPrice", "Exit-2\nQty", "Date", "Exit-3\nPrice", "Exit-3\nQty", "Date",
      "Open \nQTY", "Exited\nQty", "Avg.\nExit\nPrice", "Stock\nMove", "Open Heat", "Reward:\nRisk",
      "Holding\n Days", "Position\nStatus", "Realised\nAmount", "P/L\nRs", "PF\nImpact", "Cumm\npf ",
      "Plan \nFollowed?", "Exit Trigger", "Proficiency", "Growth Areas", "Note"
    ];

    const smartMapping = generateSmartMapping(userHeaders);
    console.log('=== Test Mapping Results ===');
    console.log('Mapped fields:', Object.keys(smartMapping.mapping).length);
    console.log('High confidence (>90%):', Object.entries(smartMapping.confidence).filter(([_, conf]) => conf > 90).length);
    console.log('Medium confidence (70-90%):', Object.entries(smartMapping.confidence).filter(([_, conf]) => conf >= 70 && conf <= 90).length);
    console.log('Detailed mapping:', smartMapping.mapping);
    console.log('Confidence scores:', smartMapping.confidence);

    return smartMapping;
  }, [generateSmartMapping]);

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="5xl"
      scrollBehavior="inside"
      onClose={resetModal}
      classNames={{
        base: "max-h-[90vh]",
        body: "p-0",
        header: "border-b border-divider",
        footer: "border-t border-divider"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Icon icon="lucide:upload" className="text-xl text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">Import Trade Journal</h2>
                  <p className="text-sm text-foreground-500">
                    Upload your Excel/CSV file and map columns to import trades
                  </p>
                </div>
              </div>
              
              {/* Progress indicator */}
              <div className="flex items-center gap-2 mt-4">
                {['upload', 'mapping', 'preview', 'importing'].map((stepName, index) => (
                  <React.Fragment key={stepName}>
                    <div className={`flex items-center gap-2 ${
                      step === stepName ? 'text-primary' : 
                      ['upload', 'mapping', 'preview', 'importing'].indexOf(step) > index ? 'text-success' : 'text-foreground-400'
                    }`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        step === stepName ? 'bg-primary text-white' :
                        ['upload', 'mapping', 'preview', 'importing'].indexOf(step) > index ? 'bg-success text-white' : 'bg-default-200'
                      }`}>
                        {['upload', 'mapping', 'preview', 'importing'].indexOf(step) > index ? 
                          <Icon icon="lucide:check" className="w-3 h-3" /> : 
                          index + 1
                        }
                      </div>
                      <span className="text-xs font-medium capitalize">{stepName}</span>
                    </div>
                    {index < 3 && (
                      <div className={`w-8 h-0.5 ${
                        ['upload', 'mapping', 'preview', 'importing'].indexOf(step) > index ? 'bg-success' : 'bg-default-200'
                      }`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </ModalHeader>
            
            <ModalBody className="p-6">
              <AnimatePresence mode="wait">
                {step === 'upload' && (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        dragActive ? 'border-primary bg-primary/5' : 'border-default-300'
                      }`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <Icon icon="lucide:upload-cloud" className="text-4xl text-foreground-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">Upload your trade journal</h3>
                      <p className="text-foreground-500 mb-4">
                        Drag and drop your Excel (.xlsx, .xls) or CSV file here, or click to browse
                      </p>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload">
                        <Button as="span" color="primary" variant="flat">
                          <Icon icon="lucide:folder-open" className="mr-2" />
                          Choose File
                        </Button>
                      </label>
                    </div>

                    <Card>
                      <CardHeader>
                        <Icon icon="lucide:info" className="text-primary mr-2" />
                        <span className="font-medium">Supported Formats</span>
                      </CardHeader>
                      <CardBody className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Excel Files (.xlsx, .xls)</h4>
                            <p className="text-sm text-foreground-500">
                              Upload your Excel trade journal. We'll read the first sheet automatically.
                            </p>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">CSV Files (.csv)</h4>
                            <p className="text-sm text-foreground-500">
                              Upload comma-separated values file with trade data.
                            </p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  </motion.div>
                )}

                {step === 'mapping' && parsedData && (
                  <motion.div
                    key="mapping"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Icon icon="lucide:file-text" className="text-primary" />
                            <span className="font-medium">File: {parsedData.fileName}</span>
                          </div>
                          <Chip size="sm" variant="flat" color="success">
                            {parsedData.rows.length} rows detected
                          </Chip>
                        </div>
                      </CardHeader>
                      <CardBody className="pt-0">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm text-foreground-500">
                            Map your file columns to our trade journal fields. We've made smart suggestions based on column names.
                          </p>
                          <Button
                            size="sm"
                            variant="flat"
                            color="primary"
                            startContent={<Icon icon="lucide:zap" />}
                            onPress={() => {
                              if (parsedData) {
                                const smartMapping = generateSmartMapping(parsedData.headers);
                                setColumnMapping(smartMapping.mapping);
                                setMappingConfidence(smartMapping.confidence);
                              }
                            }}
                          >
                            Smart Re-map
                          </Button>
                        </div>

                        {/* Mapping Summary */}
                        <div className="mb-4 p-3 bg-default-50 rounded-lg">
                          <div className="flex items-center justify-between text-sm">
                            <span>Mapping Progress:</span>
                            <div className="flex gap-4">
                              <span className="text-success">
                                {Object.keys(columnMapping).length} mapped
                              </span>
                              <span className="text-warning">
                                {MAPPABLE_FIELDS.filter(f => f.required && !columnMapping[f.key]).length} required missing
                              </span>
                              <span className="text-default-500">
                                {MAPPABLE_FIELDS.length - Object.keys(columnMapping).length} unmapped
                              </span>
                            </div>
                          </div>
                        </div>

                        <ScrollShadow className="max-h-96">
                          <div className="space-y-3">
                            {MAPPABLE_FIELDS.map((field) => (
                              <div key={field.key} className="flex items-center gap-4">
                                <div className="min-w-[200px]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{field.label}</span>
                                    {field.required && (
                                      <Chip size="sm" color="danger" variant="flat">Required</Chip>
                                    )}
                                    {mappingConfidence[field.key] && (
                                      <Chip
                                        size="sm"
                                        variant="flat"
                                        color={
                                          mappingConfidence[field.key] >= 90 ? "success" :
                                          mappingConfidence[field.key] >= 70 ? "warning" : "default"
                                        }
                                      >
                                        {mappingConfidence[field.key].toFixed(0)}% match
                                      </Chip>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <Select
                                    placeholder="Select column or skip"
                                    size="sm"
                                    selectedKeys={columnMapping[field.key] ? [columnMapping[field.key]] : []}
                                    onSelectionChange={(keys) => {
                                      const selectedKey = Array.from(keys)[0] as string;
                                      if (selectedKey) {
                                        setColumnMapping(prev => ({
                                          ...prev,
                                          [field.key]: selectedKey
                                        }));
                                        // Clear confidence when manually changed
                                        setMappingConfidence(prev => {
                                          const newConfidence = { ...prev };
                                          delete newConfidence[field.key];
                                          return newConfidence;
                                        });
                                      } else {
                                        setColumnMapping(prev => {
                                          const newMapping = { ...prev };
                                          delete newMapping[field.key];
                                          return newMapping;
                                        });
                                        setMappingConfidence(prev => {
                                          const newConfidence = { ...prev };
                                          delete newConfidence[field.key];
                                          return newConfidence;
                                        });
                                      }
                                    }}
                                  >
                                    {parsedData.headers.map((header) => (
                                      <SelectItem key={header} value={header}>
                                        {header}
                                      </SelectItem>
                                    ))}
                                  </Select>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollShadow>
                      </CardBody>
                    </Card>
                  </motion.div>
                )}

                {step === 'preview' && previewTrades.length > 0 && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Icon icon="lucide:eye" className="text-primary" />
                            <span className="font-medium">Preview Import</span>
                          </div>
                          <Chip size="sm" variant="flat" color="primary">
                            Showing first 5 rows
                          </Chip>
                        </div>
                      </CardHeader>
                      <CardBody className="pt-0">
                        <div className="mb-4">
                          <p className="text-sm text-foreground-500 mb-2">
                            Review the mapped data before importing. Check if the values look correct.
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
                              <Icon icon="lucide:calculator" className="text-primary" />
                              <span className="text-sm text-primary font-medium">
                                Auto-calculated fields (Avg Entry, Position Size, Allocation %, P/L, etc.) are highlighted in blue
                              </span>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-warning/10 rounded-lg">
                              <Icon icon="lucide:info" className="text-warning" />
                              <span className="text-sm text-warning font-medium">
                                CMP values from CSV will be imported as-is (no auto-fetching)
                              </span>
                            </div>
                          </div>
                        </div>

                        <ScrollShadow className="max-h-96">
                          <Table aria-label="Preview table" className="min-w-full">
                            <TableHeader>
                              <TableColumn>Name</TableColumn>
                              <TableColumn>Date</TableColumn>
                              <TableColumn>Entry</TableColumn>
                              <TableColumn>Avg Entry</TableColumn>
                              <TableColumn>Qty</TableColumn>
                              <TableColumn>Position Size</TableColumn>
                              <TableColumn>Allocation %</TableColumn>
                              <TableColumn>Status</TableColumn>
                              <TableColumn>P/L</TableColumn>
                            </TableHeader>
                            <TableBody>
                              {previewTrades.map((trade, index) => (
                                <TableRow key={index}>
                                  <TableCell>{trade.name || '-'}</TableCell>
                                  <TableCell>
                                    {trade.date ? new Date(trade.date).toLocaleDateString() : '-'}
                                  </TableCell>
                                  <TableCell>₹{trade.entry?.toFixed(2) || '0.00'}</TableCell>
                                  <TableCell>
                                    <span className="text-primary font-medium">
                                      ₹{trade.avgEntry?.toFixed(2) || '0.00'}
                                    </span>
                                  </TableCell>
                                  <TableCell>{trade.initialQty || 0}</TableCell>
                                  <TableCell>
                                    <span className="text-primary font-medium">
                                      ₹{trade.positionSize?.toLocaleString() || '0'}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-primary font-medium">
                                      {trade.allocation?.toFixed(2) || '0.00'}%
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Chip size="sm" variant="flat" color={
                                      trade.positionStatus === 'Open' ? 'warning' :
                                      trade.positionStatus === 'Closed' ? 'success' : 'primary'
                                    }>
                                      {trade.positionStatus}
                                    </Chip>
                                  </TableCell>
                                  <TableCell>
                                    <span className={trade.plRs >= 0 ? 'text-success' : 'text-danger'}>
                                      ₹{trade.plRs?.toFixed(2) || '0.00'}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollShadow>
                      </CardBody>
                    </Card>
                  </motion.div>
                )}

                {step === 'importing' && (
                  <motion.div
                    key="importing"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <Card>
                      <CardBody className="text-center py-12">
                        <Icon icon="lucide:loader-2" className="text-4xl text-primary mx-auto mb-4 animate-spin" />
                        <h3 className="text-lg font-medium mb-2">
                          Importing Trades
                        </h3>
                        <p className="text-foreground-500 mb-4">
                          Please wait while we import your trades...
                        </p>
                        <div className="space-y-3 mb-6">
                          <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg">
                            <Icon icon="lucide:zap" className="text-primary" />
                            <span className="text-sm text-primary font-medium">
                              Using optimized import - calculations will complete in background
                            </span>
                          </div>
                        </div>
                        <Progress
                          value={importProgress}
                          className="max-w-md mx-auto"
                          color="primary"
                          showValueLabel
                        />
                      </CardBody>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </ModalBody>
            
            <ModalFooter>
              <div className="flex justify-between w-full">
                <div>
                  {step !== 'upload' && step !== 'importing' && (
                    <Button
                      variant="light"
                      onPress={() => {
                        if (step === 'mapping') setStep('upload');
                        else if (step === 'preview') setStep('mapping');
                      }}
                      startContent={<Icon icon="lucide:arrow-left" />}
                    >
                      Back
                    </Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="light" onPress={onClose} isDisabled={step === 'importing'}>
                    Cancel
                  </Button>

                  {step === 'mapping' && (
                    <Button
                      color="primary"
                      onPress={generatePreview}
                      isDisabled={MAPPABLE_FIELDS.filter(f => f.required).some(field => !columnMapping[field.key])}
                      endContent={<Icon icon="lucide:arrow-right" />}
                    >
                      Preview
                    </Button>
                  )}

                  {step === 'preview' && (
                    <Button
                      color="success"
                      onPress={handleImport}
                      endContent={<Icon icon="lucide:upload" />}
                    >
                      Import {parsedData?.rows.length} Trades
                    </Button>
                  )}
                </div>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
