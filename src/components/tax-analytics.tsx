import React, { useCallback } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Divider,
  Button,
  Tabs,
  Tab,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Input
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { TaxSummaryChart } from "./tax/tax-summary-chart";
import { TaxMetricsCards } from "./tax/tax-metrics-cards";
import { TaxTable } from "./tax/tax-table";
import { TaxEditModal } from "./tax/tax-edit-modal";
import { useTrades } from "../hooks/use-trades";
import { useAccountingMethod } from "../context/AccountingMethodContext";
import { useGlobalFilter } from "../context/GlobalFilterContext";
import { calculateTradePL } from "../utils/accountingUtils";
// Removed Supabase import - using localStorage only

// Editable Text Component
const EditableText: React.FC<{
  value: string | number;
  onSave: (value: string) => void;
  isEditing: boolean;
  type?: "text" | "number";
  className?: string;
  prefix?: string;
}> = ({ value, onSave, isEditing, type = "text", className = "", prefix = "" }) => {
  const [editValue, setEditValue] = React.useState(value.toString());
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    onSave(editValue);
  };

  if (!isEditing) {
    return (
      <motion.span 
        className={`inline-block ${className}`}
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.02 }}
      >
        {prefix}{value}
      </motion.span>
    );
  }

  return (
    <Input
      ref={inputRef}
      type={type}
      value={editValue}
      onValueChange={setEditValue}
      onBlur={handleBlur}
      size="sm"
      variant="bordered"
      className={`max-w-[120px] ${className}`}
      classNames={{
        input: "text-right",
        inputWrapper: "h-8 min-h-unit-8"
      }}
      startContent={prefix ? <span className="text-default-400">{prefix}</span> : undefined}
    />
  );
};

// localStorage helpers
function fetchTaxData() {
  try {
    const stored = localStorage.getItem('taxData');
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error fetching tax data:', error);
    return {};
  }
}

function saveTaxData(taxData: any) {
  try {
    localStorage.setItem('taxData', JSON.stringify(taxData));
  } catch (error) {
    console.error('localStorage save error:', error);
  }
}

export const TaxAnalytics: React.FC = () => {
  const { trades } = useTrades(); // This now returns filtered trades based on global filter and accounting method
  const { accountingMethod } = useAccountingMethod();
  const { filter } = useGlobalFilter();
  const useCashBasis = accountingMethod === 'cash';

  // Note: trades are now pre-filtered by global filter and accounting method from useTrades()
  // Get all unique years from filtered trades for year selector (if needed for additional filtering)
  const tradeYears = Array.from(new Set(trades.map(t => new Date(t.date).getFullYear()))).sort((a, b) => b - a);
  const defaultYear = tradeYears.length > 0 ? String(tradeYears[0]) : String(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = React.useState(defaultYear);
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedMonth, setSelectedMonth] = React.useState<string | null>(null);
  const monthOrder = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const [taxesByMonth, setTaxesByMonth] = React.useState<{ [month: string]: number }>({});
  
  // Function to load tax data for the selected year
  const loadTaxData = useCallback(() => {
    const allTaxData = fetchTaxData();
    const yearData = allTaxData[selectedYear] || {};
    if (Object.keys(yearData).length > 0) {
      setTaxesByMonth(prev => ({ ...prev, ...yearData }));
    } else {
      const initialData: { [month: string]: number } = {};
      monthOrder.forEach(month => { initialData[month] = 0; });
      setTaxesByMonth(initialData);
    }
  }, [selectedYear]);

  // Load tax data on mount and when selectedYear changes
  React.useEffect(() => {
    loadTaxData();
    
    // Add event listener for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'taxData') {
        loadTaxData();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Cleanup
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [loadTaxData]);
  
  // Save tax data to localStorage when it changes
  React.useEffect(() => {
    if (Object.keys(taxesByMonth).length > 0 && selectedYear) {
      const allTaxData = fetchTaxData();
      const currentData = { ...allTaxData };
      currentData[selectedYear] = { ...taxesByMonth };
      saveTaxData(currentData);
    }
  }, [taxesByMonth, selectedYear]);
  
  // Initialize months with 0 if they don't exist
  React.useEffect(() => {
    const initial: { [month: string]: number } = {};
    let needsUpdate = false;
    
    monthOrder.forEach(month => {
      if (!(month in taxesByMonth)) {
        initial[month] = 0;
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      setTaxesByMonth(prev => ({ ...initial, ...prev }));
    }
  }, [trades, taxesByMonth]);

  const tradesForYear = trades.filter(t => t.date.startsWith(selectedYear));
  const closedTrades = tradesForYear
    .filter(t => t.positionStatus === "Closed" || t.positionStatus === "Partial")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const cummPfs = closedTrades.map(t => t.cummPf).filter(v => typeof v === 'number' && !isNaN(v));
  let runningMax = -Infinity;
  let maxDrawdown = 0;
  cummPfs.forEach(pf => {
    if (pf > runningMax) runningMax = pf;
    const dd = runningMax !== 0 ? ((runningMax - pf) / Math.abs(runningMax)) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  });
  const drawdown = maxDrawdown;
  const maxCummPF = cummPfs.length ? Math.max(...cummPfs) : 0;
  const minCummPF = cummPfs.length ? Math.min(...cummPfs) : 0;
  const totalGrossPL = tradesForYear.reduce((sum, t) => sum + calculateTradePL(t, useCashBasis), 0);
  const totalTaxes = monthOrder.reduce((sum, m) => sum + (taxesByMonth[m] || 0), 0);
  const totalNetPL = totalGrossPL - totalTaxes;
  const formatCurrency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const formatPercent = (value: number) => value.toFixed(2) + "%";

  return (
    <div className="space-y-6">
      <motion.div 
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <Dropdown>
            <DropdownTrigger>
              <Button
                variant="light"
                endContent={<Icon icon="lucide:chevron-down" className="text-sm" />}
                size="sm"
                radius="full"
                className="font-medium text-xs h-7 px-3"
              >
                {selectedYear}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Year selection"
              selectionMode="single"
              selectedKeys={[selectedYear]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                setSelectedYear(selected);
              }}
            >
              {tradeYears.map((year) => (
                <DropdownItem key={year}>{year}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="light"
            startContent={<Icon icon="lucide:download" className="w-3.5 h-3.5" />}
            size="sm"
            radius="full"
            className="font-medium text-xs h-7 px-3"
          >
            Export
          </Button>
        </div>
      </motion.div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex justify-between items-center">
            <h3 className="text-xl font-semibold tracking-tight">Tax Summary</h3>
            <Tabs 
              aria-label="Chart options" 
              size="sm" 
              color="primary"
              variant="light"
              radius="full"
              classNames={{
                tabList: "gap-2 p-0.5",
                cursor: "bg-primary/20",
                tab: "px-3 py-1 h-7 data-[selected=true]:text-primary font-medium text-xs",
                tabContent: "group-data-[selected=true]:text-primary"
              }}
            >
              <Tab key="gross" title="Gross P/L" />
              <Tab key="net" title="Net P/L" />
              <Tab key="taxes" title="Taxes" />
            </Tabs>
          </CardHeader>
          <Divider />
          <CardBody>
            <TaxSummaryChart taxesByMonth={taxesByMonth} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h3 className="text-xl font-semibold tracking-tight">Tax Metrics</h3>
          </CardHeader>
          <Divider />
          <CardBody className="p-6 space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-default-600">Max Cumm PF</span>
                  <Tooltip
                    content={
                      <div className="max-w-xs p-2 space-y-2 text-sm">
                        <p className="font-medium text-default-600">Maximum Cumulative Profit Factor</p>
                        <p>The highest point your cumulative profit factor reached during this period.</p>
                        <div className="space-y-1">
                          <p className="font-medium">What it means:</p>
                          <p>• Higher values indicate stronger performance peaks</p>
                          <p>• Shows your best momentum in the market</p>
                          <p>• Helps identify optimal trading conditions</p>
                        </div>
                        <p className="text-xs text-default-400 mt-2">
                          Tip: Use this as a benchmark for your trading potential
                        </p>
                      </div>
                    }
                    placement="right"
                    showArrow
                    classNames={{
                      base: "bg-content1",
                      content: "p-0"
                    }}
                  >
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="min-w-unit-5 w-unit-5 h-unit-5 text-default-400"
                    >
                      <Icon icon="lucide:info" className="w-3 h-3" />
                    </Button>
                  </Tooltip>
                </div>
                <span className="text-[#00B386] font-medium">{maxCummPF.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-default-600">Min Cumm PF</span>
                  <Tooltip
                    content={
                      <div className="max-w-xs p-2 space-y-2 text-sm">
                        <p className="font-medium text-default-600">Minimum Cumulative Profit Factor</p>
                        <p>The lowest point your cumulative profit factor reached during this period.</p>
                        <div className="space-y-1">
                          <p className="font-medium">What it means:</p>
                          <p>• Shows your resilience during tough periods</p>
                          <p>• Helps identify risk management needs</p>
                          <p>• Important for setting stop-loss levels</p>
                        </div>
                        <p className="text-xs text-default-400 mt-2">
                          Tip: Use this to improve your risk management strategy
                        </p>
                      </div>
                    }
                    placement="right"
                    showArrow
                    classNames={{
                      base: "bg-content1",
                      content: "p-0"
                    }}
                  >
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="min-w-unit-5 w-unit-5 h-unit-5 text-default-400"
                    >
                      <Icon icon="lucide:info" className="w-3 h-3" />
                    </Button>
                  </Tooltip>
                </div>
                <span className="text-[#FF3B3B] font-medium">{minCummPF.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-default-600">Drawdown</span>
                  <Tooltip
                    content={
                      <div className="max-w-xs p-2 space-y-2 text-sm">
                        <p className="font-medium text-default-600">How is Drawdown Calculated?</p>
                        <p>Drawdown measures the decline from a peak in cumulative performance.</p>
                        <div className="space-y-1">
                          <p className="font-medium">Example:</p>
                          <p>Starting P/L: ₹1,000</p>
                          <p>→ Drops to ₹800 (20% Drawdown)</p>
                          <p>→ Rises to ₹1,200 (0% Drawdown, New Peak)</p>
                          <p>→ Falls to ₹600 (50% Drawdown)</p>
                        </div>
                        <p className="text-xs text-default-400 mt-2">
                          Formula: ((Peak - Current) / |Peak|) × 100
                        </p>
                      </div>
                    }
                    placement="right"
                    showArrow
                    classNames={{
                      base: "bg-content1",
                      content: "p-0"
                    }}
                  >
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="min-w-unit-5 w-unit-5 h-unit-5 text-default-400"
                    >
                      <Icon icon="lucide:info" className="w-3 h-3" />
                    </Button>
                  </Tooltip>
                </div>
                {drawdown === 0 ? (
                  <span className="text-[#00B386] font-medium flex items-center gap-1">
                    <Icon icon="lucide:rocket" className="w-4 h-4" />
                    Hurray! Flying high
                  </span>
                ) : (
                  <span className="text-[#FF3B3B] font-medium">{drawdown.toFixed(2)}%</span>
                )}
              </div>
            </div>

            <Divider className="my-4" />

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-default-600">Total Gross P/L</span>
                </div>
                <span className={`font-medium ${totalGrossPL >= 0 ? 'text-[#00B386]' : 'text-[#FF3B3B]'}`}>
                  {formatCurrency(totalGrossPL)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-default-600">Total Taxes</span>
                  <Tooltip
                    content={
                      <div className="max-w-xs text-xs p-1">
                        {totalGrossPL !== 0
                          ? `Taxes are ${((totalTaxes / totalGrossPL) * 100).toFixed(2)}% of Gross P/L.`
                          : `Taxes are 0% of Gross P/L (Total Gross P/L is zero).`
                        }
                      </div>
                    }
                    placement="right"
                    showArrow
                    classNames={{
                      base: "bg-content1",
                      content: "p-0"
                    }}
                  >
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="min-w-unit-5 w-unit-5 h-unit-5 text-default-400"
                    >
                      <Icon icon="lucide:info" className="w-3 h-3" />
                    </Button>
                  </Tooltip>
                </div>
                <span className="text-[#FF3B3B] font-medium">
                  {formatCurrency(totalTaxes)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-default-600">Total Net P/L</span>
                <span className={`font-medium ${totalNetPL >= 0 ? 'text-[#00B386]' : 'text-[#FF3B3B]'}`}>
                  {formatCurrency(totalNetPL)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <h3 className="text-xl font-semibold tracking-tight">Monthly Tax Breakdown</h3>
        </CardHeader>
        <Divider />
        <CardBody>
          <TaxTable 
            trades={trades}
            taxesByMonth={taxesByMonth}
            setTaxesByMonth={setTaxesByMonth}
          />
        </CardBody>
      </Card>
      <TaxEditModal 
        isOpen={isModalOpen} 
        onOpenChange={setIsModalOpen}
        month={selectedMonth}
      />
    </div>
  );
};

export default TaxAnalytics;