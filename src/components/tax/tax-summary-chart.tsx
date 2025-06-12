import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from "recharts";
import { useTrades } from "../../hooks/use-trades";
import { useTruePortfolioWithTrades } from "../../hooks/use-true-portfolio-with-trades";
import { useAccountingMethod } from "../../context/AccountingMethodContext";



const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

interface TaxSummaryChartProps {
  taxesByMonth: { [month: string]: number };
}

export const TaxSummaryChart: React.FC<TaxSummaryChartProps> = ({ taxesByMonth }) => {
  const { trades } = useTrades();
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';
  const { getPortfolioSize, getAllMonthlyTruePortfolios } = useTruePortfolioWithTrades(trades);

  // Use the EXACT same logic as Monthly Performance table
  const currentYear = new Date().getFullYear();
  const shortMonthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Get all monthly portfolio data (same as Monthly Performance table)
  const monthlyPortfolios = getAllMonthlyTruePortfolios(trades, useCashBasis);
  const filteredMonthlyPortfolios = monthlyPortfolios.filter(mp => mp.year === currentYear);

  // Output months in calendar order - use same logic as Monthly Performance table
  const chartData = shortMonthOrder.map(month => {
    const longMonth = {
      Jan: "January", Feb: "February", Mar: "March", Apr: "April",
      May: "May", Jun: "June", Jul: "July", Aug: "August",
      Sep: "September", Oct: "October", Nov: "November", Dec: "December"
    }[month];

    // Find corresponding monthly portfolio data (EXACT same logic as Monthly Performance table)
    const monthPortfolio = filteredMonthlyPortfolios.find(mp => mp.month === month) || {
      month,
      year: currentYear,
      startingCapital: 0,
      capitalChanges: 0,
      pl: 0,
      finalCapital: 0
    };
    const grossPL = monthPortfolio.pl; // This uses the correct accounting method
    const taxes = taxesByMonth[longMonth || ""] || 0;
    const netPL = grossPL - taxes;
    const portfolioSize = getPortfolioSize(month, currentYear, trades, useCashBasis);
    const plPercent = portfolioSize > 0 ? (grossPL / portfolioSize) * 100 : 0;

    return {
      month,
      grossPL,
      netPL,
      taxes,
      plPercent
    };
  });

  return (
    <div className="h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-divider))" />
          <XAxis 
            dataKey="month" 
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            yAxisId="left"
            tickFormatter={(value) => formatCurrency(value)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            tickFormatter={(value) => `${value}%`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              switch (name) {
                case "plPercent":
                  return [`${value.toFixed(2)}%`, "P/L %"];
                case "grossPL":
                  return [`₹ ${value.toFixed(2)}`, "Gross P/L"];
                case "netPL":
                  return [`₹ ${value.toFixed(2)}`, "Net P/L"];
                case "taxes":
                  return [`₹ ${value.toFixed(2)}`, "Taxes"];
                default:
                  return [value.toFixed(2), name];
              }
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
          <ReferenceLine y={0} yAxisId="left" stroke="hsl(var(--heroui-divider))" />
          <Bar 
            yAxisId="left" 
            dataKey="grossPL" 
            name="Gross P/L" 
            fill="hsl(var(--heroui-primary-500))" 
            radius={[4, 4, 0, 0]} 
            barSize={20}
          />
          <Bar 
            yAxisId="left" 
            dataKey="netPL" 
            name="Net P/L" 
            fill="hsl(var(--heroui-success-500))" 
            radius={[4, 4, 0, 0]} 
            barSize={20}
          />
          <Bar 
            yAxisId="left" 
            dataKey="taxes" 
            name="Taxes" 
            fill="hsl(var(--heroui-danger-500))" 
            radius={[4, 4, 0, 0]} 
            barSize={20}
          />
          <Line 
            yAxisId="right" 
            type="monotone" 
            dataKey="plPercent" 
            name="P/L %" 
            stroke="hsl(var(--heroui-warning-500))" 
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};