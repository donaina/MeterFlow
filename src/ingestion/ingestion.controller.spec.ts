import { Test, TestingModule } from '@nestjs/testing';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';

describe('IngestionController', () => {
  let controller: IngestionController;
  let service: IngestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionController],
      providers: [
        {
          provide: IngestionService,
          useValue: {
            ingest: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<IngestionController>(IngestionController);
    service = module.get<IngestionService>(IngestionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return 202 Accepted when event is accepted', async () => {
    const dto = {
      event_id: 'evt_1',
      customer_id: 'cust_1',
      feature_key: 'tasks',
      quantity: 1,
      timestamp: '2026-08-30T10:00:00Z',
    };

    jest.spyOn(service, 'ingest').mockResolvedValue({
      status: 'accepted',
      eventId: 'evt_1',
      timestamp: '2026-08-30T10:00:01Z',
    });

    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    await controller.ingest(dto, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
    expect(mockResponse.json).toHaveBeenCalledWith({
      status: 'accepted',
      event_id: 'evt_1',
      timestamp: '2026-08-30T10:00:01Z',
    });
  });

  it('should return 200 OK when event is a duplicate', async () => {
    const dto = {
      event_id: 'evt_1',
      customer_id: 'cust_1',
      feature_key: 'tasks',
      quantity: 1,
      timestamp: '2026-08-30T10:00:00Z',
    };

    jest.spyOn(service, 'ingest').mockResolvedValue({
      status: 'duplicate',
      eventId: 'evt_1',
      message: 'Event already recorded',
    });

    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    await controller.ingest(dto, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(mockResponse.json).toHaveBeenCalledWith({
      status: 'duplicate',
      event_id: 'evt_1',
      message: 'Event already recorded',
    });
  });
});
