import GPConnectService from '../../src/services/GPConnectService';
import { db } from '../../src/config/database';

// Mock database
jest.mock('../../src/config/database');
const mockDb = db as jest.Mocked<typeof db>;

describe('GPConnectService', () => {
  let service: GPConnectService;

  beforeEach(() => {
    service = new GPConnectService();
    jest.clearAllMocks();
  });

  describe('getPracticeByODS', () => {
    it('should return practice when found', async () => {
      const mockPractice = {
        id: '1',
        ods_code: 'A12345',
        name: 'Test Practice',
        gp_connect_endpoint: 'https://test.endpoint',
        asid: 'TEST123',
        active: true
      };

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockPractice)
      } as any);

      const result = await service.getPracticeByODS('A12345');
      expect(result).toEqual(mockPractice);
    });

    it('should return null when practice not found', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      } as any);

      const result = await service.getPracticeByODS('NOTFOUND');
      expect(result).toBeNull();
    });
  });

  describe('searchAvailableSlots', () => {
    it('should return mock slots in development mode', async () => {
      process.env.NODE_ENV = 'development';
      
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: '1',
          ods_code: 'A12345',
          name: 'Test Practice',
          gp_connect_endpoint: 'https://test.endpoint',
          asid: 'TEST123',
          active: true
        })
      } as any);

      const slots = await service.searchAvailableSlots('A12345', '2024-12-01', '2024-12-07');
      
      expect(slots).toBeDefined();
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]).toHaveProperty('id');
      expect(slots[0]).toHaveProperty('start');
      expect(slots[0]).toHaveProperty('end');
      expect(slots[0]).toHaveProperty('status');
      expect(slots[0]).toHaveProperty('practitioner');
    });
  });
});
