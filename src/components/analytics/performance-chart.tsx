import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { motion } from "framer-motion";
import { Trade } from "../../types/trade";
import { useTruePortfolioWithTrades } from "../../hooks/use-true-portfolio-with-trades";

export interface ChartDataPoint {
  month: string;
  capital: number;
  pl: number;
  plPercentage: number;
  startingCapital?: number;
  capitalChanges?: number;
}

interface PerformanceChartProps {
  trades: Trade[];
  onDataUpdate?: (data: ChartDataPoint[]) => void;
}

function getMonthYear(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = (props) => {
  const { trades, onDataUpdate } = props;
  const { getPortfolioSize, getAllMonthlyTruePortfolios } = useTruePortfolioWithTrades(trades);
  const monthlyPortfolios = getAllMonthlyTruePortfolios();
  
  // Get the earliest and latest trade dates to determine the date range
  const sortedTrades = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const startDate = sortedTrades[0]?.date ? new Date(sortedTrades[0].date) : new Date();
  const endDate = trades.length > 0 ? new Date(trades[trades.length - 1].date) : new Date();
  
  // Use monthlyPortfolios data which already accounts for capital changes and P/L
  const processedChartData = monthlyPortfolios.map(monthData => ({
    month: `${monthData.month} ${monthData.year}`,
    capital: monthData.finalCapital,
    pl: monthData.pl,
    startingCapital: monthData.startingCapital,
    capitalChanges: monthData.capitalChanges,
    plPercentage: monthData.startingCapital !== 0 ? (monthData.pl / monthData.startingCapital) * 100 : 0
  }));
  
  // Notify parent component about data update
  React.useEffect(() => {
    if (onDataUpdate && processedChartData.length > 0) {
      onDataUpdate(processedChartData);
    }
  }, [processedChartData, onDataUpdate]);

  // Recalculate Drawdown and Volatility based on processedChartData
  const drawdownData = React.useMemo(() => {
    let runningMax = processedChartData[0]?.startingCapital || 0;
    return processedChartData.map((d) => {
      if (d.capital > runningMax) runningMax = d.capital;
      const drawdown = runningMax !== 0 ? ((runningMax - d.capital) / runningMax) * 100 : 0;
      return { ...d, drawdown };
    });
  }, [processedChartData]);
  
  const volatilityData = React.useMemo(() => {
    function rollingStd(arr: number[], window: number) {
      return arr.map((_, i) => {
        if (i < window - 1) return 0;
        const slice = arr.slice(i - window + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / window;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window;
        return Math.sqrt(variance);
      });
    }
    const plPercentages = processedChartData.map(d => d.plPercentage);
    const volatilityArr = rollingStd(plPercentages, 3);
    return processedChartData.map((d, i) => ({ ...d, volatility: volatilityArr[i] }));
  }, [processedChartData]);

  const [activeView, setActiveView] = React.useState<'capital' | 'percentage' | 'drawdown' | 'volatility'>('capital');
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="h-[350px]">
      <div className="flex justify-end mb-4">
        <motion.div 
          className="flex border border-divider rounded-medium overflow-hidden"
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          <button
            className={`px-3 py-1 text-xs transition-colors ${activeView === "capital" ? "bg-primary text-white" : "bg-content1 hover:bg-content2"}`}
            onClick={() => setActiveView("capital")}
          >
            Capital
          </button>
          <button
            className={`px-3 py-1 text-xs transition-colors ${activeView === "percentage" ? "bg-primary text-white" : "bg-content1 hover:bg-content2"}`}
            onClick={() => setActiveView("percentage")}
          >
            % P/L
          </button>
          <button
            className={`px-3 py-1 text-xs transition-colors ${activeView === "drawdown" ? "bg-primary text-white" : "bg-content1 hover:bg-content2"}`}
            onClick={() => setActiveView("drawdown")}
          >
            Drawdown
          </button>
          <button
            className={`px-3 py-1 text-xs transition-colors ${activeView === "volatility" ? "bg-primary text-white" : "bg-content1 hover:bg-content2"}`}
            onClick={() => setActiveView("volatility")}
          >
            Volatility
          </button>
        </motion.div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        {activeView === "capital" ? (
          <AreaChart
            data={processedChartData}
            margin={{ top: 10, right: 30, left: 30, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--heroui-primary-500))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--heroui-primary-500))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-divider))" />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tickFormatter={(value) => formatCurrency(value)}
              axisLine={false}
              tickLine={false}
              dx={-10}
              width={80}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number, name: string, props: any) => {
                if (name === "Portfolio Value") {
                  const dataPoint = props.payload;
                  const capitalChange = dataPoint.capitalChanges;
                  const startingCapital = dataPoint.startingCapital;
                  const plPercentage = dataPoint.plPercentage;
                  const items = [
                    [formatCurrency(value), "Portfolio Value"],
                  ];
                  if (startingCapital !== undefined && startingCapital !== null) {
                    items.push([formatCurrency(startingCapital), "Starting Capital"]);
                  }
                  if (capitalChange !== undefined && capitalChange !== 0) {
                    items.push([formatCurrency(capitalChange), capitalChange > 0 ? "Deposit" : "Withdrawal"]);
                  }
                  if (plPercentage !== undefined && plPercentage !== null) {
                    items.push([`${plPercentage.toFixed(2)}%`, "Monthly P/L %"]);
                  }
                  return items;
                }
                return [formatCurrency(value), name];
              }}
              labelFormatter={(label) => label}
              contentStyle={{
                backgroundColor: "hsl(var(--heroui-content1))",
                border: "1px solid hsl(var(--heroui-divider))",
                borderRadius: "8px",
                padding: "8px 12px"
              }}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="capital" 
              name="Portfolio Value"
              stroke="hsl(var(--heroui-primary))" 
              fillOpacity={1}
              fill="url(#colorCapital)" 
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </AreaChart>
        ) : activeView === "percentage" ? (
          <AreaChart
            data={processedChartData}
            margin={{ top: 10, right: 30, left: 30, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorPL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--heroui-success-500))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--heroui-success-500))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-divider))" />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tickFormatter={(value) => `${value}%`}
              axisLine={false}
              tickLine={false}
              dx={-10}
              width={60}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, "P/L %"]}
              labelFormatter={(label) => label}
              contentStyle={{
                backgroundColor: "hsl(var(--heroui-content1))",
                border: "1px solid hsl(var(--heroui-divider))",
                borderRadius: "8px",
                padding: "8px 12px"
              }}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="plPercentage" 
              name="Monthly P/L"
              stroke="hsl(var(--heroui-success))" 
              fillOpacity={1}
              fill="url(#colorPL)" 
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </AreaChart>
        ) : activeView === "drawdown" ? (
          <AreaChart
            data={drawdownData}
            margin={{ top: 10, right: 30, left: 30, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--heroui-danger-500))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--heroui-danger-500))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-divider))" />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tickFormatter={(value) => `${value.toFixed(2)}%`}
              axisLine={false}
              tickLine={false}
              dx={-10}
              width={60}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, "Drawdown"]}
              labelFormatter={(label) => label}
              contentStyle={{
                backgroundColor: "hsl(var(--heroui-content1))",
                border: "1px solid hsl(var(--heroui-divider))",
                borderRadius: "8px",
                padding: "8px 12px"
              }}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="drawdown" 
              name="Drawdown"
              stroke="hsl(var(--heroui-danger))" 
              fillOpacity={1}
              fill="url(#colorDrawdown)" 
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </AreaChart>
        ) : (
          <AreaChart
            data={volatilityData}
            margin={{ top: 10, right: 30, left: 30, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorVolatility" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--heroui-warning-500))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--heroui-warning-500))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-divider))" />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tickFormatter={(value) => `${value.toFixed(2)}%`}
              axisLine={false}
              tickLine={false}
              dx={-10}
              width={60}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, "Volatility"]}
              labelFormatter={(label) => label}
              contentStyle={{
                backgroundColor: "hsl(var(--heroui-content1))",
                border: "1px solid hsl(var(--heroui-divider))",
                borderRadius: "8px",
                padding: "8px 12px"
              }}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="volatility" 
              name="Volatility (3M Std Dev)"
              stroke="hsl(var(--heroui-warning))" 
              fillOpacity={1}
              fill="url(#colorVolatility)" 
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};