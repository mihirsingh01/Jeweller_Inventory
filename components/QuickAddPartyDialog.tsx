'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Party } from '@/lib/api/types';
import { createParty } from '@/lib/api/services';

interface QuickAddPartyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'CUSTOMER' | 'SUPPLIER' | 'KARIGAR';
  onSuccess: (newParty: Party) => void;
  targetFocusRef?: React.RefObject<HTMLElement | null>;
}

export function QuickAddPartyDialog({
  isOpen,
  onClose,
  type,
  onSuccess,
  targetFocusRef,
}: QuickAddPartyDialogProps) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [workTypes, setWorkTypes] = useState<string[]>(['Polish']);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setMobile('');
      setAddress('');
      setWorkTypes(['Polish']);
      setOpeningBalance(0);
      setError(null);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const title =
    type === 'CUSTOMER'
      ? 'Add Customer (Alt+C)'
      : type === 'SUPPLIER'
      ? 'Add Supplier (Alt+S)'
      : 'Add Karigar (Alt+K)';

  const apiPartyType = type === 'SUPPLIER' ? 'SUPPLIER' : type === 'KARIGAR' ? 'BOTH' : 'CUSTOMER';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Party name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await createParty({
        name: name.trim(),
        type: apiPartyType,
        whatsapp_number: mobile.trim() ? mobile.trim() : undefined,
        address: address.trim() || undefined,
        work_types: type === 'KARIGAR' ? workTypes.join(', ') : undefined,
        opening_balance: openingBalance || 0,
      });

      onSuccess(created);
      onClose();

      // Shift focus to the next field in the host form
      setTimeout(() => {
        targetFocusRef?.current?.focus();
      }, 50);
    } catch (err: any) {
      setError(err.message || 'Failed to create party');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleWorkType = (wt: string) => {
    setWorkTypes((prev) =>
      prev.includes(wt) ? prev.filter((t) => t !== wt) : [...prev, wt],
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          border: '1px solid #E8DFD5',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #EFEAE3',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FAF6EF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, color: '#9B1C31', fontWeight: 700 }}>◉</span>
            <h3 style={{ margin: 0, fontSize: 16, color: '#2B2B2B', fontWeight: 700 }}>{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: '#66615C',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          {error && (
            <div
              style={{
                background: '#FEE2E2',
                color: '#991B1B',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Name <span style={{ color: '#9B1C31' }}>*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              required
              placeholder={type === 'KARIGAR' ? 'e.g. Ramesh Babu (Artisan)' : 'e.g. Rajasthan Jewellers'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #D5CCC1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Mobile Number (10 digits)
            </label>
            <input
              type="text"
              placeholder="e.g. 9829012345 or +919829012345"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #D5CCC1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
            <span style={{ fontSize: 11, color: '#888', marginTop: 2, display: 'block' }}>
              Stored securely for WhatsApp billing. Masked for staff privacy.
            </span>
          </div>

          {type === 'KARIGAR' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Work Types
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Polish', 'Meena', 'Stone Setting', 'Casting'].map((wt) => {
                  const selected = workTypes.includes(wt);
                  return (
                    <button
                      key={wt}
                      type="button"
                      onClick={() => toggleWorkType(wt)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 20,
                        border: selected ? '1.5px solid #9B1C31' : '1px solid #D5CCC1',
                        background: selected ? '#FAF0F1' : '#FFFFFF',
                        color: selected ? '#9B1C31' : '#444',
                        fontWeight: selected ? 600 : 400,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {selected ? '✓ ' : ''}{wt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Address / City
            </label>
            <input
              type="text"
              placeholder="e.g. Johri Bazaar, Jaipur"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #D5CCC1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Opening Balance (₹)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={openingBalance || ''}
              onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #D5CCC1',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                border: '1px solid #D5CCC1',
                background: '#FFFFFF',
                color: '#444',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '9px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#9B1C31',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: 13,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? 'Saving...' : 'Save & Select'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
