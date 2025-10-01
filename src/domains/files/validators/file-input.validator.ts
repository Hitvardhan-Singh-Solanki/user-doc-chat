import { z } from 'zod';

export const LowContentSchema = z.array(z.string()).default([]);
