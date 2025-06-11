import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Chip
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useTruePortfolio } from '../utils/TruePortfolioContext';

interface YearlyStartingCapitalModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const YearlyStartingCapitalModal: React.FC<YearlyStartingCapitalModalProps> = ({
  isOpen,
  onOpenChange
}) => {
  const {
    yearlyStartingCapitals,
    setYearlyStartingCapital,
    getYearlyStartingCapital
  } = useTruePortfolio();

  const [newYear, setNewYear] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');
  const [editingYear, setEditingYear] = useState<number | null>(null);
  const [editingAmount, setEditingAmount] = useState<string>('');

  // Get current year and next year for suggestions
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const handleAddYear = () => {
    const year = parseInt(newYear);
    const amount = parseFloat(newAmount);

    if (isNaN(year) || isNaN(amount) || year < 2000 || year > 2100 || amount <= 0) {
      alert('Please enter a valid year (2000-2100) and amount (> 0)');
      return;
    }

    setYearlyStartingCapital(year, amount);
    setNewYear('');
    setNewAmount('');
  };

  const handleEditYear = (year: number) => {
    setEditingYear(year);
    setEditingAmount(getYearlyStartingCapital(year).toString());
  };

  const handleSaveEdit = () => {
    if (editingYear === null) return;

    const amount = parseFloat(editingAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount (> 0)');
      return;
    }

    setYearlyStartingCapital(editingYear, amount);
    setEditingYear(null);
    setEditingAmount('');
  };

  const handleCancelEdit = () => {
    setEditingYear(null);
    setEditingAmount('');
  };

  // Sort years in descending order
  const sortedYears = [...yearlyStartingCapitals].sort((a, b) => b.year - a.year);

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="2xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon icon="lucide:calendar" className="text-primary" />
                <span>Yearly Starting Capital</span>
              </div>
              <p className="text-sm text-default-500 font-normal">
                Set starting capital for January of each year. This forms the basis for true portfolio calculations.
              </p>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-6">
                {/* Add New Year */}
                <Card>
                  <CardHeader>
                    <h3 className="text-lg font-semibold">Add New Year</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody>
                    <div className="flex gap-3 items-end">
                      <Input
                        label="Year"
                        placeholder={`e.g., ${currentYear}, ${nextYear}`}
                        value={newYear}
                        onChange={(e) => setNewYear(e.target.value)}
                        type="number"
                        min="2000"
                        max="2100"
                        className="flex-1"
                      />
                      <Input
                        label="Starting Capital (₹)"
                        placeholder="e.g., 100000"
                        value={newAmount}
                        onChange={(e) => setNewAmount(e.target.value)}
                        type="number"
                        min="0"
                        step="1000"
                        className="flex-2"
                      />
                      <Button
                        color="primary"
                        onPress={handleAddYear}
                        isDisabled={!newYear || !newAmount}
                        startContent={<Icon icon="lucide:plus" />}
                      >
                        Add
                      </Button>
                    </div>
                  </CardBody>
                </Card>

                {/* Existing Years */}
                <Card>
                  <CardHeader>
                    <h3 className="text-lg font-semibold">Existing Years</h3>
                  </CardHeader>
                  <Divider />
                  <CardBody>
                    {sortedYears.length === 0 ? (
                      <div className="text-center py-8 text-default-500">
                        <Icon icon="lucide:calendar-x" className="text-4xl mb-2 mx-auto" />
                        <p>No yearly starting capitals set yet.</p>
                        <p className="text-sm">Add your first year above to get started.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sortedYears.map((yearData) => (
                          <div
                            key={yearData.year}
                            className="flex items-center justify-between p-3 border border-divider rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Chip
                                color={yearData.year === currentYear ? "primary" : "default"}
                                variant={yearData.year === currentYear ? "solid" : "flat"}
                              >
                                {yearData.year}
                                {yearData.year === currentYear && " (Current)"}
                              </Chip>
                              {editingYear === yearData.year ? (
                                <Input
                                  value={editingAmount}
                                  onChange={(e) => setEditingAmount(e.target.value)}
                                  type="number"
                                  min="0"
                                  step="1000"
                                  className="w-48"
                                  size="sm"
                                />
                              ) : (
                                <span className="font-semibold text-lg">
                                  {formatCurrency(yearData.startingCapital)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {editingYear === yearData.year ? (
                                <>
                                  <Button
                                    size="sm"
                                    color="success"
                                    variant="flat"
                                    onPress={handleSaveEdit}
                                    startContent={<Icon icon="lucide:check" />}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    color="danger"
                                    variant="flat"
                                    onPress={handleCancelEdit}
                                    startContent={<Icon icon="lucide:x" />}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="flat"
                                  onPress={() => handleEditYear(yearData.year)}
                                  startContent={<Icon icon="lucide:edit" />}
                                >
                                  Edit
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
