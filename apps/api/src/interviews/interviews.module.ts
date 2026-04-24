import { Module } from '@nestjs/common';
import { InterviewEventsController } from './interview-events.controller';
import { InterviewSlotsController } from './interview-slots.controller';
import { InterviewsService } from './interviews.service';

@Module({
  controllers: [InterviewEventsController, InterviewSlotsController],
  providers: [InterviewsService],
})
export class InterviewsModule {}
