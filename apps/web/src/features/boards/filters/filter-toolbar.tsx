'use client';

import type { Member } from '@teamboard/shared';
import { ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type CardFilters, type DueFilter, EMPTY_FILTERS, isFiltering, UNASSIGNED } from './filter-cards';

const SEARCH_DEBOUNCE_MS = 200;
const ANY_DUE = 'any';

const DUE_OPTIONS: { value: DueFilter | typeof ANY_DUE; label: string }[] = [
  { value: ANY_DUE, label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Due this week' },
  { value: 'none', label: 'No due date' },
];

interface Option {
  value: string;
  label: string;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const id = useId();
  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Filter by ${label.toLowerCase()}`}>
          {label}
          {selected.length > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] tabular-nums">
              {selected.length}
            </span>
          )}
          <ChevronDownIcon aria-hidden className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        {options.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">Nothing to filter by yet.</p>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {options.map((option) => {
              const optionId = `${id}-${option.value}`;
              return (
                <li
                  key={option.value}
                  className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <Checkbox
                    id={optionId}
                    checked={selected.includes(option.value)}
                    onCheckedChange={(checked) => toggle(option.value, checked === true)}
                  />
                  <Label htmlFor={optionId} className="flex-1 cursor-pointer font-normal">
                    {option.label}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface FilterToolbarProps {
  filters: CardFilters;
  onChange: (next: CardFilters) => void;
  members: Member[];
  labels: string[];
  shown: number;
  total: number;
}

export function FilterToolbar({ filters, onChange, members, labels, shown, total }: FilterToolbarProps) {
  const [query, setQuery] = useState(filters.query);

  // Keep the box in sync when the URL changes elsewhere (Clear, back/forward).
  useEffect(() => setQuery(filters.query), [filters.query]);

  useEffect(() => {
    if (query === filters.query) return;
    const timer = setTimeout(() => onChange({ ...filters, query }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, filters, onChange]);

  const assigneeOptions: Option[] = [
    { value: UNASSIGNED, label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full sm:w-64">
        <SearchIcon
          className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cards"
          aria-label="Search cards"
          className="h-8 pl-8"
        />
      </div>
      <MultiSelect
        label="Assignee"
        options={assigneeOptions}
        selected={filters.assignees}
        onChange={(assignees) => onChange({ ...filters, assignees })}
      />
      <MultiSelect
        label="Label"
        options={labels.map((l) => ({ value: l, label: l }))}
        selected={filters.labels}
        onChange={(next) => onChange({ ...filters, labels: next })}
      />
      <Select
        value={filters.due ?? ANY_DUE}
        onValueChange={(value) =>
          onChange({ ...filters, due: value === ANY_DUE ? null : (value as DueFilter) })
        }
      >
        <SelectTrigger size="sm" className="w-40" aria-label="Filter by due date">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DUE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isFiltering(filters) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          <XIcon aria-hidden />
          Clear filters
        </Button>
      )}
      <p className="text-muted-foreground ml-auto text-xs" aria-live="polite" data-testid="filter-status">
        {isFiltering(filters) ? `Showing ${shown} of ${total} cards` : `${total} cards`}
      </p>
    </div>
  );
}
