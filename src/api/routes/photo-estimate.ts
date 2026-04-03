import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import crypto from 'crypto';

export const photoEstimateRouter = Router();

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/calories/photo-log
 * Log a calorie entry with a photo reference.
 */
photoEstimateRouter.post('/photo-log', async (req: Request, res: Response) => {
  const { image, description, meal_type, calories, protein_g, carbs_g, fat_g } =
    req.body as Record<string, unknown>;

  if (!description || typeof description !== 'string') {
    res
      .status(400)
      .json({ error: 'description is required and must be a string' });
    return;
  }

  if (!meal_type || typeof meal_type !== 'string') {
    res
      .status(400)
      .json({ error: 'meal_type is required and must be a string' });
    return;
  }

  if (calories === undefined || calories === null) {
    res.status(400).json({ error: 'calories is required' });
    return;
  }

  const calNum = Number(calories);
  if (isNaN(calNum) || calNum < 0) {
    res.status(400).json({ error: 'calories must be a non-negative number' });
    return;
  }

  // Validate image if provided
  let imageSize = 0;
  if (image !== undefined && image !== null) {
    if (typeof image !== 'string') {
      res.status(400).json({ error: 'image must be a base64 string' });
      return;
    }
    imageSize = Math.ceil((image.length * 3) / 4);
    if (imageSize > MAX_IMAGE_SIZE_BYTES) {
      res.status(413).json({
        error: `Image exceeds maximum size of 5MB (got ${Math.round(imageSize / 1024 / 1024)}MB)`,
      });
      return;
    }
  }

  try {
    const id = crypto.randomUUID();
    const source = image ? 'photo' : 'manual';

    await query(
      `INSERT INTO lifeos.calorie_log (id, meal_type, description, calories, protein_g, carbs_g, fat_g, log_date, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, $8)`,
      id,
      meal_type,
      description,
      calNum,
      protein_g !== undefined ? Number(protein_g) : null,
      carbs_g !== undefined ? Number(carbs_g) : null,
      fat_g !== undefined ? Number(fat_g) : null,
      source,
    );

    res.json({
      success: true,
      id,
      source,
      image_size: imageSize,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
