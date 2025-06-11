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

function getMonthShort(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString('default', { month: 'short' });
}

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
  const { getPortfolioSize } = useTruePortfolioWithTrades(trades);
  
  // Group trades by month
  const monthlyMap: Record<string, { grossPL: number, year: number }> = {};
  trades.forEach(trade => {
    const d = new Date(trade.date);
    const key = getMonthShort(trade.date);
    if (!monthlyMap[key]) monthlyMap[key] = { grossPL: 0, year: d.getFullYear() };
    monthlyMap[key].grossPL += trade.plRs || 0;
    monthlyMap[key].year = d.getFullYear();
  });

  // Output months in calendar order
  const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const chartData = monthOrder.map(month => {
    const longMonth = {
      Jan: "January", Feb: "February", Mar: "March", Apr: "April",
      May: "May", Jun: "June", Jul: "July", Aug: "August",
      Sep: "September", Oct: "October", Nov: "November", Dec: "December"
    }[month];
    
    const grossPL = monthlyMap[month]?.grossPL || 0;
    const taxes = taxesByMonth[longMonth || ""] || 0;
    const netPL = grossPL - taxes;
    const year = monthlyMap[month]?.year || new Date().getFullYear();
    const portfolioSize = getPortfolioSize(month, year);
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