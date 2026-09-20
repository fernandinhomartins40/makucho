import { Module } from '@nestjs/common';
import { HomepageController } from './homepage.controller';
import { HomepageService } from './homepage.service';
import { PostsModule } from '../posts/posts.module';
import { VideosModule } from '../videos/videos.module';
import { CategoriesModule } from '../categories/categories.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [PostsModule, VideosModule, CategoriesModule, MarketModule],
  controllers: [HomepageController],
  providers: [HomepageService],
  exports: [HomepageService],
})
export class HomepageModule {}
