import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { GradebookModule } from '../gradebook/gradebook.module';

@Module({
  imports: [GradebookModule],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
