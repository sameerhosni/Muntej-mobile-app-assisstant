// How each idea status looks (chip colour), shared by "Your ideas" and the wish list.
import type { ChipTone } from '@/components/ui/Chip';
import type { IdeaStatus } from './api';

export const STATUS_TONE: Record<IdeaStatus, ChipTone> = { new: 'neutral', planned: 'primary', building: 'amber', done: 'green', not_now: 'neutral' };
