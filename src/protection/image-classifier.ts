import type { MediaClassification } from '../types/activity.js';

export interface ImageClassificationInput {
  activityId: string;
  localPath?: string;
}

/**
 * Placeholder for an optional on-device classifier.
 * It never uploads a photo and never recognizes a face.
 * `unclassified` forces manual review. It is not evidence that a photo is safe to delete.
 */
export class LocalImageClassifier {
  readonly uploadsPhotos = false;
  readonly usesFacialRecognition = false;

  classify(_input: ImageClassificationInput): MediaClassification {
    return 'unclassified';
  }
}
