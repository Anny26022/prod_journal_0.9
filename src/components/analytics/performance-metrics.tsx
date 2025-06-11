import React from "react";
import { Tooltip, Input } from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { metricVariants, listItemVariants } from "../../utils/animations";
import { Trade } from "../../types/trade";
import { calcOpenHeat, calcWeightedRewardRisk } from "../../utils/tradeCalculations";
import { useTruePortfolioWithTrades } from "../../hooks/use-true-portfolio-with-trades";

interface MetricProps {
  label: string;
  value: string | number;
  change?: string | number;
  tooltip?: string;
  isPositive?: boolean;
  isNegative?: boolean;
  isPercentage?: boolean;
  isEditing?: boolean;
  onValueChange?: (value: string) => void;
  index?: number;
}

const Metric: React.FC<MetricProps> = React.memo(({ 
  label, 
  value, 
  change, 
  tooltip, 
  isPositive, 
  isNegative,
  isPercentage,
  isEditing,
  onValueChange,
  index = 0
}) => {
  const [editValue, setEditValue] = React.useState(value.toString());
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    if (onValueChange) {
      onValueChange(editValue);
    }
  };

  return (
    <motion.div 
      className="flex flex-col bg-content2/40 p-2 rounded-lg will-change-transform"
      variants={metricVariants}
      initial="initial"
      animate="animate"
      whileHover="hover"
      custom={index}
      transition={{ delay: index * 0.1 }}
    >
      <motion.div 
        className="flex items-center gap-1 text-default-600 text-xs font-medium mb-0.5 will-change-transform"
        variants={listItemVariants}
      >
        {label}
        {tooltip && (
          <Tooltip content={tooltip}>
            <motion.span
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
            >
              <Icon icon="lucide:info" className="w-3.5 h-3.5 text-default-400" />
            </motion.span>
          </Tooltip>
        )}
      </motion.div>
      <motion.div 
        className="flex items-end gap-2"
        variants={listItemVariants}
      >
        <AnimatePresence mode="wait">
          {isEditing ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Input
                ref={inputRef}
                type="text"
                value={editValue}
                onValueChange={setEditValue}
                onBlur={handleBlur}
                size="sm"
                variant="bordered"
                className="max-w-[100px]"
                classNames={{
                  input: "text-right font-semibold text-base",
                  inputWrapper: "h-7 min-h-unit-7"
                }}
                endContent={isPercentage && <span className="text-default-400 text-sm">%</span>}
              />
            </motion.div>
          ) : (
            <motion.span 
              className="text-lg font-semibold tracking-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {isPercentage ? `${value}%` : value}
            </motion.span>
          )}
        </AnimatePresence>
        {change !== undefined && (
          <motion.span 
            className={`text-sm ${isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-default-500'} flex items-center font-medium`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            {isPositive && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, delay: 0.3 }}
              >
                <Icon icon="lucide:trending-up" className="w-3 h-3 mr-0.5" />
              </motion.span>
            )}
            {isNegative && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, delay: 0.3 }}
              >
                <Icon icon="lucide:trending-down" className="w-3 h-3 mr-0.5" />
              </motion.span>
            )}
            {isPercentage ? `${change}%` : change}
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
});

interface PerformanceMetricsProps {
  trades: Trade[];
  isEditing?: boolean;
}

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ trades, isEditing = false }) => {
  const { portfolioSize, getPortfolioSize } = useTruePortfolioWithTrades(trades);
  // Calculate metrics from trades
  const totalTrades = trades.length;
  const winTrades = trades.filter(t => t.plRs > 0);
  const lossTrades = trades.filter(t => t.plRs < 0);
  const winRate = totalTrades > 0 ? (winTrades.length / totalTrades) * 100 : 0;
  const avgPosMove = winTrades.length > 0 ? winTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / winTrades.length : 0;
  const avgNegMove = lossTrades.length > 0 ? lossTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / lossTrades.length : 0;
  const avgPositionSize = totalTrades > 0 ? trades.reduce((sum, t) => sum + (t.allocation || 0), 0) / totalTrades : 0;
  const avgHoldingDays = totalTrades > 0 ? trades.reduce((sum, t) => sum + (t.holdingDays || 0), 0) / totalTrades : 0;
  const planFollowed = totalTrades > 0 ? (trades.filter(t => t.planFollowed).length / totalTrades) * 100 : 0;
  const avgR = totalTrades > 0 ? trades.reduce((sum, t) => sum + calcWeightedRewardRisk(t), 0) / totalTrades : 0;
  const openPositions = trades.filter(t => t.positionStatus === 'Open').length;
  const cashPercentage = 100 - trades.reduce((sum, t) => sum + (t.allocation || 0), 0);
  const openHeat = calcOpenHeat(trades, portfolioSize, getPortfolioSize);

  return (
    <motion.div 
      className="grid grid-cols-2 gap-4"
      initial="initial"
      animate="animate"
      variants={{
        animate: {
          transition: {
            staggerChildren: 0.05
          }
        }
      }}
    >
      <Metric 
        label="Total Trades" 
        value={totalTrades}
        isEditing={isEditing}
        index={0}
      />
      <Metric 
        label="Win Rate" 
        value={winRate.toFixed(2)}
        isPositive
        isPercentage
        tooltip="Percentage of profitable trades"
        isEditing={isEditing}
        index={1}
      />
      <Metric 
        label="Avg + Move" 
        value={avgPosMove.toFixed(2)}
        isPercentage
        tooltip="Average percentage gain on winning trades"
        isEditing={isEditing}
        index={2}
      />
      <Metric 
        label="Avg - Move" 
        value={avgNegMove.toFixed(2)}
        isPercentage
        tooltip="Average percentage loss on losing trades"
        isEditing={isEditing}
        index={3}
      />
      <Metric 
        label="Avg Position Size" 
        value={avgPositionSize.toFixed(2)}
        isPercentage
        tooltip="Average position size as percentage of portfolio"
        isEditing={isEditing}
        index={4}
      />
      <Metric 
        label="Avg Holding Days" 
        value={avgHoldingDays.toFixed(2)}
        tooltip="Average number of days positions are held"
        isEditing={isEditing}
        index={5}
      />
      <Metric 
        label="Plan Followed" 
        value={planFollowed.toFixed(2)}
        isPercentage
        tooltip="Percentage of trades that followed the trading plan"
        isEditing={isEditing}
        index={6}
      />
      <Metric 
        label="Avg R" 
        value={avgR.toFixed(2)}
        tooltip="Average reward-to-risk ratio across all trades"
        isEditing={isEditing}
        index={7}
      />
      <Metric 
        label="Open Positions" 
        value={openPositions}
        tooltip="Number of currently open positions"
        isEditing={isEditing}
        index={8}
      />
      <Metric 
        label="Cash" 
        value={cashPercentage.toFixed(2)}
        isPercentage
        tooltip="Percentage of portfolio in cash (approximate)"
        isEditing={isEditing}
        index={9}
      />
      <Metric 
        label="Open Heat" 
        value={openHeat.toFixed(2)}
        isPercentage
        tooltip="% of portfolio at risk on open positions (sum of risk per open trade / portfolio size)"
        isEditing={isEditing}
        index={10}
      />
    </motion.div>
  );
};