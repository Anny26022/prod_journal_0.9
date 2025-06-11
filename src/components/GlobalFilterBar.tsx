import React from "react";
import { useGlobalFilter } from "../context/GlobalFilterContext";
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Input, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";

const filterOptions = [
  { key: "all", label: "All Time" },
  { key: "week", label: "Past 1 Week" },
  { key: "month", label: "Past 1 Month" },
  { key: "fy", label: "This FY" },
  { key: "cy", label: "This CY" },
  { key: "pick-month", label: "Pick Month/Year" },
  { key: "custom", label: "Custom Range" },
];

const months = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
];
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

export const GlobalFilterBar: React.FC = () => {
  const { filter, setFilter } = useGlobalFilter();

  // Handler to clear all storage
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear ALL app data? This cannot be undone.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 border-b border-divider bg-background/80">
      <Dropdown>
        <DropdownTrigger>
          <Button variant="flat" className="font-medium">
            {filterOptions.find(opt => opt.key === filter.type)?.label || "All Time"}
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Global Filter"
          selectionMode="single"
          selectedKeys={[filter.type === "month" ? "pick-month" : filter.type === "custom" ? "custom" : filter.type]}
          onSelectionChange={keys => {
            const selected = Array.from(keys)[0] as string;
            if (selected === "pick-month") {
              setFilter({ type: "month", month: new Date().getMonth(), year: new Date().getFullYear() });
            } else if (selected === "custom") {
              setFilter({ type: "custom", startDate: new Date(), endDate: new Date() });
            } else {
              setFilter({ type: selected as any });
            }
          }}
        >
          {filterOptions.map(opt => (
            <DropdownItem key={opt.key}>{opt.label}</DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
      {/* Month/Year Picker */}
      {filter.type === "month" && (
        <>
          <Dropdown>
            <DropdownTrigger>
              <Button variant="flat">
                {months[filter.month ?? new Date().getMonth()]}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Select Month"
              selectionMode="single"
              selectedKeys={[String(filter.month ?? new Date().getMonth())]}
              onSelectionChange={keys => {
                const monthIdx = Number(Array.from(keys)[0]);
                setFilter(f => ({ ...f, type: "month", month: monthIdx }));
              }}
            >
              {months.map((m, idx) => (
                <DropdownItem key={idx}>{m}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
          <Dropdown>
            <DropdownTrigger>
              <Button variant="flat">
                {filter.year ?? new Date().getFullYear()}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Select Year"
              selectionMode="single"
              selectedKeys={[String(filter.year ?? new Date().getFullYear())]}
              onSelectionChange={keys => {
                const year = Number(Array.from(keys)[0]);
                setFilter(f => ({ ...f, type: "month", year }));
              }}
            >
              {years.map(y => (
                <DropdownItem key={y}>{y}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </>
      )}
      {/* Custom Range Picker */}
      {filter.type === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            label="Start Date"
            value={filter.startDate ? new Date(filter.startDate).toISOString().slice(0, 10) : ""}
            onChange={e => {
              const date = e.target.value ? new Date(e.target.value) : undefined;
              setFilter(f => ({ ...f, startDate: date }));
            }}
            size="sm"
          />
          <span>-</span>
          <Input
            type="date"
            label="End Date"
            value={filter.endDate ? new Date(filter.endDate).toISOString().slice(0, 10) : ""}
            onChange={e => {
              const date = e.target.value ? new Date(e.target.value) : undefined;
              setFilter(f => ({ ...f, endDate: date }));
            }}
            size="sm"
          />
        </div>
      )}
      <div className="flex-1" />
      <Tooltip content="Clear All Data" placement="bottom">
        <Button
          isIconOnly
          size="sm"
          variant="bordered"
          color="danger"
          onPress={handleClearAll}
          className="ml-auto"
        >
          <Icon icon="lucide:trash" className="text-lg" />
        </Button>
      </Tooltip>
    </div>
  );
}; 