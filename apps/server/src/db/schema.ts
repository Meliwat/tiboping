import type {
  Category,
  ClassificationResult,
  DestinationType,
  NormalizedPost,
  Routing,
} from '@tiboping/core';

export type StoredPost = NormalizedPost &
  ClassificationResult & {
    classifierVersion: number;
    ingestedAt: string;
  };

export type DestinationState = 'active' | 'paused';

export type Destination = {
  id: string;
  type: DestinationType;
  name: string;
  routing: Routing;
  state: DestinationState;
  pauseReason?: string;
  hasConfiguration: true;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryState = 'pending' | 'sending' | 'delivered' | 'failed' | 'cancelled';

export type Delivery = {
  id: string;
  postId: string;
  destinationId: string;
  state: DeliveryState;
  attemptCount: number;
  nextAttemptAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClassifiedPostInput = {
  post: NormalizedPost;
  classification: ClassificationResult;
};

export type CategoryList = Category[];
