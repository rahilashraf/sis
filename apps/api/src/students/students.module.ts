import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [AttendanceModule],
  controllers: [StudentsController],
})
export class StudentsModule {}
