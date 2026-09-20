import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PostsModule } from '../posts/posts.module';
import { AdsModule } from '../ads/ads.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MediaModule } from '../media/media.module';
import { MarketModule } from '../market/market.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PostsModule, AdsModule, AnalyticsModule, MediaModule, MarketModule, AuthModule],
  providers: [TasksService],
})
export class TasksModule {}
