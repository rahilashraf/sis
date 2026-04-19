import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SchoolsModule } from './schools/schools.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { LinksModule } from './links/links.module';
import { ClassesModule } from './classes/classes.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ParentsModule } from './parents/parents.module';
import { StudentsModule } from './students/students.module';
import { SchoolYearsModule } from './school-years/school-years.module';
import { GradesModule } from './grades/grades.module';
import { ReportingPeriodsModule } from './reporting-periods/reporting-periods.module';
import { GradeLevelsModule } from './grade-levels/grade-levels.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { GradeScalesModule } from './grade-scales/grade-scales.module';
import { ReRegistrationModule } from './re-registration/re-registration.module';
import { StudentDocumentsModule } from './student-documents/student-documents.module';
import { FormsModule } from './forms/forms.module';
import { EnrollmentHistoryModule } from './enrollment-history/enrollment-history.module';
import { BehaviorModule } from './behavior/behavior.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SchoolsModule,
    UsersModule,
    AuthModule,
    LinksModule,
    ClassesModule,
    AttendanceModule,
    ParentsModule,
    StudentsModule,
    SchoolYearsModule,
    GradesModule,
    ReportingPeriodsModule,
    GradeLevelsModule,
    AssessmentsModule,
    GradeScalesModule,
    ReRegistrationModule,
    StudentDocumentsModule,
    FormsModule,
    EnrollmentHistoryModule,
    BehaviorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
