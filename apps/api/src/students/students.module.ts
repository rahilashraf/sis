import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { AttendanceModule } from '../attendance/attendance.module';
import { StudentsService } from './students.service';
import { GradebookModule } from '../gradebook/gradebook.module';
import { ReRegistrationModule } from '../re-registration/re-registration.module';

@Module({
  imports: [AttendanceModule, GradebookModule, ReRegistrationModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
