import { z } from 'zod';

export const chatInputSchema = z.object({
  message: z.string().min(1, 'Message required').max(4000, 'Message too long'),
});

export type ChatInput = z.infer<typeof chatInputSchema>;
