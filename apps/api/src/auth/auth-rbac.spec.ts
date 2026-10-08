import { ForbiddenException, UnauthorizedException, BadRequestException, NotFoundException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtStrategy } from './jwt.strategy';
import { SanitizeInputInterceptor } from '../common/interceptors/sanitize-input.interceptor';
import { SalesService } from '../sales/sales.service';
import { DatabaseService } from '../database/database.service';
import { of } from 'rxjs';

describe('Auth, RBAC, and Staff Isolation Tests', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let jwtStrategy: JwtStrategy;
  let mockDbService: Partial<DatabaseService>;
  let sanitizeInterceptor: SanitizeInputInterceptor;
  let salesService: SalesService;

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);

    mockDbService = {
      query: jest.fn(),
    };

    jwtStrategy = new JwtStrategy(mockDbService as DatabaseService);
    sanitizeInterceptor = new SanitizeInputInterceptor();
    const mockEventEmitter = { emitEntrySaved: jest.fn() } as any;
    salesService = new SalesService(mockDbService as DatabaseService, mockEventEmitter);
  });

  const createMockContext = (user: any, requiredRoles?: string[], isPublic = false): ExecutionContext => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === 'isPublic') return isPublic;
      if (key === 'roles') return requiredRoles;
      return null;
    });

    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  describe('1. Staff Management Route Protection (Owner Only)', () => {
    it('STAFF cannot call any staff-management route (throws 403 Forbidden)', () => {
      const staffUser = { id: 'staff-1', role: 'STAFF', isActive: true };
      const context = createMockContext(staffUser, ['OWNER']);

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('OWNER can successfully access staff-management route', () => {
      const ownerUser = { id: 'owner-1', role: 'OWNER', isActive: true };
      const context = createMockContext(ownerUser, ['OWNER']);

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('DENY BY DEFAULT: Authenticated user accessing route without @Roles or @Public is rejected', () => {
      const user = { id: 'staff-1', role: 'STAFF', isActive: true };
      const context = createMockContext(user, undefined, false);

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('2. Immediate Revocation of Deactivated User Token', () => {
    it("A deactivated user's token stops working immediately during JWT validation", async () => {
      // Simulate user marked inactive in the database
      (mockDbService.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'user-deactivated', is_active: false, role: 'STAFF' }],
      });

      await expect(
        jwtStrategy.validate({ sub: 'user-deactivated' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('RolesGuard immediately blocks requests from users whose isActive flag is false', () => {
      const deactivatedUser = { id: 'staff-2', role: 'STAFF', isActive: false };
      const context = createMockContext(deactivatedUser, ['STAFF', 'OWNER']);

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('3. Staff Isolation on Entries', () => {
    it("STAFF cannot read another staff member's entry via direct API call", async () => {
      const staffA = { id: 'staff-a-id', name: 'Staff A', username: 'staffa', role: 'STAFF' as const, isActive: true };
      const staffBId = 'staff-b-id';

      // Mock database returning sale created by Staff B
      (mockDbService.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'sale-123',
            created_by: staffBId,
            is_deleted: false,
            total_amount: 5000,
          },
        ],
      });

      // Attempt by Staff A to read Staff B's entry returns 404 (not 403) to prevent enumeration
      await expect(salesService.findOne('sale-123', staffA)).rejects.toThrow(NotFoundException);
    });

    it('OWNER can successfully read entries created by any staff member', async () => {
      const owner = { id: 'owner-id', name: 'Mihir (Owner)', username: 'mihir', role: 'OWNER' as const, isActive: true };
      const staffBId = 'staff-b-id';

      // Mock database returning sale created by Staff B
      (mockDbService.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sale-123',
              created_by: staffBId,
              is_deleted: false,
              total_amount: 5000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // lines query

      const result = await salesService.findOne('sale-123', owner);
      expect(result.id).toBe('sale-123');
      expect(result.created_by).toBe(staffBId);
    });

    it('STAFF listing sales only receives queries scoped to their own created_by ID', async () => {
      const staffA = { id: 'staff-a-id', name: 'Staff A', username: 'staffa', role: 'STAFF' as const, isActive: true };

      (mockDbService.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await salesService.findAll(staffA);

      // Verify SQL contains created_by filter
      const calledQuery = (mockDbService.query as jest.Mock).mock.calls[0][0];
      const calledParams = (mockDbService.query as jest.Mock).mock.calls[0][1];

      expect(calledQuery).toContain('s.created_by = $1');
      expect(calledParams).toContain('staff-a-id');
    });

    it('STAFF attempting to delete or edit entry is blocked by RolesGuard (Owner only)', () => {
      const staffUser = { id: 'staff-1', role: 'STAFF', isActive: true };
      const deleteContext = createMockContext(staffUser, ['OWNER']);

      expect(() => rolesGuard.canActivate(deleteContext)).toThrow(ForbiddenException);
    });
  });

  describe('4. Strict Server-Owned Timestamp & Field Rejection', () => {
    it('Requests that try to set entry_at are rejected with 400 Bad Request', () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              party_id: 'some-uuid',
              entry_at: '2026-01-01T00:00:00Z',
              total_amount: 15000,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler = {
        handle: () => of(true),
      };

      expect(() =>
        sanitizeInterceptor.intercept(mockExecutionContext, mockCallHandler),
      ).toThrow(BadRequestException);
    });

    it('Requests that try to set created_by or is_deleted are rejected with 400 Bad Request', () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              party_id: 'some-uuid',
              created_by: 'malicious-injected-id',
            },
          }),
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler = {
        handle: () => of(true),
      };

      expect(() =>
        sanitizeInterceptor.intercept(mockExecutionContext, mockCallHandler),
      ).toThrow(BadRequestException);
    });

    it('Clean request payload without server-owned fields passes through successfully', (done) => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: {
              party_id: 'some-uuid',
              total_amount: 15000,
              due_date: '2026-10-15',
            },
          }),
        }),
      } as unknown as ExecutionContext;

      const mockCallHandler = {
        handle: () => of({ success: true }),
      };

      sanitizeInterceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((res) => {
        expect(res).toEqual({ success: true });
        done();
      });
    });
  });
});
