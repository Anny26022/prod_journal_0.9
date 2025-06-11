import React, { useMemo } from 'react';
import { Card, CardBody, CardHeader, Divider, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from "@heroui/react";
import { useTrades } from '../hooks/use-trades';
import { useTruePortfolioWithTrades } from '../hooks/use-true-portfolio-with-trades';
import { Icon } from '@iconify/react';
import { motion } from "framer-motion"; // Import motion for StatsCard animation
import SetupFrequencyChart from '../components/analytics/SetupFrequencyChart'; // Import the new chart component
import { loadIndustrySectorMapping, getIndustrySectorByName } from '../utils/industrySectorMap';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import IndustryDistributionChart from '../components/analytics/IndustryDistributionChart';
import { Accordion, AccordionItem } from "@heroui/react";
import PnLDistributionCharts from '../components/analytics/PnLDistributionCharts';
import TradeHeatmap from '../components/analytics/TradeHeatmap';
import { useGlobalFilter } from '../context/GlobalFilterContext';
import { 
  getUniqueSortedDates,
  calculateDailyPortfolioValues,
  calculateDailyReturns,
  calculateStandardDeviation,
  calculateMaxDrawdown,
  calculateDownsideDeviation,
  calculateSharpeRatio,
  calculateCalmarRatio,
  calculateSortinoRatio,
  annualizeMetric,
  calcUnrealizedPL // Import calcUnrealizedPL if not already imported
} from '../utils/tradeCalculations';

// Assuming Trade type is available from useTrades or a common types file
// import { Trade } from '../types/trade'; 

// Placeholder type if not explicitly imported (ensure these match your actual Trade type structure)
interface Trade {
    id: string;
    name: string;
    positionStatus: "Open" | "Closed" | "Partial";
    positionSize: number; // Assuming positionSize is available
    plRs: number; // Add plRs for calculating win/loss stats
    holdingDays: number; // Add holdingDays for hold time stats
    date: string; // Add date for streak calculation
    pfImpact: number; // Add pfImpact for percentage-based calculations
    setup?: string; // Ensure setup is included for the chart
    avgEntry?: number;
    cmp?: number;
    openQty?: number;
    buySell?: 'Buy' | 'Sell';
}


const DeepAnalyticsPage: React.FC = () => { // Renamed component
    const { trades, isLoading } = useTrades();
    const { portfolioSize, capitalChanges } = useTruePortfolioWithTrades(trades);
    const { filter } = useGlobalFilter();
    const [mappingLoaded, setMappingLoaded] = React.useState(false);

    // Load industry/sector mapping on mount
    React.useEffect(() => {
        loadIndustrySectorMapping().then(() => setMappingLoaded(true));
    }, []);

    // Augment trades with industry/sector
    const tradesWithIndustry = useMemo(() => {
        if (!mappingLoaded) return [];
        return trades.map(trade => {
            const info = getIndustrySectorByName(trade.name);
            return {
                ...trade,
                industry: info?.industry || 'Unknown',
                sector: info?.sector || 'Unknown',
            };
        });
    }, [trades, mappingLoaded]);

    // Group trades by industry and sector to get stock names for tooltips
    const tradesByIndustry = useMemo(() => {
        if (!tradesWithIndustry.length) return {};
        return tradesWithIndustry.reduce((acc, trade) => {
            const key = trade.industry;
            if (!acc[key]) acc[key] = [];
            acc[key].push(trade);
            return acc;
        }, {} as Record<string, typeof tradesWithIndustry>);
    }, [tradesWithIndustry]);

    const industryChartData = useMemo(() => {
        return Object.entries(tradesByIndustry)
            .map(([name, trades]) => ({
                name,
                trades: trades.length,
                stockNames: [...new Set(trades.map(t => t.name))]
            }))
            .sort((a, b) => b.trades - a.trades);
    }, [tradesByIndustry]);

    const tradesBySector = useMemo(() => {
        if (!tradesWithIndustry.length) return {};
        return tradesWithIndustry.reduce((acc, trade) => {
            const key = trade.sector;
            if (!acc[key]) acc[key] = [];
            acc[key].push(trade);
            return acc;
        }, {} as Record<string, typeof tradesWithIndustry>);
    }, [tradesWithIndustry]);

    const sectorChartData = useMemo(() => {
        return Object.entries(tradesBySector)
            .map(([name, trades]) => ({
                name,
                trades: trades.length,
                stockNames: [...new Set(trades.map(t => t.name))]
            }))
            .sort((a, b) => b.trades - a.trades);
    }, [tradesBySector]);

    const industryStats = useMemo(() => {
        if (industryChartData.length === 0) {
            return { most: 'N/A', least: 'N/A', mostStocks: [], leastStocks: [] };
        }
        const most = industryChartData[0];
        const least = industryChartData[industryChartData.length - 1];
        return {
            most: most.name,
            least: least.name,
            mostStocks: most.stockNames || [],
            leastStocks: least.stockNames || []
        };
    }, [industryChartData]);

    const sectorStats = useMemo(() => {
        if (sectorChartData.length === 0) {
            return { most: 'N/A', least: 'N/A', mostStocks: [], leastStocks: [] };
        }
        const most = sectorChartData[0];
        const least = sectorChartData[sectorChartData.length - 1];
        return {
            most: most.name,
            least: least.name,
            mostStocks: most.stockNames || [],
            leastStocks: least.stockNames || []
        };
    }, [sectorChartData]);

    const setupPerformance = useMemo(() => {
        const tradesWithSetup = trades.filter(t => t.setup && t.setup.trim() !== '');

        if (tradesWithSetup.length === 0) {
            return [];
        }

        const tradesBySetup = tradesWithSetup.reduce((acc, trade) => {
            const key = trade.setup!;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(trade);
            return acc;
        }, {} as Record<string, typeof tradesWithSetup>);

        const setupStats = Object.entries(tradesBySetup).map(([setupName, setupTrades]) => {
            const totalTrades = setupTrades.length;
            const winningTrades = setupTrades.filter(t => t.plRs > 0).length;
            const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
            const totalPfImpact = setupTrades.reduce((sum, trade) => sum + trade.pfImpact, 0);
            
        return {
                id: setupName,
                name: setupName,
                totalTrades,
                winRate,
                totalPfImpact,
        };
        });

        // Sort by total PF impact to show most impactful setups first
        return setupStats.sort((a, b) => b.totalPfImpact - a.totalPfImpact);
    }, [trades]);

    // --- Calculations for Deep Analytics --- //
    const analytics = useMemo(() => {
        const closedTrades = trades.filter(trade => trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial');
        const totalTrades = closedTrades.length;

        if (totalTrades === 0) {
            return {
                expectancy: 0,
                profitFactor: 0,
                avgWinHold: 0,
                avgLossHold: 0,
                avgWin: 0,
                avgLoss: 0,
                winStreak: 0,
                lossStreak: 0,
                topWin: 0,
                topLoss: 0,
                avgWinPfImpact: 0,
                avgLossPfImpact: 0,
                totalPositivePfImpact: 0,
                totalAbsoluteNegativePfImpact: 0,
                avgPnLPerDay: 0,
                uniqueTradingDays: 0,
                sharpeRatio: 0,
                calmarRatio: 0,
                sortinoRatio: 0,
                annualizedAverageReturn: 0,
                annualRiskFreeRate: 0,
                annualizedStdDev: 0,
                annualizedDownsideDev: 0,
                maxDrawdown: 0
            };
        }

        const winningTrades = closedTrades.filter(trade => trade.plRs > 0);
        const losingTrades = closedTrades.filter(trade => trade.plRs < 0);
        const totalWinningTrades = winningTrades.length;
        const totalLosingTrades = losingTrades.length;

        // Calculate total P&L and total trading days
        const totalPnL = closedTrades.reduce((sum, trade) => sum + trade.plRs, 0);
        const uniqueTradingDays = new Set(closedTrades.map(trade => trade.date.split('T')[0])).size;
        const avgPnLPerDay = uniqueTradingDays > 0 ? totalPnL / uniqueTradingDays : 0;

        // Calculate total positive and negative PF Impact
        const totalPositivePfImpact = winningTrades.reduce((sum, trade) => sum + trade.pfImpact, 0);
        const totalAbsoluteNegativePfImpact = losingTrades.reduce((sum, trade) => sum + Math.abs(trade.pfImpact), 0);

        // Calculate average PF Impact for winning and losing trades
        const avgWinPfImpact = totalWinningTrades > 0 ? totalPositivePfImpact / totalWinningTrades : 0;
        const avgLossPfImpact = totalLosingTrades > 0 ? totalAbsoluteNegativePfImpact / totalLosingTrades : 0;

        const winRate = totalTrades > 0 ? totalWinningTrades / totalTrades : 0;
        const lossRate = totalTrades > 0 ? totalLosingTrades / totalTrades : 0;

        // Expectancy (using Average PF Impact and Rates)
        const expectancy = (avgWinPfImpact * winRate) - (avgLossPfImpact * lossRate);

        // Profit Factor (using Total PF Impact)
        const profitFactor = totalAbsoluteNegativePfImpact > 0 ? totalPositivePfImpact / totalAbsoluteNegativePfImpact : totalPositivePfImpact > 0 ? Infinity : 0; // Handle division by zero

        // Recalculate Avg Win/Loss and Top Win/Loss using plRs (these are still useful in absolute terms)
        const totalProfit = winningTrades.reduce((sum, trade) => sum + trade.plRs, 0);
        const totalLoss = losingTrades.reduce((sum, trade) => sum + Math.abs(trade.plRs), 0); // Use absolute for total loss

        const avgWin = totalWinningTrades > 0 ? totalProfit / totalWinningTrades : 0;
        const avgLoss = totalLosingTrades > 0 ? totalLoss / totalLosingTrades : 0; // This will be a positive value

        const avgWinHold = totalWinningTrades > 0 ? winningTrades.reduce((sum, trade) => sum + trade.holdingDays, 0) / totalWinningTrades : 0;
        const avgLossHold = totalLosingTrades > 0 ? losingTrades.reduce((sum, trade) => sum + trade.holdingDays, 0) / totalLosingTrades : 0;

        const topWin = totalWinningTrades > 0 ? Math.max(...winningTrades.map(trade => trade.plRs)) : 0;
        const topLoss = totalLosingTrades > 0 ? Math.min(...losingTrades.map(trade => trade.plRs)) : 0; // Will be a negative value

        // Calculate Win/Loss Streaks (remains based on plRs)
        let currentWinStreak = 0;
        let maxWinStreak = 0;
        let currentLossStreak = 0;
        let maxLossStreak = 0;

        // Iterate through trades in chronological order to calculate streaks
        const sortedTradesByDate = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const trade of sortedTradesByDate) {
            if (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial') { // Only consider closed or partial trades for streaks
                 if (trade.plRs > 0) {
                    currentWinStreak++;
                    maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
                    currentLossStreak = 0;
                } else if (trade.plRs < 0) {
                    currentLossStreak++;
                    maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                    currentWinStreak = 0;
                } else { // breakeven or zero P/L
                     maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                     maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
                     currentWinStreak = 0;
                     currentLossStreak = 0;
                }
            }
        }

        // Account for streaks ending at the last trade
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);

        // --- Calculate Sharpe, Calmar, Sortino Ratios ---
        const allTradesForMetrics = trades; // Use all trades for portfolio value calculation
        const dailyPortfolioValues = calculateDailyPortfolioValues(allTradesForMetrics, capitalChanges);
        const dailyReturnsMap = calculateDailyReturns(dailyPortfolioValues);
        const dailyReturnsArray = Array.from(dailyReturnsMap.values());

        // Define risk-free rate (e.g., 5% annually, convert to daily)
        const annualRiskFreeRate = 0.05; // 5%
        const dailyRiskFreeRate = Math.pow(1 + annualRiskFreeRate, 1/252) - 1; // Assuming 252 trading days

        // Calculate annualized average return (from daily returns)
        const averageDailyReturn = dailyReturnsArray.length > 0 ? dailyReturnsArray.reduce((sum, r) => sum + r, 0) / dailyReturnsArray.length : 0;
        const annualizedAverageReturn = Math.pow(1 + averageDailyReturn, 252) - 1; // Annualize daily avg return

        // Calculate annualized standard deviation of daily returns
        const dailyStdDev = calculateStandardDeviation(dailyReturnsArray);
        const annualizedStdDev = annualizeMetric(dailyStdDev, 252); // Use the helper to annualize volatility

        // Calculate Max Drawdown
        const maxDrawdown = calculateMaxDrawdown(dailyPortfolioValues);

        // Calculate Downside Deviation
        const downsideReturns = dailyReturnsArray.filter(r => r < dailyRiskFreeRate); // Filter for returns below risk-free rate
        const dailyDownsideDev = calculateDownsideDeviation(downsideReturns, dailyRiskFreeRate);
        const annualizedDownsideDev = annualizeMetric(dailyDownsideDev, 252);

        // Calculate Ratios
        const sharpeRatio = calculateSharpeRatio(annualizedAverageReturn, dailyRiskFreeRate, dailyStdDev);
        const calmarRatio = calculateCalmarRatio(annualizedAverageReturn, maxDrawdown);
        const sortinoRatio = calculateSortinoRatio(annualizedAverageReturn, dailyRiskFreeRate, dailyDownsideDev);

        return {
            expectancy: isFinite(expectancy) ? expectancy : 0,
            profitFactor: isFinite(profitFactor) ? profitFactor : (totalPositivePfImpact > 0 ? Infinity : 0),
            avgWinHold: Math.round(avgWinHold),
            avgLossHold: Math.round(avgLossHold),
            avgWin,
            avgLoss,
            winStreak: maxWinStreak,
            lossStreak: maxLossStreak,
            topWin,
            topLoss,
            avgWinPfImpact: avgWinPfImpact,
            avgLossPfImpact: avgLossPfImpact,
            totalPositivePfImpact: totalPositivePfImpact,
            totalAbsoluteNegativePfImpact: totalAbsoluteNegativePfImpact,
            avgPnLPerDay,
            uniqueTradingDays,
            sharpeRatio: isNaN(sharpeRatio) || !isFinite(sharpeRatio) ? 0 : sharpeRatio,
            calmarRatio: isNaN(calmarRatio) || !isFinite(calmarRatio) ? 0 : calmarRatio,
            sortinoRatio: isNaN(sortinoRatio) || !isFinite(sortinoRatio) ? 0 : sortinoRatio,
            annualizedAverageReturn,
            annualRiskFreeRate,
            annualizedStdDev,
            annualizedDownsideDev,
            maxDrawdown
        };

    }, [trades, capitalChanges]);
    // --- End Calculations ---

    // Define color palettes for the charts
    const industryColors = ['#4A8DFF', '#34D399', '#FF6B6B', '#FFC107', '#A78BFA', '#64748B'];
    const sectorColors = ['#56B4E9', '#009E73', '#F0E442', '#E69F00', '#D55E00', '#CC79A7'];

    // Calculate and sort top allocations
    const topAllocations = useMemo(() => {
        if (!trades || trades.length === 0 || !portfolioSize || portfolioSize <= 0) {
            return [];
        }

        const openAndPartialTrades = trades.filter(trade =>
            trade.positionStatus === 'Open' || trade.positionStatus === 'Partial'
        );

        // Calculate allocation for each open/partial trade
        // Assuming allocation is (positionSize / portfolioSize) * 100
        const tradesWithAllocation = openAndPartialTrades.map(trade => ({
            ...trade,
            calculatedAllocation: trade.positionSize && portfolioSize > 0 
                ? (trade.positionSize / portfolioSize) * 100
                : 0
        }));

        // Sort by calculatedAllocation descending
        return tradesWithAllocation.sort((a, b) => b.calculatedAllocation - a.calculatedAllocation);

    }, [trades, portfolioSize]);

    const columns = [
        { key: "name", label: "Stock/Asset" },
        { key: "positionStatus", label: "Status" },
        { key: "positionSize", label: "Position Size (₹)" },
        { key: "calculatedAllocation", label: "Allocation (%)" },
    ];

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(value);
      };

    const renderCell = (item: Trade & { calculatedAllocation: number }, columnKey: string) => {
        const cellValue = item[columnKey as keyof typeof item];

        switch (columnKey) {
            case 'positionSize':
                return formatCurrency(cellValue as number);
            case 'calculatedAllocation':
                return `${(cellValue as number).toFixed(2)}%`;
            case 'positionStatus':
                return (
                    <span className={`capitalize px-2 py-0.5 rounded-full text-xs font-medium 
                        ${item.positionStatus === 'Open' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                         item.positionStatus === 'Partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                         'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                    >
                        {cellValue}
                    </span>
                );
            default:
                return String(cellValue);
        }
    };

    // Custom Tooltip for Charts
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="p-2.5 bg-background border border-divider shadow-lg rounded-lg">
                    <p className="text-sm font-bold text-foreground">{label}</p>
                    <p className="text-xs text-foreground-600">Trades: {payload[0].value}</p>
                </div>
            );
        }
        return null;
    };

    // Helper to get date range from global filter
    function getDateRangeFromFilter(filter) {
        const today = new Date();
        let startDate: Date | undefined = undefined;
        let endDate: Date | undefined = undefined;
        if (filter.type === 'all') {
            // Use all trades
            return { startDate: undefined, endDate: undefined };
        } else if (filter.type === 'week') {
            endDate = today;
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 6);
        } else if (filter.type === 'month') {
            const year = filter.year ?? today.getFullYear();
            const month = filter.month ?? today.getMonth();
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0);
        } else if (filter.type === 'fy') {
            // Financial year: April 1st to March 31st
            const year = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
            startDate = new Date(year, 3, 1);
            endDate = new Date(year + 1, 2, 31);
        } else if (filter.type === 'cy') {
            // Calendar year
            const year = today.getFullYear();
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31);
        } else if (filter.type === 'custom') {
            startDate = filter.startDate ? new Date(filter.startDate) : undefined;
            endDate = filter.endDate ? new Date(filter.endDate) : undefined;
        }
        return { startDate, endDate };
    }

    const { startDate: globalStartDate, endDate: globalEndDate } = getDateRangeFromFilter(filter);

    // Filter trades by date range
    const filteredTrades = React.useMemo(() => {
        if (!globalStartDate && !globalEndDate) return trades;
        return trades.filter(trade => {
            const tradeDate = new Date(trade.date.split('T')[0]);
            if (globalStartDate && tradeDate < globalStartDate) return false;
            if (globalEndDate && tradeDate > globalEndDate) return false;
            return true;
        });
    }, [trades, globalStartDate, globalEndDate]);

    // Calculate min and max trade dates for heatmap (within filtered trades)
    const tradeDates = filteredTrades.map(t => t.date.split('T')[0]);
    const heatmapStartDate = globalStartDate ? globalStartDate.toISOString().split('T')[0] : (tradeDates.length > 0 ? tradeDates.reduce((a, b) => a < b ? a : b) : '');
    const heatmapEndDate = globalEndDate ? globalEndDate.toISOString().split('T')[0] : (tradeDates.length > 0 ? tradeDates.reduce((a, b) => a > b ? a : b) : '');

    // Helper function to format percentages
    const formatPercentage = (value: number) => {
        return `${(value).toFixed(2)}%`;
    };

    const formatRatio = (value: number) => {
      return value.toFixed(2);
    };

    // StatsCard Component (already exists, but adding for context if it were new)
    interface StatsCardProps {
        title: string;
        value: React.ReactNode;
        icon: string;
        color: "primary" | "success" | "warning" | "danger" | "info"; // Added info color for new stats
        tooltipContent?: string; // Optional tooltip content
    }

    const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, color, tooltipContent }) => {
        const getColors = () => {
            switch (color) {
                case "primary": return { bg: "bg-blue-50 dark:bg-blue-900/10", text: "text-blue-700 dark:text-blue-400", icon: "text-blue-600 dark:text-blue-400" };
                case "success": return { bg: "bg-emerald-50 dark:bg-emerald-900/10", text: "text-emerald-700 dark:text-emerald-400", icon: "text-emerald-600 dark:text-emerald-400" };
                case "warning": return { bg: "bg-amber-50 dark:bg-amber-900/10", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-600 dark:text-amber-400" };
                case "danger": return { bg: "bg-red-50 dark:bg-red-900/10", text: "text-red-700 dark:text-red-400", icon: "text-red-600 dark:text-red-400" };
                case "info": return { bg: "bg-sky-50 dark:bg-sky-900/10", text: "text-sky-700 dark:text-sky-400", icon: "text-sky-600 dark:text-sky-400" }; // New info color
                default: return { bg: "bg-gray-50 dark:bg-gray-900/10", text: "text-gray-700 dark:text-gray-400", icon: "text-gray-600 dark:text-gray-400" };
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
            <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-background">
              <CardBody className="p-6">
                <motion.div 
                  className="flex justify-between items-start will-change-transform"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="space-y-2">
                    <motion.p 
                      className="text-foreground-500 text-sm font-medium"
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
                      {value} {tooltipContent && (
                        <Tooltip 
                          content={tooltipContent} 
                          placement="top" 
                          radius="sm" 
                          shadow="md"
                          classNames={{ content: "bg-content1 border border-divider z-50 max-w-xs text-xs" }}
                        >
                          <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-help" />
                        </Tooltip>
                      )}
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
      };

    if (isLoading || !mappingLoaded) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <p className="text-foreground">Loading analytics...</p>
            </div>
        );
    }

    return (
        <motion.div 
            className="p-4 sm:p-6 space-y-6 bg-background"
            initial="hidden"
            animate="visible"
            variants={{
                hidden: { opacity: 0 },
                visible: {
                    opacity: 1,
                    transition: {
                        staggerChildren: 0.1
                    }
                }
            }}
        >
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                <Card>
                    <CardHeader>
                        <h2 className="text-xl font-bold text-default-700 flex items-center gap-2">
                            <Icon icon="lucide:gauge-circle" className="text-primary" />
                            Key Performance Metrics
                        </h2>
                    </CardHeader>
                    <Divider />
                    <CardBody>
            {!isLoading && (
                             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                 <StatsCard 
                                    title="Avg. PnL/Day" 
                    value={
                        <div className="flex items-center gap-1">
                                            {formatCurrency(analytics.avgPnLPerDay)}
                             <Tooltip 
                                                content={
                                                    <div className="p-2">
                                                        <p className="font-semibold mb-1">Trading Days Approach</p>
                                                        <p className="text-xs">Calculated using only days with active trades:</p>
                                                        <p className="text-xs mt-1">Total P&L ÷ Number of Trading Days</p>
                                                        <p className="text-xs mt-2 text-default-500">* Trading days: {analytics.uniqueTradingDays}</p>
                                                    </div>
                                                } 
                                placement="top" 
                                radius="sm" 
                                shadow="md"
                                                classNames={{ 
                                                    content: "bg-content1 border border-divider z-50 max-w-xs" 
                                                }}
                            >
                                <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-help" />
                            </Tooltip>
                        </div>
                    }
                                    icon="lucide:calendar-clock" 
                                    color={analytics.avgPnLPerDay >= 0 ? "success" : "danger"}
                />
                                 <StatsCard title="Expectancy (%)" value={<div className="flex items-center gap-1">{analytics.expectancy.toFixed(2)}%</div>} icon="lucide:trending-up" color={analytics.expectancy >= 0 ? "success" : "danger"} tooltipContent="Average amount you can expect to win or lose per trade. (Avg Win PF Impact * Win Rate) - (Avg Loss PF Impact * Loss Rate)"/>
                                 <StatsCard title="Profit Factor" value={<div className="flex items-center gap-1">{isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : "∞"}</div>} icon="lucide:line-chart" color={analytics.profitFactor >= 1 ? "success" : "danger"} tooltipContent="Ratio of gross profits to gross losses. Higher than 1 is profitable. Total Positive PF Impact / Total Absolute Negative PF Impact"/>
                                 <StatsCard title="Avg Win Hold" value={`${analytics.avgWinHold} Day${analytics.avgWinHold !== 1 ? 's' : ''}`} icon="lucide:clock" color="success" tooltipContent="Average number of days winning trades were held."/>
                                 <StatsCard title="Avg Loss Hold" value={`${analytics.avgLossHold} Day${analytics.avgLossHold !== 1 ? 's' : ''}`} icon="lucide:clock" color="danger" tooltipContent="Average number of days losing trades were held."/>
                                 <StatsCard title="Avg Win (₹)" value={formatCurrency(analytics.avgWin)} icon="lucide:trending-up" color="success" tooltipContent="Average profit from winning trades."/>
                                 <StatsCard title="Avg Loss (₹)" value={formatCurrency(-analytics.avgLoss)} icon="lucide:trending-down" color="danger" tooltipContent="Average loss from losing trades."/>
                                 <StatsCard title="Win Streak" value={analytics.winStreak.toString()} icon="lucide:medal" color="primary" tooltipContent="Longest consecutive sequence of winning trades."/>
                                 <StatsCard title="Loss Streak" value={analytics.lossStreak.toString()} icon="lucide:alert-triangle" color="danger" tooltipContent="Longest consecutive sequence of losing trades."/>
                                 <StatsCard title="Top Win (₹)" value={formatCurrency(analytics.topWin)} icon="lucide:star" color="success" tooltipContent="Largest profit from a single trade."/>
                                 <StatsCard title="Top Loss (₹)" value={formatCurrency(analytics.topLoss)} icon="lucide:skull" color="danger" tooltipContent="Largest loss from a single trade."/>
                                 <StatsCard 
                                    title="Sharpe Ratio" 
                                    value={formatRatio(analytics.sharpeRatio)} 
                                    icon="lucide:trending-up" 
                                    color={analytics.sharpeRatio >= 0 ? "info" : "danger"}
                                    tooltipContent={
                                        `Measures risk-adjusted return. Higher is better.
Formula: (Annualized Return - Risk-Free Rate) / Annualized Standard Deviation of Returns
Values: (${analytics.annualizedAverageReturn.toFixed(2)} - ${analytics.annualRiskFreeRate.toFixed(2)}) / ${analytics.annualizedStdDev.toFixed(2)}`
                                    }
                                />
                                <StatsCard 
                                    title="Calmar Ratio" 
                                    value={formatRatio(analytics.calmarRatio)} 
                                    icon="lucide:activity" 
                                    color={analytics.calmarRatio >= 0 ? "info" : "danger"}
                                    tooltipContent={
                                        `Measures risk-adjusted return relative to maximum drawdown. Higher is better.
Formula: Annualized Return / Max Drawdown
Values: ${analytics.annualizedAverageReturn.toFixed(2)} / ${analytics.maxDrawdown.toFixed(2)}`
                                    }
                                />
                                <StatsCard 
                                    title="Sortino Ratio" 
                                    value={formatRatio(analytics.sortinoRatio)} 
                                    icon="lucide:arrow-down-left" 
                                    color={analytics.sortinoRatio >= 0 ? "info" : "danger"}
                                    tooltipContent={
                                        `Measures risk-adjusted return using downside deviation. Higher is better.
Formula: (Annualized Return - Risk-Free Rate) / Annualized Downside Deviation
Values: (${analytics.annualizedAverageReturn.toFixed(2)} - ${analytics.annualRiskFreeRate.toFixed(2)}) / ${analytics.annualizedDownsideDev.toFixed(2)}`
                                    }
                                />
                            </div>
                        )}
                    </CardBody>
                </Card>
            </motion.div>

            <Accordion selectionMode="multiple" defaultExpandedKeys={["1"]} variant="bordered">
                <AccordionItem key="1" aria-label="Industry & Sector Analysis" title={
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Icon icon="lucide:factory" className="text-secondary" />
                        Industry & Sector Analysis
                    </h2>
                }>
                    <div className="space-y-4 p-2">
                        {mappingLoaded && tradesWithIndustry.length > 0 && industryChartData.length > 0 && sectorChartData.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Tooltip content={<p className="text-xs break-words p-1">{industryStats.mostStocks.join(', ')}</p>} placement="top" radius="sm" shadow="md" classNames={{ content: "bg-content1 border border-divider" }}>
                                    <div><StatsCard title="Most Traded Industry" value={industryStats.most} icon="lucide:trending-up" color="primary" /></div>
                                </Tooltip>
                                <Tooltip content={<p className="text-xs break-words p-1">{industryStats.leastStocks.join(', ')}</p>} placement="top" radius="sm" shadow="md" classNames={{ content: "bg-content1 border border-divider" }}>
                                    <div><StatsCard title="Least Traded Industry" value={industryStats.least} icon="lucide:trending-down" color="warning" /></div>
                                </Tooltip>
                                <Tooltip content={<p className="text-xs break-words p-1">{sectorStats.mostStocks.join(', ')}</p>} placement="top" radius="sm" shadow="md" classNames={{ content: "bg-content1 border border-divider" }}>
                                    <div><StatsCard title="Most Traded Sector" value={sectorStats.most} icon="lucide:trending-up" color="primary" /></div>
                                </Tooltip>
                                <Tooltip content={<p className="text-xs break-words p-1">{sectorStats.leastStocks.join(', ')}</p>} placement="top" radius="sm" shadow="md" classNames={{ content: "bg-content1 border border-divider" }}>
                                    <div><StatsCard title="Least Traded Sector" value={sectorStats.least} icon="lucide:trending-down" color="warning" /></div>
                            </Tooltip>
                        </div>
                        ) : (
                            <div className="text-foreground-400 text-lg font-medium text-center w-full py-12">No data in this period.</div>
                        )}
                        {mappingLoaded && tradesWithIndustry.length > 0 && industryChartData.length > 0 && sectorChartData.length > 0 ? (
                            <div className="space-y-6">
                                {industryChartData.length > 0 && <IndustryDistributionChart data={industryChartData} colors={industryColors} title="Industry" />}
                                {sectorChartData.length > 0 && <IndustryDistributionChart data={sectorChartData} colors={sectorColors} title="Sector" />}
                            </div>
                        ) : null}
                    </div>
                </AccordionItem>

                <AccordionItem key="2" aria-label="Setup Performance Analysis" title={
                     <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Icon icon="lucide:settings-2" className="text-success" />
                        Setup Performance Analysis
                    </h2>
                }>
                     <div className="p-2 space-y-6">
                         {setupPerformance.length > 0 ? (
                            <Card className="border-divider">
                                <CardHeader>
                                    <div className="flex flex-col">
                                        <p className="text-md font-semibold">Performance by Setup</p>
                                        <p className="text-sm text-default-500">Which setups generate the most portfolio impact.</p>
                                    </div>
                                </CardHeader>
                                <Divider/>
                                <CardBody className="p-0">
                                    <Table 
                                        aria-label="Setup Performance Table"
                                        classNames={{
                                            th: "bg-transparent border-b border-divider text-xs font-medium text-default-500 uppercase tracking-wider text-right",
                                            td: "py-2.5 text-sm text-right",
                                            wrapper: "p-0"
                                        }}
                                    >
                                        <TableHeader>
                                            <TableColumn className="text-left">Setup</TableColumn>
                                            <TableColumn>Trades</TableColumn>
                                            <TableColumn>Win Rate</TableColumn>
                                            <TableColumn>Total PF Impact</TableColumn>
                                        </TableHeader>
                                        <TableBody 
                                            items={setupPerformance}
                                            emptyContent={"No setup data to display."}
                                        >
                                            {(item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="text-left font-medium">{item.name}</TableCell>
                                                    <TableCell>{item.totalTrades}</TableCell>
                                                    <TableCell className={`font-semibold ${item.winRate >= 50 ? 'text-success-600' : 'text-danger-600'}`}>{item.winRate.toFixed(1)}%</TableCell>
                                                    <TableCell className={`font-semibold ${item.totalPfImpact >= 0 ? 'text-success-600' : 'text-danger-600'}`}>{item.totalPfImpact > 0 ? '+' : ''}{item.totalPfImpact.toFixed(2)}%</TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardBody>
                            </Card>
                         ) : (
                            <div className="text-foreground-400 text-lg font-medium text-center w-full py-12">No data in this period.</div>
                         )}

                        {!isLoading && trades.filter(t=>t.setup).length > 0 && setupPerformance.length > 0 ? (
                            <Card className="border-divider">
                                <CardHeader>
                                     <div className="flex flex-col">
                                        <p className="text-md font-semibold">Setup Frequency</p>
                                        <p className="text-sm text-default-500">How often each setup is traded.</p>
                                    </div>
                                </CardHeader>
                                <Divider/>
                 <SetupFrequencyChart trades={trades} />
                            </Card>
            ) : null}
                     </div>
                </AccordionItem>

                 <AccordionItem key="3" aria-label="Position Analysis" title={
                     <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Icon icon="lucide:hand-coins" className="text-warning" />
                        Position Analysis
                    </h2>
                }>
                    <div className="p-2 space-y-6">
                        {!isLoading && trades.length > 0 ? (
                            <>
                                <PnLDistributionCharts trades={trades} />

            <Card className="border border-divider">
                <CardHeader className="flex gap-3 items-center">
                    <Icon icon="lucide:pie-chart" className="text-xl text-primary-500" />
                                <div>
                                    <p className="text-md font-semibold">Top Allocations</p>
                                    <p className="text-sm text-default-500">Largest open positions by portfolio percentage.</p>
                    </div>
                </CardHeader>
                <Divider/>
                <CardBody className="p-0">
                            <Table aria-label="Top Allocations Table" classNames={{ wrapper: "min-h-[222px] p-0", th: "bg-transparent border-b border-divider text-xs font-medium", td: "py-2.5 text-sm" }}>
                        <TableHeader columns={columns}>
                                    {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
                        </TableHeader>
                                <TableBody items={topAllocations} isLoading={isLoading} emptyContent={isLoading ? " " : "No open positions."}>
                            {(item) => (
                                <TableRow key={item.id}>
                                            {(columnKey) => <TableCell>{renderCell(item, columnKey as string)}</TableCell>}
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardBody>
            </Card>
                            </>
                        ) : (
                            <div className="text-foreground-400 text-lg font-medium text-center w-full py-12">No data in this period.</div>
                        )}

            </div>
                </AccordionItem>
            </Accordion>

            {/* Trading Activity Heatmap Card */}
            <motion.div 
                variants={{ 
                    hidden: { opacity: 0, y: 20 }, 
                    visible: { opacity: 1, y: 0 } 
                }}
                className="w-full"
            >
                <Card className="border border-divider bg-background">
                    <CardHeader className="flex justify-between items-center pb-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-primary/10">
                                <Icon icon="lucide:calendar-days" className="text-xl text-primary" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-foreground">Trading Activity</h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Icon icon="lucide:share-2" className="text-lg text-foreground-500 cursor-pointer hover:text-primary transition-colors" />
                        </div>
                    </CardHeader>
                    <CardBody>
                        <div className="overflow-x-auto pb-2 min-h-[180px] flex items-center justify-center">
                            {filteredTrades.length === 0 ? (
                                <div className="text-foreground-400 text-lg font-medium text-center w-full py-12">
                                    No trades taken in this period.
                                </div>
                            ) : (
                                <TradeHeatmap 
                                    trades={filteredTrades} 
                                    startDate={heatmapStartDate} 
                                    endDate={heatmapEndDate}
                                    className="min-w-[750px]"
                                />
                            )}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-divider justify-center text-xs text-foreground-500">
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 bg-default-100 rounded border border-divider"></span>
                                <span>No trades</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 bg-[#ff7f7f] rounded border border-divider"></span>
                                <span>Min. loss</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 bg-[#d32f2f] rounded border border-divider"></span>
                                <span>Max. loss</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 bg-[#c6e48b] rounded border border-divider"></span>
                                <span>Min. profit</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 bg-[#7bc96f] rounded border border-divider"></span>
                                <span>Max. profit</span>
                            </div>
                        </div>
                    </CardBody>
                </Card>
            </motion.div>
        </motion.div>
    );
};

export default DeepAnalyticsPage; 