import React from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button
} from "@heroui/react";
import { Icon } from "@iconify/react";

interface WelcomeMessageModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
}

export const WelcomeMessageModal: React.FC<WelcomeMessageModalProps> = ({ isOpen, onOpenChange, userName }) => {
  const firstName = userName.split(' ')[0];

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="md" isDismissable={false} hideCloseButton={true}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:sparkles" className="text-primary text-xl" />
            <span className="text-xl font-semibold tracking-tight">Welcome, {firstName || 'Trader'}!</span>
          </div>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <p className="text-base text-default-700 dark:text-default-300">
            We're thrilled to have you join. Get ready to feel <strong className="text-primary-600 dark:text-primary-400">something truly good</strong> about your trading journal!
          </p>
          <p className="text-sm text-default-500">
            Your True Portfolio System is now set up and ready to empower your trading journey.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            color="primary"
            onPress={() => onOpenChange(false)}
            startContent={<Icon icon="lucide:check-circle" />}
            className="w-full"
            size="md"
            variant="shadow"
            radius="full"
          >
            Let's Go!
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}; 