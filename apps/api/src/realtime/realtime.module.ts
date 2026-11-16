import { Global, Module } from '@nestjs/common';
import { BoardEventsService } from './board-events.service';
import { BoardGateway } from './board.gateway';

/** Global so any service can publish board events after a commit. */
@Global()
@Module({
  providers: [BoardGateway, BoardEventsService],
  exports: [BoardEventsService],
})
export class RealtimeModule {}
