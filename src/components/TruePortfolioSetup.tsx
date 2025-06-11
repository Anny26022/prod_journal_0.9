import React, { useState } from 'react';
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
  Divider
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useTruePortfolio } from '../utils/TruePortfolioContext';

interface TruePortfolioSetupProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSetupComplete: (userName: string) => void;
  userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;
}

export const TruePortfolioSetup: React.FC<TruePortfolioSetupProps> = ({
  isOpen,
  onOpenChange,
  onSetupComplete,
  userName,
  setUserName
}) => {
  const { yearlyStartingCapitals, setYearlyStartingCapital } = useTruePortfolio();
  const [startingCapital, setStartingCapital] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  const handleSetup = () => {
    const amount = parseFloat(startingCapital);
    const year = parseInt(selectedYear);

    if (isNaN(amount) || isNaN(year) || amount <= 0) {
      alert('Please enter a valid amount and year');
      return;
    }

    setYearlyStartingCapital(year, amount);

    // Clear form and close modal
    setStartingCapital('');
    onOpenChange(false);

    // Show success message
    setTimeout(() => {
      alert('✅ Portfolio setup complete! Your True Portfolio system is now active.');
    }, 500);

    onSetupComplete(userName);
  };

  // Check if setup is needed
  const needsSetup = yearlyStartingCapitals.length === 0;

  if (!needsSetup) {
    return null; // Don't show if already set up
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="xl"
      isDismissable={false}
      hideCloseButton={true}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon icon="lucide:rocket" className="text-primary text-xl" />
                <span className="text-lg sm:text-xl font-semibold tracking-tight">Welcome to True Portfolio System!</span>
              </div>
            </ModalHeader>
            <ModalBody className="space-y-6">
              <Card className="bg-content2/50 dark:bg-content2/30 border border-divider shadow-sm">
                <CardBody className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Icon icon="lucide:info" className="text-primary mt-1 flex-shrink-0 text-xl" />
                      <div>
                        <h3 className="font-semibold text-foreground mb-2 text-lg">What's New?</h3>
                        <p className="text-sm text-default-600 mb-3">
                          Your trading journal now uses a <strong className="text-primary">True Portfolio System</strong> that automatically calculates your portfolio size based on:
                        </p>
                        <ul className="text-sm text-default-600 space-y-2">
                          <li className="flex items-center gap-2">
                            <Icon icon="lucide:dollar-sign" className="text-success-600 text-lg" />
                            <span><strong className="text-foreground">Starting Capital</strong> for each year (January)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Icon icon="lucide:arrow-left-right" className="text-warning-600 text-lg" />
                            <span><strong className="text-foreground">Capital Changes</strong> (deposits/withdrawals)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Icon icon="lucide:trending-up" className="text-info-600 text-lg" />
                            <span><strong className="text-foreground">Trading P&L</strong> from your actual trades</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Divider className="my-4" />

              <div className="space-y-4">
                <h4 className="font-semibold text-lg">Set Your Starting Capital</h4>
                <p className="text-sm text-default-600">
                  Enter your starting capital for January {selectedYear}. This will be the foundation for all portfolio calculations.
                </p>
                
                <div className="mt-4">
                  <label htmlFor="userNameInput" className="text-sm font-medium text-default-700 dark:text-default-300 block mb-2">Your Name</label>
                  <Input
                    id="userNameInput"
                    placeholder="Enter your name"
                    value={userName}
                    onValueChange={setUserName}
                    className="w-full"
                    startContent={<Icon icon="lucide:user" className="text-default-400 text-lg" />}
                    isRequired
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Year"
                    labelPlacement="outside"
                    placeholder="e.g., 2025"
                    value={selectedYear}
                    onValueChange={setSelectedYear}
                    type="number"
                    min="2000"
                    max="2099"
                    className="w-full"
                  />
                  <Input
                    label="Starting Capital"
                    labelPlacement="outside"
                    placeholder="e.g., 100000"
                    value={startingCapital}
                    onValueChange={setStartingCapital}
                    type="number"
                    min="0"
                    step="1000"
                    startContent={<span className="text-default-400 text-lg">₹</span>}
                    className="w-full"
                  />
                </div>

                <div className="bg-warning-50 dark:bg-warning-900/20 p-4 rounded-lg border border-warning-200 dark:border-warning-800">
                  <div className="flex items-start gap-3">
                    <Icon icon="lucide:lightbulb" className="text-warning-600 mt-0.5 flex-shrink-0 text-xl" />
                    <div className="text-sm">
                      <p className="font-medium text-warning-800 dark:text-warning-200 mb-1">Pro Tip:</p>
                      <p className="text-warning-700 dark:text-warning-300">
                        You can always add more years and manage capital changes later through the <strong className="text-warning-900 dark:text-warning-100">Portfolio Settings</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                color="primary"
                onPress={handleSetup}
                isDisabled={!userName.trim() || !startingCapital || !selectedYear || parseFloat(startingCapital) <= 0 || parseInt(selectedYear) < 2000 || parseInt(selectedYear) > 2099}
                startContent={<Icon icon="lucide:check-circle" />}
                className="w-full"
                size="md"
                variant="shadow"
                radius="full"
              >
                Set Up Portfolio
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
