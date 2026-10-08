'use client'

import React, { useState, useEffect, useRef, useId } from 'react';
import { Item, GridLineItem } from '@/lib/api/types';
import {
  calculateLineAmount,
  calculateGridTotals,
  validateGridLine,
  GridTotals,
} from '@/lib/calculations/item-grid';
import { formatRupee } from '@/lib/format';

export interface GridRow {
  id: string;
  item_id: string;
  item_name?: string;
  item_code?: string;
  unit: 'PCS' | 'KG';
  pieces: number | '';
  weight_kg: number | '';
  rate: number | '';
  amount: number;
  error?: string;
}

export interface ItemEntryGridProps {
  items: Item[];
  initialRows?: GridRow[];
  onChange?: (validLines: GridLineItem[], subtotal: number, totals: GridTotals) => void;
  disabled?: boolean;
  autoFocusFirstRow?: boolean;
}

const createEmptyRow = (): GridRow => ({
  id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  item_id: '',
  unit: 'KG',
  pieces: '',
  weight_kg: '',
  rate: '',
  amount: 0,
});

export function ItemEntryGrid({
  items,
  initialRows,
  onChange,
  disabled = false,
  autoFocusFirstRow = true,
}: ItemEntryGridProps) {
  const [rows, setRows] = useState<GridRow[]>(() => {
    if (initialRows && initialRows.length > 0) return initialRows;
    return [createEmptyRow()];
  });

  // Track active dropdown and focused cell
  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);
  const [searchQueries, setSearchQueries] = useState<{ [rowId: string]: string }>({});
  const [highlightedDropdownIndex, setHighlightedDropdownIndex] = useState<number>(0);

  // Cell refs for 2D keyboard navigation: cellRefs[rowIndex][colIndex]
  // Columns: 0 = item input, 1 = unit, 2 = qty, 3 = rate
  const cellRefs = useRef<(HTMLElement | null)[][]>([]);

  // Focus initial item cell on mount
  useEffect(() => {
    if (autoFocusFirstRow && cellRefs.current[0]?.[0]) {
      // Delay slightly for modal animation/transition
      const t = setTimeout(() => {
        cellRefs.current[0]?.[0]?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [autoFocusFirstRow]);

  // Recalculate totals and emit to parent whenever rows change
  useEffect(() => {
    const validLines: GridLineItem[] = [];

    for (const r of rows) {
      if (!r.item_id) continue;
      const qty = r.unit === 'PCS' ? Number(r.pieces) || 0 : Number(r.weight_kg) || 0;
      const rate = Number(r.rate) || 0;
      if (qty <= 0 || rate <= 0) continue;

      validLines.push({
        id: r.id,
        item_id: r.item_id,
        item_name: r.item_name,
        item_code: r.item_code,
        unit: r.unit,
        pieces: r.unit === 'PCS' ? Math.floor(qty) : 0,
        weight_kg: r.unit === 'KG' ? qty : 0,
        rate,
        amount: r.amount,
      });
    }

    const totals = calculateGridTotals(validLines);
    if (onChange) {
      onChange(validLines, totals.subtotal, totals);
    }
  }, [rows, onChange]);

  // Handle row deletion
  const handleDeleteRow = (index: number) => {
    if (disabled) return;
    if (rows.length <= 1) {
      // Reset only row to empty
      setRows([createEmptyRow()]);
      setSearchQueries({});
      return;
    }
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
  };

  // Select item from combobox
  const handleSelectItem = (rowIndex: number, item: Item) => {
    const defaultUnit = item.default_unit || (item.allowed_units === 'PCS' ? 'PCS' : 'KG');
    const updated = [...rows];
    const currentRow = updated[rowIndex];

    currentRow.item_id = item.id;
    currentRow.item_name = item.name;
    currentRow.item_code = item.code;
    currentRow.unit = defaultUnit;
    currentRow.error = undefined;

    // Recalculate if qty and rate exist
    const qty = currentRow.unit === 'PCS' ? Number(currentRow.pieces) || 0 : Number(currentRow.weight_kg) || 0;
    const rate = Number(currentRow.rate) || 0;
    currentRow.amount = calculateLineAmount(currentRow.unit, qty, rate);

    // Auto-append new empty row if this was the last row
    if (rowIndex === updated.length - 1) {
      updated.push(createEmptyRow());
    }

    setRows(updated);
    setActiveDropdownIndex(null);
    setSearchQueries((prev) => ({ ...prev, [currentRow.id]: item.name }));

    // Focus next cell (col 1: unit, or col 2: qty)
    setTimeout(() => {
      cellRefs.current[rowIndex]?.[2]?.focus();
    }, 10);
  };

  // Change unit in a row
  const handleUnitChange = (rowIndex: number, newUnit: 'PCS' | 'KG') => {
    const updated = [...rows];
    const r = updated[rowIndex];
    r.unit = newUnit;

    const item = items.find((i) => i.id === r.item_id);
    const validation = validateGridLine(r, item);
    r.error = validation.isValid ? undefined : validation.error;

    const qty = r.unit === 'PCS' ? Number(r.pieces) || 0 : Number(r.weight_kg) || 0;
    const rate = Number(r.rate) || 0;
    r.amount = calculateLineAmount(r.unit, qty, rate);

    setRows(updated);
  };

  // Change quantity in a row
  const handleQtyChange = (rowIndex: number, val: string) => {
    const updated = [...rows];
    const r = updated[rowIndex];
    const num = val === '' ? '' : parseFloat(val);

    if (r.unit === 'PCS') {
      r.pieces = num === '' ? '' : Math.floor(Math.max(0, num));
    } else {
      r.weight_kg = num === '' ? '' : Math.max(0, num);
    }

    const qty = r.unit === 'PCS' ? Number(r.pieces) || 0 : Number(r.weight_kg) || 0;
    const rate = Number(r.rate) || 0;
    r.amount = calculateLineAmount(r.unit, qty, rate);

    const item = items.find((i) => i.id === r.item_id);
    const validation = validateGridLine(r, item);
    r.error = validation.isValid ? undefined : validation.error;

    setRows(updated);
  };

  // Change rate in a row
  const handleRateChange = (rowIndex: number, val: string) => {
    const updated = [...rows];
    const r = updated[rowIndex];
    const num = val === '' ? '' : parseFloat(val);
    r.rate = num === '' ? '' : Math.max(0, num);

    const qty = r.unit === 'PCS' ? Number(r.pieces) || 0 : Number(r.weight_kg) || 0;
    const rate = Number(r.rate) || 0;
    r.amount = calculateLineAmount(r.unit, qty, rate);

    const item = items.find((i) => i.id === r.item_id);
    const validation = validateGridLine(r, item);
    r.error = validation.isValid ? undefined : validation.error;

    setRows(updated);
  };

  // Handle cell keyboard navigation (Tab/Enter, Ctrl+Delete, Arrow keys)
  const handleCellKeyDown = (
    e: React.KeyboardEvent,
    rowIndex: number,
    colIndex: number,
  ) => {
    // Ctrl+Delete or Cmd+Delete removes current row
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      handleDeleteRow(rowIndex);
      return;
    }

    // In Item input dropdown handling
    if (colIndex === 0 && activeDropdownIndex === rowIndex) {
      const query = (searchQueries[rows[rowIndex].id] || '').toLowerCase().trim();
      const filtered = items.filter(
        (it) =>
          it.name.toLowerCase().includes(query) ||
          (it.code && it.code.toLowerCase().includes(query)),
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedDropdownIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedDropdownIndex((prev) =>
          prev <= 0 ? filtered.length - 1 : prev - 1,
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[highlightedDropdownIndex]) {
          handleSelectItem(rowIndex, filtered[highlightedDropdownIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveDropdownIndex(null);
        return;
      }
    }

    // Enter navigation: advance to next cell or next row's item
    if (e.key === 'Enter') {
      e.preventDefault();
      if (colIndex < 3) {
        // Move to next cell in current row
        cellRefs.current[rowIndex]?.[colIndex + 1]?.focus();
      } else {
        // Last cell in row (rate): move to next row's item cell
        const nextRow = rowIndex + 1;
        if (cellRefs.current[nextRow]?.[0]) {
          cellRefs.current[nextRow]?.[0]?.focus();
        }
      }
    }
  };

  const totals = calculateGridTotals(rows);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <div
        style={{
          border: '1px solid #E9E0D7',
          borderRadius: 8,
          overflow: 'visible',
          background: '#FFF',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#FAF6F2', borderBottom: '1px solid #E9E0D7' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#7A7268', textTransform: 'uppercase', width: '38%' }}>
                Item / Description
              </th>
              <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, color: '#7A7268', textTransform: 'uppercase', width: '14%' }}>
                Unit
              </th>
              <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, color: '#7A7268', textTransform: 'uppercase', width: '16%' }}>
                Quantity
              </th>
              <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, color: '#7A7268', textTransform: 'uppercase', width: '16%' }}>
                Rate (₹)
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#7A7268', textTransform: 'uppercase', width: '16%' }}>
                Amount (₹)
              </th>
              <th style={{ width: 36, padding: '10px 4px' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const itemConfig = items.find((it) => it.id === row.item_id);
              const allowedUnits = itemConfig?.allowed_units || 'BOTH';
              const query = (searchQueries[row.id] ?? row.item_name ?? '').toLowerCase().trim();
              const filteredItems = items.filter(
                (it) =>
                  it.name.toLowerCase().includes(query) ||
                  (it.code && it.code.toLowerCase().includes(query)),
              );
              const isDropdownOpen = activeDropdownIndex === rowIndex;

              if (!cellRefs.current[rowIndex]) {
                cellRefs.current[rowIndex] = [];
              }

              return (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid #F0EAE1',
                    background: rowIndex % 2 === 0 ? '#FFFFFF' : '#FCFAF7',
                  }}
                >
                  {/* Column 0: Item search combobox */}
                  <td style={{ padding: '8px 10px', position: 'relative' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        ref={(el) => { cellRefs.current[rowIndex][0] = el; }}
                        type="text"
                        disabled={disabled}
                        placeholder="Type item name or code..."
                        value={searchQueries[row.id] ?? row.item_name ?? ''}
                        onFocus={() => {
                          setActiveDropdownIndex(rowIndex);
                          setHighlightedDropdownIndex(0);
                        }}
                        onChange={(e) => {
                          setSearchQueries((prev) => ({ ...prev, [row.id]: e.target.value }));
                          setActiveDropdownIndex(rowIndex);
                          setHighlightedDropdownIndex(0);
                        }}
                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 0)}
                        style={{
                          width: '100%',
                          minHeight: 36,
                          border: row.error && !row.item_id ? '1px solid #DC2626' : '1px solid #D5CBC0',
                          borderRadius: 6,
                          padding: '0 8px',
                          fontSize: 13,
                          outlineColor: '#9B1C31',
                          background: '#FFF',
                        }}
                      />

                      {/* Dropdown menu */}
                      {isDropdownOpen && filteredItems.length > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            zIndex: 50,
                            background: '#FFF',
                            border: '1px solid #D5CBC0',
                            borderRadius: 6,
                            marginTop: 3,
                            maxHeight: 200,
                            overflowY: 'auto',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                          }}
                        >
                          {filteredItems.map((it, idx) => (
                            <div
                              key={it.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectItem(rowIndex, it);
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                background: idx === highlightedDropdownIndex ? '#F9EDEF' : 'transparent',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px solid #F5EFEB',
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 600, color: '#2B2B2B', fontSize: 13 }}>
                                  {it.name}
                                </span>
                                {it.code && (
                                  <span
                                    style={{
                                      marginLeft: 6,
                                      fontSize: 10,
                                      background: '#F0E8DE',
                                      color: '#9B1C31',
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {it.code}
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: 11, color: '#7A7268' }}>
                                {it.stock_kg > 0 ? `${it.stock_kg.toFixed(3)} Kg` : `${it.stock_pieces} Pcs`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Column 1: Unit Selection */}
                  <td style={{ padding: '8px 6px' }}>
                    <select
                      ref={(el) => { cellRefs.current[rowIndex][1] = el; }}
                      disabled={disabled || !row.item_id}
                      value={row.unit}
                      onChange={(e) => handleUnitChange(rowIndex, e.target.value as 'PCS' | 'KG')}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 1)}
                      style={{
                        width: '100%',
                        minHeight: 36,
                        border: '1px solid #D5CBC0',
                        borderRadius: 6,
                        padding: '0 6px',
                        fontSize: 12,
                        background: '#FFF',
                        outlineColor: '#9B1C31',
                      }}
                    >
                      {allowedUnits === 'BOTH' && (
                        <>
                          <option value="KG">KG (Weight)</option>
                          <option value="PCS">PCS (Pieces)</option>
                        </>
                      )}
                      {allowedUnits === 'KG' && <option value="KG">KG (Weight)</option>}
                      {allowedUnits === 'PCS' && <option value="PCS">PCS (Pieces)</option>}
                    </select>
                  </td>

                  {/* Column 2: Quantity Input */}
                  <td style={{ padding: '8px 6px' }}>
                    <input
                      ref={(el) => { cellRefs.current[rowIndex][2] = el; }}
                      type="number"
                      disabled={disabled || !row.item_id}
                      step={row.unit === 'KG' ? '0.001' : '1'}
                      min={row.unit === 'KG' ? '0.001' : '1'}
                      placeholder={row.unit === 'KG' ? '0.000' : '1'}
                      value={row.unit === 'KG' ? row.weight_kg : row.pieces}
                      onChange={(e) => handleQtyChange(rowIndex, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 2)}
                      style={{
                        width: '100%',
                        minHeight: 36,
                        border: row.error ? '1px solid #DC2626' : '1px solid #D5CBC0',
                        borderRadius: 6,
                        padding: '0 8px',
                        fontSize: 13,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        outlineColor: '#9B1C31',
                        background: '#FFF',
                      }}
                    />
                  </td>

                  {/* Column 3: Rate Input */}
                  <td style={{ padding: '8px 6px' }}>
                    <input
                      ref={(el) => { cellRefs.current[rowIndex][3] = el; }}
                      type="number"
                      disabled={disabled || !row.item_id}
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={row.rate}
                      onChange={(e) => handleRateChange(rowIndex, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 3)}
                      style={{
                        width: '100%',
                        minHeight: 36,
                        border: '1px solid #D5CBC0',
                        borderRadius: 6,
                        padding: '0 8px',
                        fontSize: 13,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        outlineColor: '#9B1C31',
                        background: '#FFF',
                      }}
                    />
                  </td>

                  {/* Column 4: Amount Display (Read-Only) */}
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#2B2B2B', fontVariantNumeric: 'tabular-nums' }}>
                    {formatRupee(row.amount)}
                  </td>

                  {/* Column 5: Remove button */}
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleDeleteRow(rowIndex)}
                      title="Remove Row (Ctrl+Delete)"
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: '#9CA3AF',
                        fontSize: 16,
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 4,
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Grid Footer Summary & Shortcuts Helper */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 4px',
          fontSize: 11,
          color: '#7A7268',
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <span>⌨ <strong>Tab/Enter</strong>: Next cell</span>
          <span>⌨ <strong>Ctrl+Delete</strong>: Delete row</span>
          <span>⌨ <strong>↑/↓</strong>: Item dropdown</span>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {totals.totalPieces > 0 && (
            <span>Total Pieces: <strong>{totals.totalPieces}</strong></span>
          )}
          {totals.totalWeightKg > 0 && (
            <span>Total Weight: <strong>{totals.totalWeightKg.toFixed(3)} Kg</strong></span>
          )}
          <span style={{ fontSize: 13, color: '#2B2B2B' }}>
            Subtotal: <strong style={{ color: '#9B1C31', fontSize: 14 }}>{formatRupee(totals.subtotal)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
