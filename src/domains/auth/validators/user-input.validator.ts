import z from 'zod';

export const UserInputSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty').max(2000),
  context: z.string().optional().default('(No context provided)'),
  chatHistory: z.array(z.string()).optional().default([]),
});
