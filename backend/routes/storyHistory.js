/**
 * Story History Routes
 * Provides API endpoints for managing user story history
 */
const express = require('express');
const router = express.Router();
const { ensureFullAuth } = require('../middleware/authMiddleware');
const { Story } = require('../models');
const { get } = require('../services/redisService');
const config = require('../config');

/**
 * GET /api/stories - Get user's story history
 */
router.get('/', ensureFullAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get stories from database, ordered by creation date
    const stories = await Story.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      attributes: [
        'story_id',
        'title', 
        'child_name',
        'child_age',
        'story_style',
        'status',
        'preview_text',
        'is_favorite',
        'created_at',
        'updated_at'
      ]
    });

    // Group stories by time periods (like chat history)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const groupedStories = {
      today: [],
      week: [],
      month: [],
      older: []
    };

    stories.forEach(story => {
      const storyDate = new Date(story.created_at);
      
      if (storyDate >= today) {
        groupedStories.today.push(story);
      } else if (storyDate >= sevenDaysAgo) {
        groupedStories.week.push(story);
      } else if (storyDate >= thirtyDaysAgo) {
        groupedStories.month.push(story);
      } else {
        groupedStories.older.push(story);
      }
    });

    res.json({
      success: true,
      stories: groupedStories,
      total: stories.length
    });

  } catch (error) {
    console.error(`[STORY_HISTORY] Error fetching story history for user ${req.user?.id}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch story history'
    });
  }
});

/**
 * GET /api/stories/:storyId - Get specific story
 */
router.get('/:storyId', ensureFullAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { storyId } = req.params;

    // First check Redis for the story (might be more recent) - using cache versioning like chat
    const cache_version = config.cache.version;
    const redisKey = `story:${cache_version}:${storyId}`;
    const redisStory = await get(redisKey);
    
    if (redisStory) {
      const storyData = JSON.parse(redisStory);
      // Verify this story belongs to the user (basic security check)
      const dbStory = await Story.findOne({
        where: { story_id: storyId, user_id: userId }
      });
      
      if (!dbStory) {
        return res.status(404).json({
          success: false,
          error: 'Story not found'
        });
      }

      return res.json({
        success: true,
        story: storyData
      });
    }

    // If not in Redis, get from database
    const story = await Story.findOne({
      where: { story_id: storyId, user_id: userId }
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }

    res.json({
      success: true,
      story: {
        story_id: story.story_id,
        title: story.title,
        status: story.status,
        ...story.story_data
      }
    });

  } catch (error) {
    console.error(`[STORY_HISTORY] Error fetching story ${req.params.storyId} for user ${req.user?.id}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch story'
    });
  }
});

/**
 * PUT /api/stories/:storyId/favorite - Toggle favorite status
 */
router.put('/:storyId/favorite', ensureFullAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { storyId } = req.params;

    const story = await Story.findOne({
      where: { story_id: storyId, user_id: userId }
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }

    // Toggle favorite status
    story.is_favorite = !story.is_favorite;
    await story.save();

    res.json({
      success: true,
      is_favorite: story.is_favorite
    });

  } catch (error) {
    console.error('Error updating favorite status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update favorite status'
    });
  }
});

/**
 * DELETE /api/stories/:storyId - Delete story
 */
router.delete('/:storyId', ensureFullAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { storyId } = req.params;

    const story = await Story.findOne({
      where: { story_id: storyId, user_id: userId }
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'Story not found'
      });
    }

    await story.destroy();

    res.json({
      success: true,
      message: 'Story deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete story'
    });
  }
});

module.exports = router;