import React from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import { Card, Tooltip } from "@heroui/react";
import { motion } from "framer-motion";
import { formatCurrency } from "../../utils/formatters";

interface TradeHeatmapProps {
  trades: { date: string; plRs: number }[];
  startDate: string;
  endDate: string;
  className?: string;
}

const TradeHeatmap: React.FC<TradeHeatmapProps> = ({ trades, startDate, endDate, className }) => {
  // Aggregate P&L by date
  const data = trades.reduce((acc, trade) => {
    const day = trade.date.split("T")[0];
    acc[day] = (acc[day] || 0) + trade.plRs;
    return acc;
  }, {} as Record<string, number>);

  // Convert to heatmap format
  const values = Object.keys(data).map(date => ({
    date,
    count: data[date],
  }));

  // Custom transformDayElement to add hover effects and better styling
  const transformDayElement = (element: React.ReactElement, value: any) => {
    if (!value) return element;

    const formattedDate = new Date(value.date).toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return (
      <Tooltip
        content={
          <div className="p-2 text-sm">
            <p className="font-medium">{formattedDate}</p>
            <p className={`mt-1 ${value.count >= 0 ? 'text-success-500' : 'text-danger-500'}`}>
              {formatCurrency(value.count)}
            </p>
          </div>
        }
        delay={0}
        closeDelay={0}
      >
        <motion.g
          whileHover={{ scale: 1.1 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          {React.cloneElement(element, {
            ...element.props,
            rx: 2,
            className: `${element.props.className} cursor-pointer`,
          })}
        </motion.g>
      </Tooltip>
    );
  };

  return (
    <div className={`w-full ${className}`}>
      <style>{`
        .react-calendar-heatmap {
          width: 100%;
          height: 100%;
        }
        .react-calendar-heatmap text {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 0.8rem;
          fill: var(--foreground-500);
        }
        .react-calendar-heatmap rect {
          rx: 2;
          ry: 2;
          height: 15px;
          width: 15px;
          stroke: white;
          stroke-width: 1.5px;
          opacity: 1;
        }
        .react-calendar-heatmap .color-empty {
          fill: #f3f4f6;
        }
        /* Loss colors - from light to dark red */
        .color-scale-1 { fill: #fecaca; }
        .color-scale-2 { fill: #ef4444; }
        /* Profit colors - from light to dark green */
        .color-scale-3 { fill: #bbf7d0; }
        .color-scale-4 { fill: #22c55e; }
        .react-calendar-heatmap-month-label,
        .react-calendar-heatmap-weekday-label {
          font-size: 0.8rem;
          font-weight: 500;
          fill: var(--foreground-500);
        }
        /* Fix spacing and alignment */
        .react-calendar-heatmap .react-calendar-heatmap-all-weeks {
          transform: translateY(35px);
        }
        .react-calendar-heatmap-month-labels {
          transform: translateY(0px);
        }
        .react-calendar-heatmap-weekday-labels {
          transform: translateX(-20px);
        }
        .react-calendar-heatmap-month-label {
          letter-spacing: -0.5px;
        }
      `}</style>
      <div className="relative h-[230px] pt-4">
        <CalendarHeatmap
          startDate={startDate}
          endDate={endDate}
          values={values}
          classForValue={value => {
            if (!value) return "color-empty";
            const count = value.count;
            if (count > 0) {
              return count > 5000 ? "color-scale-4" : "color-scale-3";
            }
            return count < -5000 ? "color-scale-2" : "color-scale-1";
          }}
          transformDayElement={transformDayElement}
          showWeekdayLabels={true}
          weekdayLabels={['M', 'W', 'F']}
          horizontal={true}
          gutterSize={5}
          monthLabels={[
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
          ]}
        />
      </div>
    </div>
  );
};

export default TradeHeatmap; 