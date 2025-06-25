const express = require('express');
const router = express.Router();
const storyController = require('../controllers/storyController');
const { body, validationResult } = require('express-validator');

// Validation middleware
const validateStoryRequest = [
  body('keywords')
    .isArray({ min: 1, max: 5 })
    .withMessage('Keywords must be an array with 1-5 items'),
  body('keywords.*')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each keyword must be 1-50 characters'),
  body('age')
    .isInt({ min: 1, max: 12 })
    .withMessage('Age must be between 1 and 12'),
  body('characterNames')
    .optional()
    .isArray({ max: 3 })
    .withMessage('Character names must be an array with max 3 items'),
  body('characterNames.*')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Each character name must be 1-30 characters'),
  body('notes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 600 })
    .withMessage('Additional notes must be 600 characters or less')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// POST /v1/story - Generate a new story
router.post('/story', validateStoryRequest, handleValidationErrors, storyController.generate.bind(storyController));

// GET /v1/story/:storyId - Get story by ID
router.get('/story/:storyId', storyController.getStory.bind(storyController));

module.exports = router;