import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales/sales.service';
import { PurchasesService } from './purchases/purchases.service';
import { JobWorkService } from './job-work/job-work.service';
import { DatabaseService } from './database/database.service';
import { DomainEventEmitter } from './common/events/domain-event.emitter';

describe('Entries, Atomic Transactions, Ledger & Stock Tests', () => {
  let mockDb: any;
  let mockClient: any;
  let mockEventEmitter: any;
  let salesService: SalesService;
  let purchasesService: PurchasesService;
  let jobWorkService: JobWorkService;

  const staffUser = {
    id: 'staff-1111-1111',
    name: 'Amit Verma (Staff)',
    username: 'amit',
    role: 'STAFF' as const,
    isActive: true,
  };

  const ownerUser = {
    id: 'owner-0000-0000',
    name: 'Mihir Sharma (Owner)',
    username: 'mihir',
    role: 'OWNER' as const,
    isActive: true,
  };

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
    };

    mockDb = {
      query: jest.fn(),
      withTransaction: jest.fn(async (callback) => {
        return await callback(mockClient);
      }),
    };

    mockEventEmitter = {
      emitEntrySaved: jest.fn(),
    };

    salesService = new SalesService(mockDb as DatabaseService, mockEventEmitter as DomainEventEmitter);
    purchasesService = new PurchasesService(mockDb as DatabaseService, mockEventEmitter as DomainEventEmitter);
    jobWorkService = new JobWorkService(mockDb as DatabaseService, mockEventEmitter as DomainEventEmitter);
  });

  describe('1. Validation Rules', () => {
    it('Rejects sale line when both pieces and weight (Kg) are zero', async () => {
      const invalidDto = {
        party_id: 'party-1',
        due_date: '2026-10-15',
        lines: [
          { item_id: 'item-1', pieces: 0, weight_kg: 0, rate: 5000 },
        ],
      };

      await expect(salesService.create(invalidDto, staffUser)).rejects.toThrow(BadRequestException);
    });

    it('Rejects negative values for rate, pieces or weight', async () => {
      const negativeDto = {
        party_id: 'party-1',
        due_date: '2026-10-15',
        lines: [
          { item_id: 'item-1', pieces: -5, weight_kg: 0, rate: 5000 },
        ],
      };

      await expect(salesService.create(negativeDto, staffUser)).rejects.toThrow(BadRequestException);
    });

    it('Rejects sale when stock is insufficient', async () => {
      const saleDto = {
        party_id: 'party-1',
        due_date: '2026-10-15',
        lines: [
          { item_id: 'item-gold', pieces: 10, weight_kg: 0.5, rate: 7000 },
        ],
      };

      // Mock party, item, and available stock: only 2 pieces and 0.1 Kg available
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'party-1', name: 'Party 1' }] }) // party query
        .mockResolvedValueOnce({ rows: [{ id: 'item-gold', name: 'Gold Item', allowed_units: 'BOTH', default_unit: 'PCS' }] }) // item query
        .mockResolvedValueOnce({ rows: [{ stock_pieces: 2, stock_kg: 0.1 }] }); // stock query

      await expect(salesService.create(saleDto, staffUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Atomic Transaction, Ledger & Stock Movements', () => {
    it('Creates Sale with stock deduction, customer ledger debit, and domain event in ONE transaction', async () => {
      const saleDto = {
        party_id: 'cust-123',
        due_date: '2026-10-20',
        gst_rate: 0,
        lines: [
          { item_id: 'item-silver', unit: 'KG' as const, pieces: 5, weight_kg: 1.25, rate: 80000 },
        ],
      };

      // 1. Stock check: ample stock
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'cust-123', name: 'Rajasthan Jewellers', whatsapp_number: '+919876543210' }] }) // party check
        .mockResolvedValueOnce({ rows: [{ id: 'item-silver', name: 'Silver Item', allowed_units: 'BOTH', default_unit: 'KG' }] }) // item check
        .mockResolvedValueOnce({ rows: [{ stock_pieces: 100, stock_kg: 50.0 }] }) // stock check
        .mockResolvedValueOnce({ rows: [{ id: 'sale-999', bill_no: 1005, party_id: 'cust-123', total_amount: 100000 }] }) // sale insert
        .mockResolvedValueOnce({ rows: [] }) // line insert
        .mockResolvedValueOnce({ rows: [] }) // stock movement insert
        .mockResolvedValueOnce({ rows: [] }) // ledger insert
        .mockResolvedValueOnce({ rows: [] }) // audit log insert
        .mockResolvedValueOnce({ rows: [] }); // notification outbox insert

      const result = await salesService.create(saleDto, staffUser);

      expect(result.id).toBe('sale-999');

      // Verify stock movement was negative delta
      const stockCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO stock_movements'),
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[1]).toEqual(['item-silver', 'sale-999', -5, -1.25]);

      // Verify ledger entry was customer debit
      const ledgerCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO ledger_entries'),
      );
      expect(ledgerCall).toBeDefined();
      expect(ledgerCall[1]).toEqual(['cust-123', 'sale-999', 100000]);

      // Verify Domain Event emitted
      expect(mockEventEmitter.emitEntrySaved).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            type: 'SALE',
            id: 'sale-999',
            amount: 100000,
          }),
        }),
      );
    });

    it('Rolls back transaction completely if any operation fails', async () => {
      const purchaseDto = {
        party_id: 'supp-123',
        lines: [
          { item_id: 'item-gold', pieces: 2, weight_kg: 0.1, rate: 65000 },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'purch-1', total_amount: 6500 }] }) // purchase insert
        .mockRejectedValueOnce(new Error('Foreign key violation on item_id')); // line insert fails!

      await expect(purchasesService.create(purchaseDto, staffUser)).rejects.toThrow('Foreign key violation');
    });
  });

  describe('3. Staff Isolation', () => {
    it('STAFF cannot read another staff member entry via direct API call', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'sale-other', created_by: 'other-staff-id', is_deleted: false, total_amount: 5000 },
        ],
      });

      await expect(salesService.findOne('sale-other', staffUser)).rejects.toThrow(NotFoundException);
    });

    it('STAFF cannot edit or delete entries (Owner only)', async () => {
      await expect(salesService.update('sale-1', {}, staffUser)).rejects.toThrow(ForbiddenException);
      await expect(salesService.softDelete('sale-1', staffUser)).rejects.toThrow(ForbiddenException);
      await expect(purchasesService.update('purch-1', {}, staffUser)).rejects.toThrow(ForbiddenException);
      await expect(jobWorkService.update('jw-1', {}, staffUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('4. Owner Edit with Reversing Rows and Audit Log', () => {
    it('Owner edit writes reversing ledger/stock rows and writes to audit_log before and after JSON', async () => {
      const existingSale = {
        id: 'sale-edit-1',
        party_id: 'cust-1',
        total_amount: 10000,
        due_date: '2026-10-10',
      };

      const existingLines = [
        { item_id: 'item-1', pieces: 2, weight_kg: 0.5, rate: 5000, amount: 10000 },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [existingSale] }) // find existing
        .mockResolvedValueOnce({ rows: existingLines }) // find existing lines
        .mockResolvedValueOnce({ rows: [] }) // reversing ledger
        .mockResolvedValueOnce({ rows: [] }) // reversing stock
        .mockResolvedValueOnce({ rows: [] }) // re-apply ledger
        .mockResolvedValueOnce({ rows: [{ ...existingSale, notes: 'Updated notes' }] }) // update header
        .mockResolvedValueOnce({ rows: [] }); // audit log insert

      const result = await salesService.update('sale-edit-1', { notes: 'Updated notes' }, ownerUser);

      expect(result).toBeDefined();

      // Verify reversing ledger entry was credited
      const revLedger = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('SALE_REVERSAL'),
      );
      expect(revLedger).toBeDefined();

      // Verify audit log call was recorded
      const auditCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO audit_log'),
      );
      expect(auditCall).toBeDefined();
      expect(auditCall[0]).toContain('UPDATE');
      expect(auditCall[0]).toContain('sales');
      expect(auditCall[1][0]).toBe(ownerUser.id);
      expect(auditCall[1][1]).toBe('sale-edit-1');
    });
  });

  describe('5. Polish & Meena Job Work Engine', () => {
    it('Creates Job Work issue and adjusts stock in Kg only', async () => {
      const jwDto = {
        work_type: 'POLISH' as const,
        party_id: 'artisan-1',
        item_id: 'item-silver-raw',
        direction: 'ISSUE' as const,
        weight_kg: 2.500,
        charge_amount: 1500.0,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'jw-1', ...jwDto }] })
        .mockResolvedValueOnce({ rows: [] }) // stock movement
        .mockResolvedValueOnce({ rows: [] }); // charge ledger entry

      const result = await jobWorkService.create(jwDto, staffUser);

      expect(result.id).toBe('jw-1');

      // Verify stock movement was POLISH_ISSUE in Kg
      const stockCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO stock_movements') && call[1]?.[1] === 'POLISH_ISSUE',
      );
      expect(stockCall).toBeDefined();
      expect(stockCall[1][4]).toBe(-2.5); // negative kg delta
    });
  });
});
