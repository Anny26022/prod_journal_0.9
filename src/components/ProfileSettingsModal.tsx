import React, { useState, useEffect } from "react";
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter, 
  Button, 
  Input, 
  Table, 
  TableHeader, 
  TableColumn, 
  TableBody, 
  TableRow, 
  TableCell, 
  Select, 
  SelectItem,
  Tooltip,
  Tabs,
  Tab,
  Chip,
  Switch
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { useTruePortfolio } from "../utils/TruePortfolioContext";
import { YearlyStartingCapitalModal } from "./YearlyStartingCapitalModal";
import { generateId } from "../utils/helpers";
import { useTrades } from "../hooks/use-trades";

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const currentYear = new Date().getFullYear();
const startYear = 2000;
const endYear = currentYear + 1; // Allow selecting up to one year in the future
const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  userName: string;
  setUserName: (name: string) => void;
  isFullWidthEnabled: boolean;
  setIsFullWidthEnabled: (enabled: boolean) => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({ isOpen, onOpenChange, userName, setUserName, isFullWidthEnabled, setIsFullWidthEnabled }) => {
  const {
    yearlyStartingCapitals,
    setYearlyStartingCapital,
    getYearlyStartingCapital,
    monthlyStartingCapitalOverrides,
    setMonthlyStartingCapitalOverride,
    removeMonthlyStartingCapitalOverride,
    getMonthlyStartingCapitalOverride,
    capitalChanges,
    addCapitalChange,
    updateCapitalChange,
    deleteCapitalChange,
    portfolioSize
  } = useTruePortfolio();

  const { trades } = useTrades();
  
  const [selectedTab, setSelectedTab] = useState('yearly');
  const [isYearlyCapitalModalOpen, setIsYearlyCapitalModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(months[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [editingCell, setEditingCell] = useState<{month: string, year: number} | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newCapitalAmount, setNewCapitalAmount] = useState('');
  const [newCapitalType, setNewCapitalType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [newCapitalDescription, setNewCapitalDescription] = useState('');

  // Monthly overrides state
  const [overrideMonth, setOverrideMonth] = useState(months[new Date().getMonth()]);
  const [overrideYear, setOverrideYear] = useState(currentYear);
  const [overrideAmount, setOverrideAmount] = useState('');

  const handleAddCapitalChange = () => {
    const amount = parseFloat(newCapitalAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const monthIndex = months.indexOf(selectedMonth);
    const date = new Date(selectedYear, monthIndex, 1).toISOString();

    addCapitalChange({
      amount: newCapitalType === 'deposit' ? amount : -amount,
      type: newCapitalType,
      date,
      description: newCapitalDescription || `${newCapitalType === 'deposit' ? 'Deposit' : 'Withdrawal'} for ${selectedMonth} ${selectedYear}`
    });

    setNewCapitalAmount('');
    setNewCapitalDescription('');
  };
  
  const handleEditCapitalChange = (changeId: string) => {
    const change = capitalChanges.find(c => c.id === changeId);
    if (change) {
      const date = new Date(change.date);
      const month = date.toLocaleString('default', { month: 'short' });
      const year = date.getFullYear();
      setEditingCell({ month, year });
      setEditValue((change.type === 'deposit' ? change.amount : -change.amount).toString());
    }
  };

  const handleSaveCapitalChange = () => {
    if (!editingCell) return;

    const value = Number(editValue);
    if (isNaN(value)) return;

    const monthIndex = months.indexOf(editingCell.month);
    const date = new Date(editingCell.year, monthIndex, 1).toISOString();

    // Find existing change for this month/year
    const existingChange = capitalChanges.find(change => {
      const changeDate = new Date(change.date);
      return changeDate.getFullYear() === editingCell.year &&
             changeDate.getMonth() === monthIndex;
    });

    if (value === 0) {
      // If value is 0, remove the change if it exists
      if (existingChange) {
        deleteCapitalChange(existingChange.id);
      }
    } else {
      const type = value > 0 ? 'deposit' : 'withdrawal';
      const amount = Math.abs(value);

      if (existingChange) {
        // Update existing change
        updateCapitalChange({
          ...existingChange,
          amount,
          type,
          description: existingChange.description || 'Updated from settings'
        });
      } else {
        // Add new change
        addCapitalChange({
          amount,
          type,
          date,
          description: 'Added from settings'
        });
      }
    }

    setEditingCell(null);
    setEditValue('');
  };

  const handleAddMonthlyOverride = () => {
    const amount = parseFloat(overrideAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setMonthlyStartingCapitalOverride(overrideMonth, overrideYear, amount);
    setOverrideAmount('');
  };

  const handleRemoveMonthlyOverride = (month: string, year: number) => {
    removeMonthlyStartingCapitalOverride(month, year);
  };

  // Memoize sorted arrays to prevent unnecessary re-renders
  const sortedCapitalChanges = React.useMemo(() =>
    [...capitalChanges].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [capitalChanges]
  );

  const sortedYearlyCapitals = React.useMemo(() =>
    [...yearlyStartingCapitals].sort((a, b) => b.year - a.year),
    [yearlyStartingCapitals]
  );

  const sortedMonthlyOverrides = React.useMemo(() =>
    [...monthlyStartingCapitalOverrides].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return months.indexOf(b.month) - months.indexOf(a.month);
    }),
    [monthlyStartingCapitalOverrides, months]
  );

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="2xl"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 border-b border-divider pb-4">
              <div className="flex items-center gap-2">
                <Icon icon="lucide:settings" className="text-primary text-2xl" />
                <span className="text-xl font-semibold tracking-tight">Portfolio Settings</span>
              </div>
            </ModalHeader>
            <ModalBody className="space-y-6">
              <div className="space-y-4">
                <Input
                  label="Your Name"
                  labelPlacement="outside"
                  placeholder="Enter your name"
                  value={userName}
                  onValueChange={setUserName}
                  className="w-full"
                  startContent={<Icon icon="lucide:user" className="text-default-400 text-lg" />}
                />
              </div>
              <div className="space-y-4">
                <h4 className="font-semibold text-lg">Display Settings</h4>
                <div className="flex items-center justify-between p-4 border border-divider rounded-lg bg-content2/50 dark:bg-content2/30 shadow-sm">
                  <div>
                    <p className="font-semibold text-base text-foreground">Full Width Layout</p>
                    <p className="text-sm text-default-500">Expand the app content to fill the entire screen width.</p>
                  </div>
                  <Switch
                    isSelected={isFullWidthEnabled}
                    onValueChange={setIsFullWidthEnabled}
                    aria-label="Toggle full width layout"
                  />
                </div>
              </div>
              <Tabs
                selectedKey={selectedTab}
                onSelectionChange={(key) => setSelectedTab(key as string)}
                aria-label="Portfolio settings tabs"
              >
                <Tab key="yearly" title="Yearly Starting Capital">
                  <div className="py-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground-500">
                          Set starting capital for January of each year. This forms the foundation for true portfolio calculations.
                        </p>
                      </div>
                      <Button
                        color="primary"
                        onPress={() => setIsYearlyCapitalModalOpen(true)}
                        startContent={<Icon icon="lucide:plus" />}
                        size="sm"
                        variant="shadow"
                        radius="full"
                      >
                        Manage Years
                      </Button>
                    </div>

                    {sortedYearlyCapitals.length === 0 ? (
                      <div className="text-center py-8 text-default-500">
                        <Icon icon="lucide:calendar-x" className="text-4xl mb-2 mx-auto" />
                        <p>No yearly starting capitals set yet.</p>
                        <p className="text-sm">Click "Manage Years" to get started.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sortedYearlyCapitals.map((yearData) => (
                          <div
                            key={yearData.year}
                            className="flex items-center justify-between p-4 border border-divider rounded-lg bg-content2/50 dark:bg-content2/30 shadow-sm"
                          >
                            <div>
                              <p className="font-semibold text-lg text-foreground">{yearData.year}</p>
                              <p className="text-sm text-default-500">Updated: {new Date(yearData.updatedAt).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-lg text-success-600">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(yearData.startingCapital)}</p>
                              <p className="text-sm text-default-500">Starting Capital</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Tab>
                <Tab key="capital" title="Capital Changes">
                  <div className="py-4 space-y-4">
                    <p className="text-sm text-foreground-500">
                      Add deposits and withdrawals to track capital changes throughout the year.
                    </p>

                    {/* Add New Capital Change */}
                    <div className="border border-divider rounded-lg p-4 bg-default-50 dark:bg-default-100">
                      <h4 className="font-semibold mb-3">Add Capital Change</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Select
                          label="Month"
                          selectedKeys={[selectedMonth]}
                          onSelectionChange={(keys) => setSelectedMonth(Array.from(keys)[0] as string)}
                          className="w-full"
                          size="sm"
                          variant="bordered"
                          aria-label="Select month for capital change"
                        >
                          {months.map((month) => (
                            <SelectItem key={month}>
                              {month}
                            </SelectItem>
                          ))}
                        </Select>
                        <Select
                          label="Year"
                          selectedKeys={[selectedYear.toString()]}
                          onSelectionChange={(keys) => setSelectedYear(parseInt(Array.from(keys)[0] as string))}
                          className="w-full"
                          size="sm"
                          variant="bordered"
                          aria-label="Select year for capital change"
                        >
                          {years.map((year) => (
                            <SelectItem key={year}>
                              {year}
                            </SelectItem>
                          ))}
                        </Select>
                        <Select
                          label="Capital Type"
                          selectedKeys={[newCapitalType]}
                          onSelectionChange={(keys) => setNewCapitalType(Array.from(keys)[0] as 'deposit' | 'withdrawal')}
                          className="w-full"
                          size="sm"
                          variant="bordered"
                          aria-label="Select capital change type"
                        >
                          <SelectItem key="deposit">Deposit</SelectItem>
                          <SelectItem key="withdrawal">Withdrawal</SelectItem>
                        </Select>
                        <Input
                          label="Description (optional)"
                          placeholder="e.g., Q1 bonus, new investment"
                          value={newCapitalDescription}
                          onValueChange={setNewCapitalDescription}
                          className="w-full"
                          size="sm"
                          variant="bordered"
                        />
                        <Input
                          label="Amount"
                          placeholder="e.g., 100000"
                          value={newCapitalAmount}
                          onValueChange={setNewCapitalAmount}
                          type="number"
                          min="0"
                          step="1000"
                          startContent={<span className="text-default-400 text-lg">₹</span>}
                          className="w-full"
                          size="sm"
                          variant="bordered"
                        />
                        <Button
                          color="primary"
                          onPress={handleAddCapitalChange}
                          isDisabled={isNaN(parseFloat(newCapitalAmount)) || parseFloat(newCapitalAmount) <= 0}
                          startContent={<Icon icon="lucide:plus" />}
                          className="w-full"
                          size="sm"
                        >
                          Add Capital Change
                        </Button>
                      </div>

                      <h4 className="font-semibold text-lg mb-2">Capital Change History</h4>
                      {sortedCapitalChanges.length === 0 ? (
                        <div className="text-center py-8 text-default-500">
                          <Icon icon="lucide:dollar-sign" className="text-4xl mb-2 mx-auto" />
                          <p>No capital changes recorded yet.</p>
                          <p className="text-sm">Add a capital change above.</p>
                        </div>
                      ) : (
                        <Table
                          aria-label="Capital Changes Table"
                          selectionMode="single"
                          // onRowAction={(key) => handleEditCapitalChange(key as string)}
                          classNames={{
                            wrapper: "min-h-[200px]",
                            th: "bg-transparent border-b border-divider text-xs font-medium text-default-500 dark:text-default-300 uppercase tracking-wider",
                            td: "py-2.5 text-sm"
                          }}
                        >
                          <TableHeader>
                            <TableColumn key="date" allowsSorting={true}>Date</TableColumn>
                            <TableColumn key="type" allowsSorting={true}>Type</TableColumn>
                            <TableColumn key="amount" allowsSorting={true}>Amount</TableColumn>
                            <TableColumn key="description">Description</TableColumn>
                            <TableColumn key="actions">Actions</TableColumn>
                          </TableHeader>
                          <TableBody items={sortedCapitalChanges}>
                            {(item) => (
                              <TableRow key={item.id}>
                                <TableCell>{new Date(item.date).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  <Chip color={item.type === 'deposit' ? 'success' : 'danger'} size="sm">
                                    {item.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                                  </Chip>
                                </TableCell>
                                <TableCell>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.amount)}</TableCell>
                                <TableCell>{item.description}</TableCell>
                                <TableCell>
                                  <div className="relative flex items-center gap-2">
                                    <Tooltip content="Delete capital change">
                                      <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => deleteCapitalChange(item.id)}>
                                        <Icon icon="lucide:trash-2" className="w-4 h-4" />
                                      </Button>
                                    </Tooltip>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                </Tab>
                <Tab key="monthly" title="Monthly Overrides">
                  <div className="py-4 space-y-4">
                    <p className="text-sm text-foreground-500">
                      Override starting capital for specific months. This allows you to manually set the starting capital for any month, overriding the automatic calculation.
                    </p>

                    {/* Add New Monthly Override */}
                    <div className="border border-divider rounded-lg p-4 bg-default-50 dark:bg-default-100">
                      <h4 className="font-semibold mb-3">Add Monthly Override</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Select
                          label="Month"
                          selectedKeys={[overrideMonth]}
                          onSelectionChange={(keys) => setOverrideMonth(Array.from(keys)[0] as string)}
                          className="w-full"
                          size="sm"
                          variant="bordered"
                          aria-label="Select month for override"
                        >
                          {months.map((month) => (
                            <SelectItem key={month}>
                              {month}
                            </SelectItem>
                          ))}
                        </Select>
                        <Select
                          label="Year"
                          selectedKeys={[overrideYear.toString()]}
                          onSelectionChange={(keys) => setOverrideYear(parseInt(Array.from(keys)[0] as string))}
                          className="w-full"
                          size="sm"
                          variant="bordered"
                          aria-label="Select year for override"
                        >
                          {years.map((year) => (
                            <SelectItem key={year}>
                              {year}
                            </SelectItem>
                          ))}
                        </Select>
                        <Input
                          label="Starting Capital"
                          type="number"
                          value={overrideAmount}
                          onValueChange={setOverrideAmount}
                          min="0"
                          step="1000"
                          startContent={<span className="text-default-400">₹</span>}
                        />
                        <div className="md:col-span-3">
                          <Button
                            color="primary"
                            onPress={handleAddMonthlyOverride}
                            isDisabled={!overrideAmount}
                            startContent={<Icon icon="lucide:calendar-plus" />}
                          >
                            Set Monthly Override
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Existing Monthly Overrides */}
                    <div>
                      <h4 className="font-semibold mb-3">Monthly Overrides</h4>
                      {sortedMonthlyOverrides.length === 0 ? (
                        <div className="text-center py-8 text-default-500">
                          <Icon icon="lucide:calendar-check" className="text-4xl mb-2 mx-auto" />
                          <p>No monthly overrides set yet.</p>
                          <p className="text-sm">Add an override above to manually set starting capital for specific months.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {sortedMonthlyOverrides.map((override) => (
                            <div key={override.id} className="flex items-center gap-3 p-3 border border-divider rounded-lg">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-300">
                                  <Icon icon="lucide:calendar" className="w-5 h-5" />
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{override.month} {override.year}</span>
                                  <span className="text-sm px-2 py-1 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                                    Override
                                  </span>
                                </div>
                                <div className="text-sm text-default-500 mt-1">
                                  Updated: {new Date(override.updatedAt).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-lg text-primary">
                                  ₹{override.startingCapital.toLocaleString()}
                                </div>
                                <div className="flex gap-1 mt-1">
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    color="danger"
                                    onPress={() => handleRemoveMonthlyOverride(override.month, override.year)}
                                    startContent={<Icon icon="lucide:trash" className="w-3 h-3" />}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Tab>
              </Tabs>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>

            {/* Yearly Starting Capital Modal */}
            <YearlyStartingCapitalModal
              isOpen={isYearlyCapitalModalOpen}
              onOpenChange={setIsYearlyCapitalModalOpen}
            />
          </>
        )}
      </ModalContent>
    </Modal>
  );
}; 