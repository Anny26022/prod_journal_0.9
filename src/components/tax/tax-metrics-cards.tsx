import React from "react";
import { Card, CardBody } from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { Trade } from "../../types/trade";
import { useTrades } from "../../hooks/use-trades";

export const TaxMetricsCards: React.FC<{ isEditMode: boolean }> = ({ isEditMode }) => {
  const { trades } = useTrades();
  const totalTrades = trades.length;
  const winTrades = trades.filter(t => t.plRs > 0);
  const winRate = totalTrades > 0 ? (winTrades.length / totalTrades) * 100 : 0;
  const grossPL = trades.reduce((sum, t) => sum + (t.plRs || 0), 0);
  // If you have taxes in Trade, subtract here. For now, netPL = grossPL
  const netPL = grossPL;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard 
        title="Total Trades"
        value={totalTrades.toString()}
        icon="lucide:activity"
        color="primary"
        change=""
        isPositive={true}
        isEditMode={isEditMode}
      />
      <MetricCard 
        title="Win Rate"
        value={winRate.toFixed(2) + '%'}
        icon="lucide:target"
        color="success"
        change=""
        isPositive={true}
        isEditMode={isEditMode}
      />
      <MetricCard 
        title="Gross P/L"
        value={grossPL.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })}
        icon="lucide:trending-up"
        color="warning"
        change=""
        isPositive={grossPL >= 0}
        isEditMode={isEditMode}
      />
      <MetricCard 
        title="Net P/L"
        value={netPL.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })}
        icon="lucide:wallet"
        color="secondary"
        change=""
        isPositive={netPL >= 0}
        isEditMode={isEditMode}
      />
    </div>
  );
};

interface MetricCardProps {
  title: string;
  value: string;
  icon: string;
  color: "primary" | "success" | "warning" | "secondary" | "danger";
  change: string;
  isPositive: boolean;
  isEditMode: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value, 
  icon, 
  color, 
  change, 
  isPositive,
  isEditMode
}) => {
  const [editValue, setEditValue] = React.useState(value);
  
  React.useEffect(() => {
    setEditValue(value);
  }, [value]);
  
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 10 }}
    >
      <Card className="overflow-visible">
        <CardBody className="p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-default-500 text-sm mb-1">{title}</p>
              {isEditMode ? (
                <input
                  className="bg-transparent border-b border-primary-500 text-xl font-semibold focus:outline-none w-full"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              ) : (
                <p className="text-xl font-semibold">{value}</p>
              )}
              <div className={`flex items-center mt-2 text-xs ${isPositive ? 'text-success' : 'text-danger'}`}>
                <Icon icon={isPositive ? "lucide:trending-up" : "lucide:trending-down"} className="mr-1" />
                <span>{change} from last month</span>
              </div>
            </div>
            <div className={`p-2 rounded-lg bg-${color}-100 text-${color}-500`}>
              <Icon icon={icon} className="text-xl" />
            </div>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
};